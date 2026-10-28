import { GATE_KINDS, INPUT_KINDS, PRIMITIVE_PINS } from './primitives';
import type { ChipDef, Circuit, Library, Part, PrimitiveKind, Wire } from './types';

export class CompileError extends Error {}

export interface NetNode {
  /** 경로형 id (예: `dff1/latch/or2`) */
  path: string;
  kind: PrimitiveKind;
  /** 입력 핀별 Net 인덱스, -1 = 연결 없음(0) */
  ins: number[];
  out: number;
  hz?: number;
}

export interface Netlist {
  /** Net 인덱스 → id. id는 그 Net을 구동하는 기본 부품의 경로. */
  netIds: string[];
  nodes: NetNode[];
  /** `${부품 경로}.${핀}` → Net 인덱스 (-1 = 0 상수). 모든 깊이의 부품 핀을 담는다. */
  pinNet: Map<string, number>;
  /** 사용자 입력(SWITCH/PUSH) 경로 → Net */
  inputs: Map<string, { net: number; kind: PrimitiveKind }>;
  /** 최상위 회로의 핀이 가리키는 Net */
  topNets: number[];
}

export const pinKey = (path: string, pin: string) => `${path}.${pin}`;

interface Scope {
  prefix: string;
  circuit: Circuit;
  parent: Scope | null;
  instanceId: string | null;
  chip: ChipDef | null;
  parts: Map<string, Part>;
  wiresTo: Map<string, Wire>;
  children: Map<string, Scope>;
}

/** 칩 라이브러리에서 순환 참조를 찾는다. 있으면 순환 경로(칩 id 목록)를 돌려준다. */
export function findChipCycle(library: Library): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    const def = library[id];
    if (!def) return null;
    state.set(id, 'visiting');
    stack.push(id);
    for (const p of def.circuit.parts) {
      if (p.kind.type !== 'chip') continue;
      const found = visit(p.kind.chipId);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of Object.keys(library)) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

function makeScope(prefix: string, circuit: Circuit, parent: Scope | null, instanceId: string | null, chip: ChipDef | null): Scope {
  const wiresTo = new Map<string, Wire>();
  for (const w of circuit.wires) wiresTo.set(pinKey(w.to.partId, w.to.pin), w);
  return {
    prefix,
    circuit,
    parent,
    instanceId,
    chip,
    parts: new Map(circuit.parts.map((p) => [p.id, p])),
    wiresTo,
    children: new Map(),
  };
}

/**
 * 회로를 기본 게이트만으로 된 넷리스트로 평탄화한다 (SPEC 5.1).
 * 칩의 입력 핀(내부 SWITCH/PUSH)과 출력 핀(내부 LED)은 지연 없는 별칭으로 처리해
 * 칩 경계가 타이밍에 영향을 주지 않게 한다.
 */
