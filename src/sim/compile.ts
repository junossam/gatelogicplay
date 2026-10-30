import { bitKey, partBits, partPinSpecs, pinSpec, lutTable } from './pins';
import { GATE_KINDS, INPUT_KINDS } from './primitives';
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
  /** 진리표 부품: 입력 조합 번호(A가 가장 높은 자리) → 이 출력 비트 */
  lut?: Uint8Array;
}

export interface Netlist {
  /** Net 인덱스 → id. id는 그 Net을 구동하는 기본 부품의 경로. */
  netIds: string[];
  nodes: NetNode[];
  /** `${부품 경로}.${핀}` → Net 인덱스 (-1 = 0 상수). 모든 깊이의 부품 핀을 담는다. N비트 핀의 k번 비트는 키 끝에 `[k]`. */
  pinNet: Map<string, number>;
  /** 사용자 입력(SWITCH/PUSH) 경로 → Net. N비트 스위치의 k번 비트는 경로 끝에 `[k]`. */
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

  // 핀 하나 = 비트 수만큼의 Net 인덱스 배열 (-1 = 연결 없음, 0)
  const memo = new Map<string, number[]>();
  const resolving = new Set<string>();
  const none = (w: number) => Array<number>(w).fill(-1);
  const fit = (nets: number[], w: number) => (nets.length === w ? nets : Array.from({ length: w }, (_, k) => nets[k] ?? -1));

  const driverOfInput = (scope: Scope, partId: string, pin: string, width: number): number[] => {
    const w = scope.wiresTo.get(pinKey(partId, pin));
    return w ? fit(outputNets(scope, w.from.partId, w.from.pin), width) : none(width);
  };

  function outputNets(scope: Scope, partId: string, pin: string): number[] {
    const key = pinKey(scope.prefix + partId, pin);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const part = scope.parts.get(partId);
    const spec = part ? pinSpec(part, pin, library) : undefined;
    const width = spec?.width ?? 1;
    // 칩 입력을 자기 출력에 바로 잇는 식의 별칭 고리는 0으로 끊는다
    if (resolving.has(key)) return none(width);
    resolving.add(key);
    let nets = none(width);
    if (part?.kind.type === 'chip') {
      const child = scope.children.get(partId)!;
      const out = child.chip!.outputs.find((o) => o.name === pin);
      nets = out ? driverOfInput(child, out.partId, 'a', width) : none(width);
    } else if (part && spec?.dir === 'out') {
      const kind = part.kind.kind;
      const asChipInput = scope.chip && INPUT_KINDS.has(kind) ? scope.chip.inputs.find((i) => i.partId === part.id) : undefined;
      if (asChipInput) nets = driverOfInput(scope.parent!, scope.instanceId!, asChipInput.name, width);
      else if (kind === 'SPLIT') {
        // 나누기: yk = 입력 버스의 k번 비트 (지연 없는 배선)
        nets = [driverOfInput(scope, partId, 'a', partBits(part))[Number(pin.slice(1))] ?? -1];
      } else if (kind === 'MERGE') {
        // 묶기: y의 k번 비트 = ak
        nets = Array.from({ length: width }, (_, k) => driverOfInput(scope, partId, `a${k}`, 1)[0]!);
      } else if (kind === 'LUT') {
        // 출력 핀이 여러 개라 핀마다 Net을 따로 둔다
        nets = [netOf(pinKey(scope.prefix + part.id, pin))];
      } else nets = Array.from({ length: width }, (_, k) => netOf(bitKey(scope.prefix + part.id, k)));
    }
    resolving.delete(key);
    memo.set(key, nets);
    return nets;
  }

  const nodes: NetNode[] = [];
  const pinNet = new Map<string, number>();
  const inputs = new Map<string, { net: number; kind: PrimitiveKind }>();
  /** 핀의 모든 비트 Net을 기록: 0번 비트는 `${경로}.${핀}`, k번은 `[k]`를 붙인 키 */
  const record = (path: string, pin: string, nets: number[]) => nets.forEach((n, k) => pinNet.set(bitKey(pinKey(path, pin), k), n));
  const pinNets = (path: string, pin: string, width: number) => Array.from({ length: width }, (_, k) => pinNet.get(bitKey(pinKey(path, pin), k)) ?? -1);

  for (const scope of scopes) {
    for (const part of scope.circuit.parts) {
      const path = scope.prefix + part.id;
      const specs = partPinSpecs(part, library);
      for (const p of specs) {
        record(path, p.name, p.dir === 'in' ? driverOfInput(scope, part.id, p.name, p.width) : outputNets(scope, part.id, p.name));
      }
      if (part.kind.type === 'chip') continue;
      const kind = part.kind.kind;
      const bits = partBits(part);
      if (GATE_KINDS.has(kind)) {
        // N비트 게이트 = 비트마다 1비트 게이트 (비트 연산)
        const ins = specs.filter((p) => p.dir === 'in').map((p) => pinNets(path, p.name, bits));
        const outs = pinNets(path, 'y', bits);
        for (let k = 0; k < bits; k++) nodes.push({ path: bitKey(path, k), kind, ins: ins.map((v) => v[k]!), out: outs[k]! });
      } else if (kind === 'LUT') {
        const ins = specs.filter((p) => p.dir === 'in').map((p) => pinNets(path, p.name, 1)[0]!);
        const table = lutTable(part);
        specs
          .filter((p) => p.dir === 'out')
          .forEach((p, j) => {
            const lut = Uint8Array.from(table, (row) => (row >> j) & 1);
            nodes.push({ path: pinKey(path, p.name), kind, ins, out: pinNets(path, p.name, 1)[0]!, lut });
          });
      } else if (kind === 'VCC') {
        // 비트마다 상수 1 노드. GND는 노드 없이 Net이 0으로 남는다.
        const outs = pinNets(path, 'y', bits);
        for (let k = 0; k < bits; k++) nodes.push({ path: bitKey(path, k), kind, ins: [], out: outs[k]! });
      } else if (kind === 'CLOCK') {
        nodes.push({ path, kind, ins: [], out: pinNet.get(pinKey(path, 'y'))!, hz: part.props?.hz ?? 1 });
      } else if (INPUT_KINDS.has(kind)) {
        const outs = pinNets(path, 'y', bits);
        for (let k = 0; k < bits; k++) {
          const net = outs[k]!;
          const id = bitKey(path, k);
          // 칩 입력으로 쓰인 SWITCH/PUSH는 바깥 신호의 별칭이므로 사용자 입력이 아니다
          if (net >= 0 && netIds[net] === id) {
            inputs.set(id, { net, kind });
            nodes.push({ path: id, kind, ins: [], out: net });
          }
        }
      }
    }
  }

  const topNets = new Set<number>();
  for (const part of circuit.parts) {
    for (const p of partPinSpecs(part, library)) {
      for (const net of pinNets(part.id, p.name, p.width)) if (net >= 0) topNets.add(net);
    }
  }

  return { netIds, nodes, pinNet, inputs, topNets: [...topNets] };
}