export function compile(circuit: Circuit, library: Library = {}): Netlist {
  const root = makeScope('', circuit, null, null, null);
  const scopes: Scope[] = [];

  const expand = (scope: Scope, stack: string[]) => {
    scopes.push(scope);
    for (const part of scope.circuit.parts) {
      if (part.kind.type !== 'chip') continue;
      const { chipId } = part.kind;
      if (stack.includes(chipId)) throw new CompileError(`칩 순환 참조: ${[...stack, chipId].map((id) => library[id]?.name ?? id).join(' → ')}`);
      const def = library[chipId];
      if (!def) throw new CompileError(`라이브러리에 없는 칩입니다: ${chipId} (${scope.prefix}${part.id})`);
      const child = makeScope(`${scope.prefix}${part.id}/`, def.circuit, scope, part.id, def);
      scope.children.set(part.id, child);
      expand(child, [...stack, chipId]);
    }
  };
  expand(root, []);

  const netIds: string[] = [];
  const netIndex = new Map<string, number>();
  const netOf = (id: string) => {
    let i = netIndex.get(id);
    if (i === undefined) {
      i = netIds.length;
      netIds.push(id);
      netIndex.set(id, i);
    }
    return i;
  };

  const memo = new Map<string, number>();
  const resolving = new Set<string>();

  const driverOfInput = (scope: Scope, partId: string, pin: string): number => {
    const w = scope.wiresTo.get(pinKey(partId, pin));
    return w ? outputNet(scope, w.from.partId, w.from.pin) : -1;
  };

  function outputNet(scope: Scope, partId: string, pin: string): number {
    const key = pinKey(scope.prefix + partId, pin);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    // 칩 입력을 자기 출력에 바로 잇는 식의 별칭 고리는 0으로 끊는다
    if (resolving.has(key)) return -1;
    resolving.add(key);
    const part = scope.parts.get(partId);
    let net = -1;
    if (part?.kind.type === 'chip') {
      const child = scope.children.get(partId)!;
      const out = child.chip!.outputs.find((o) => o.name === pin);
      net = out ? driverOfInput(child, out.partId, 'a') : -1;
    } else if (part) {
      const asChipInput = scope.chip && INPUT_KINDS.has(part.kind.kind) ? scope.chip.inputs.find((i) => i.partId === part.id) : undefined;
      if (asChipInput) net = driverOfInput(scope.parent!, scope.instanceId!, asChipInput.name);
      else if (PRIMITIVE_PINS[part.kind.kind].some((p) => p.name === pin && p.dir === 'out')) net = netOf(scope.prefix + part.id);
    }
    resolving.delete(key);
    memo.set(key, net);
    return net;
  }

  const nodes: NetNode[] = [];
  const pinNet = new Map<string, number>();
  const inputs = new Map<string, { net: number; kind: PrimitiveKind }>();

  for (const scope of scopes) {
    for (const part of scope.circuit.parts) {
      const path = scope.prefix + part.id;
      if (part.kind.type === 'chip') {
        const def = scope.children.get(part.id)!.chip!;
        for (const i of def.inputs) pinNet.set(pinKey(path, i.name), driverOfInput(scope, part.id, i.name));
        for (const o of def.outputs) pinNet.set(pinKey(path, o.name), outputNet(scope, part.id, o.name));
        continue;
      }
      const kind = part.kind.kind;
      const pins = PRIMITIVE_PINS[kind];
      for (const p of pins) {
        pinNet.set(pinKey(path, p.name), p.dir === 'in' ? driverOfInput(scope, part.id, p.name) : outputNet(scope, part.id, p.name));
      }
      if (GATE_KINDS.has(kind)) {
        nodes.push({
          path,
          kind,
          ins: pins.filter((p) => p.dir === 'in').map((p) => pinNet.get(pinKey(path, p.name))!),
          out: pinNet.get(pinKey(path, 'y'))!,
        });
      } else if (kind === 'CLOCK') {
        nodes.push({ path, kind, ins: [], out: pinNet.get(pinKey(path, 'y'))!, hz: part.props?.hz ?? 1 });
      } else if (INPUT_KINDS.has(kind)) {
        const net = pinNet.get(pinKey(path, 'y'))!;
        // 칩 입력으로 쓰인 SWITCH/PUSH는 바깥 신호의 별칭이므로 사용자 입력이 아니다
        if (net >= 0 && netIds[net] === path) {
          inputs.set(path, { net, kind });
          nodes.push({ path, kind, ins: [], out: net });
        }
      }
    }
  }

  const topNets = new Set<number>();
  for (const part of circuit.parts) {
    const prefix = `${part.id}.`;
    const pins = part.kind.type === 'chip' ? [...root.children.get(part.id)!.chip!.inputs, ...root.children.get(part.id)!.chip!.outputs] : PRIMITIVE_PINS[part.kind.kind];
    for (const p of pins) {
      const net = pinNet.get(prefix + p.name);
      if (net !== undefined && net >= 0) topNets.add(net);
    }
  }

  return { netIds, nodes, pinNet, inputs, topNets: [...topNets] };
}
