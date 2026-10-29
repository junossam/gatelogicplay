// 칩 라이브러리: 의존성 그래프, 칩 생성/갱신, 범위를 칩으로, 가져오기 병합 (SPEC 4.2, 8, 9장)
import { boundary } from '../sim/boundary';
import { findChipCycle } from '../sim/compile';
import { orderedIO, type PinOrder } from '../sim/truthTable';
import type { ChipDef, Circuit, Library, Part, Wire } from '../sim/types';

export const CHIP_COLORS = ['chip-1', 'chip-2', 'chip-3', 'chip-4', 'chip-5'] as const;

export function directDeps(def: Pick<ChipDef, 'circuit'>): Set<string> {
  return new Set(def.circuit.parts.flatMap((p) => (p.kind.type === 'chip' ? [p.kind.chipId] : [])));
}

/** 칩이 (간접적으로라도) 쓰는 모든 칩 */
export function allDeps(id: string, lib: Library): Set<string> {
  const seen = new Set<string>();
  const visit = (cid: string) => {
    const def = lib[cid];
    if (!def) return;
    for (const d of directDeps(def)) {
      if (!seen.has(d)) {
        seen.add(d);
        visit(d);
      }
    }
  };
  visit(id);
  return seen;
}

/** 이 칩을 직접 포함하는 칩 */
export function usedBy(id: string, lib: Library): ChipDef[] {
  return Object.values(lib).filter((d) => directDeps(d).has(id));
}

export function circuitUses(circuit: Circuit, id: string): boolean {
  return circuit.parts.some((p) => p.kind.type === 'chip' && p.kind.chipId === id);
}

/** host 칩을 편집하는 중에 insert 칩을 넣으면 순환이 생기는가 (SPEC 9.1) */
export function wouldCreateCycle(hostId: string | null, insertId: string, lib: Library): boolean {
  if (hostId === null) return false;
  return insertId === hostId || allDeps(insertId, lib).has(hostId);
}

export function uniqueName(name: string, lib: Library, exceptId?: string): string {
  const taken = new Set(Object.values(lib).filter((d) => d.id !== exceptId).map((d) => d.name));
  if (!taken.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
}

/** 부품 id 접두어: 칩 이름의 영숫자, 없으면 'chip' */
export function instancePrefix(def: Pick<ChipDef, 'name'> | undefined): string {
  return (def?.name ?? '').replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'chip';
}

export function nextPartId(prefix: string, parts: Part[]): string {
  const used = new Set(parts.map((p) => p.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export interface PinSpec {
  /** 입력 SWITCH/PUSH 또는 출력 LED 부품 id → 핀 이름 */
  names: Record<string, string>;
  order: PinOrder;
  /** 핀으로 쓰지 않을 입력/출력 부품 id (칩 안에 남지만 핀이 되지 않는다) */
  exclude: string[];
}

/** 칩 핀 정의: 순서는 order, 이름은 names(없으면 라벨, 없으면 id). exclude에 든 부품은 핀에서 뺀다. */
export function chipPinsFrom(circuit: Circuit, spec?: Partial<PinSpec>): Pick<ChipDef, 'inputs' | 'outputs'> {
  const io = orderedIO(circuit, spec?.order);
  const skip = new Set(spec?.exclude ?? []);
  const name = (p: Part) => spec?.names?.[p.id] ?? p.label ?? p.id;
  return {
    inputs: io.inputs.filter((p) => !skip.has(p.id)).map((p) => ({ name: name(p), partId: p.id })),
    outputs: io.outputs.filter((p) => !skip.has(p.id)).map((p) => ({ name: name(p), partId: p.id })),
  };
}

/** 전선이 하나도 연결되지 않은 입력(SWITCH/PUSH)·출력(LED) 부품 — 칩 핀 후보에서 기본으로 뺀다 */
export function unwiredIO(circuit: Circuit): Set<string> {
  const io = orderedIO(circuit);
  const wired = new Set(circuit.wires.flatMap((w) => [w.from.partId, w.to.partId]));
  return new Set([...io.inputs, ...io.outputs].filter((p) => !wired.has(p.id)).map((p) => p.id));
}

/** 핀 이름 검사: 비어 있으면 안 되고, 입력·출력 전체에서 겹치면 안 된다 (전선이 이름으로 핀을 가리키므로) */
export function pinNameErrors(pins: Pick<ChipDef, 'inputs' | 'outputs'>): string[] {
  const errors: string[] = [];
  const all = [...pins.inputs, ...pins.outputs];
  if (all.some((p) => !p.name.trim())) errors.push('핀 이름은 비워 둘 수 없습니다.');
  const dup = all.map((p) => p.name).filter((n, i, arr) => n && arr.indexOf(n) !== i);
  if (dup.length) errors.push(`핀 이름이 겹칩니다: ${[...new Set(dup)].join(', ')}`);
  if (/[./:]/.test(all.map((p) => p.name).join(''))) errors.push('핀 이름에는 . / : 를 쓸 수 없습니다.');
  return errors;
}

/** 칩 핀이 사라지면 그 핀에 꽂혀 있던 전선 (회로 하나) */
export function danglingWires(circuit: Circuit, lib: Library): Wire[] {
  const parts = new Map(circuit.parts.map((p) => [p.id, p]));
  const pinOk = (partId: string, pin: string, dir: 'in' | 'out') => {
    const part = parts.get(partId);
    if (!part) return false;
    if (part.kind.type === 'primitive') return true;
    const def = lib[part.kind.chipId];
    if (!def) return true; // 없는 칩은 컴파일 오류로 알린다
    return (dir === 'in' ? def.inputs : def.outputs).some((p) => p.name === pin);
  };
  return circuit.wires.filter((w) => !pinOk(w.from.partId, w.from.pin, 'out') || !pinOk(w.to.partId, w.to.pin, 'in'));
}

export function pruneDangling(circuit: Circuit, lib: Library): Circuit {
  const bad = new Set(danglingWires(circuit, lib).map((w) => w.id));
  return bad.size ? { ...circuit, wires: circuit.wires.filter((w) => !bad.has(w.id)) } : circuit;
}

/**
 * 핀 이름 변경 목록: 같은 내부 부품(partId)을 가리키는 핀의 이름이 바뀐 경우 옛 이름 → 새 이름.
 * 핀은 내부 부품으로 추적하므로 이름만 바뀌면 연결을 유지할 수 있다.
 */
export function pinRenames(prev: Pick<ChipDef, 'inputs' | 'outputs'>, next: Pick<ChipDef, 'inputs' | 'outputs'>): Map<string, string> {
  const out = new Map<string, string>();
  for (const side of ['inputs', 'outputs'] as const) {
    for (const p of prev[side]) {
      const n = next[side].find((x) => x.partId === p.partId);
      if (n && n.name !== p.name) out.set(p.name, n.name);
    }
  }
  return out;
}

/** 회로 안에서 이 칩의 인스턴스에 꽂힌 전선의 핀 이름을 바꾼다 */
export function renamePinRefs(circuit: Circuit, chipId: string, renames: Map<string, string>): Circuit {
  if (renames.size === 0) return circuit;
  const instances = new Set(circuit.parts.filter((p) => p.kind.type === 'chip' && p.kind.chipId === chipId).map((p) => p.id));
  if (instances.size === 0) return circuit;
  let changed = false;
  const fix = (ref: Wire['from']) => {
    const to = instances.has(ref.partId) ? renames.get(ref.pin) : undefined;
    if (to === undefined) return ref;
    changed = true;
    return { ...ref, pin: to };
  };
  const wires = circuit.wires.map((w) => {
    const from = fix(w.from);
    const to = fix(w.to);
    return from === w.from && to === w.to ? w : { ...w, from, to };
  });
  return changed ? { ...circuit, wires } : circuit;
}

/**
 * 칩 정의를 갱신한다: 이름만 바뀐 핀은 쓰는 곳의 전선도 새 이름으로 바꾸고,
 * 사라진 핀에 꽂힌 전선만 지운다. others(작업 공간 등)도 같은 규칙으로 고친다.
 */
export function applyChipUpdate(lib: Library, next: ChipDef, others: Circuit[]): { library: Library; others: Circuit[] } {
  const prev = lib[next.id];
  const renames = prev ? pinRenames(prev, next) : new Map<string, string>();
  const renamed: Library = {};
  for (const [id, def] of Object.entries(lib)) {
    if (id === next.id) continue;
    const circuit = renamePinRefs(def.circuit, next.id, renames);
    renamed[id] = circuit === def.circuit ? def : { ...def, circuit };
  }
  const library = pruneLibrary({ ...renamed, [next.id]: next });
  return { library, others: others.map((c) => pruneDangling(renamePinRefs(c, next.id, renames), library)) };
}

/** 칩 정의를 바꾸면 끊어지는 전선 수 (다른 칩들 + 주어진 회로들). 이름만 바뀐 핀은 끊기지 않는다. */
export function countBrokenWires(lib: Library, next: ChipDef, others: Circuit[]): number {
  const renames = lib[next.id] ? pinRenames(lib[next.id]!, next) : new Map<string, string>();
  const after = { ...lib, [next.id]: next };
  const circuits = [...Object.values(lib).filter((d) => d.id !== next.id).map((d) => d.circuit), ...others];
  return circuits.reduce((n, c) => n + danglingWires(renamePinRefs(c, next.id, renames), after).length - danglingWires(c, lib).length, 0);
}

/** 라이브러리 전체와 회로들에서 끊어진 전선을 지운다 */
export function pruneLibrary(lib: Library): Library {
  let changed = false;
  const out: Library = {};
  for (const [id, def] of Object.entries(lib)) {
    const circuit = pruneDangling(def.circuit, lib);
    if (circuit !== def.circuit) changed = true;
    out[id] = circuit === def.circuit ? def : { ...def, circuit };
  }
  return changed ? out : lib;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `chip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RangeChipResult {
  chip: ChipDef;
  circuit: Circuit;
  instanceId: string;
}

function dedupeNames(names: string[], taken: Set<string> = new Set()): string[] {
  return names.map((n) => {
    let name = n.replace(/[./:]/g, '_') || '핀';
    for (let i = 2; taken.has(name); i++) name = `${n}${i}`;
    taken.add(name);
    return name;
  });
}

/**
 * 선택 범위를 칩으로 만든다 (SPEC 8장). 경계는 파형 패널과 같은 boundary()로 계산한다.
 * 경계 입력은 칩의 입력 핀(SWITCH), 경계 출력은 출력 핀(LED)이 되고, 원래 자리에는 칩 블록이 들어간다.
 */
export function rangeToChip(
  circuit: Circuit,
  selected: string[],
  lib: Library,
  meta: { id: string; name: string; color: string; now: string },
): RangeChipResult {
  const S = new Set(selected);
  const b = boundary(circuit, S, lib);
  const inside = circuit.parts.filter((p) => S.has(p.id));
  const minX = Math.min(...inside.map((p) => p.x));
  const minY = Math.min(...inside.map((p) => p.y));
  const maxX = Math.max(...inside.map((p) => p.x + 4));

  const taken = new Set<string>();
  const inNames = dedupeNames(b.inputs.map((p) => p.name), taken);
  const outNames = dedupeNames(b.outputs.map((p) => p.name), taken);

  const innerParts: Part[] = inside.map((p) => ({ ...p, x: p.x - minX + 6, y: p.y - minY + 1 }));
  const ids = new Set(innerParts.map((p) => p.id));
  const freshId = (prefix: string) => {
    let n = 1;
    while (ids.has(`${prefix}${n}`)) n++;
    ids.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  };
  const innerWires: Wire[] = circuit.wires.filter((w) => S.has(w.from.partId) && S.has(w.to.partId)).map((w) => ({ ...w }));
  const wireIds = new Set(innerWires.map((w) => w.id));
  const freshWire = () => {
    let n = 1;
    while (wireIds.has(`w${n}`)) n++;
    wireIds.add(`w${n}`);
    return `w${n}`;
  };

  const inputs = b.inputs.map((pin, i) => {
    const id = freshId('in');
    innerParts.push({ id, kind: { type: 'primitive', kind: 'SWITCH' }, x: 0, y: 1 + i * 3, label: inNames[i] });
    for (const w of pin.wires) innerWires.push({ id: freshWire(), from: { partId: id, pin: 'y' }, to: { ...w.to } });
    return { name: inNames[i]!, partId: id };
  });
  const outputs = b.outputs.map((pin, i) => {
    const id = freshId('out');
    innerParts.push({ id, kind: { type: 'primitive', kind: 'LED' }, x: maxX - minX + 10, y: 1 + i * 3, label: outNames[i] });
    innerWires.push({ id: freshWire(), from: { ...pin.source }, to: { partId: id, pin: 'a' } });
    return { name: outNames[i]!, partId: id };
  });

  const chip: ChipDef = {
    id: meta.id,
    name: meta.name,
    color: meta.color,
    inputs,
    outputs,
    circuit: { parts: innerParts, wires: innerWires },
    createdAt: meta.now,
    updatedAt: meta.now,
    revision: 1,
  };

  const outerParts = circuit.parts.filter((p) => !S.has(p.id));
  const instanceId = nextPartId(instancePrefix(chip), outerParts);
  outerParts.push({ id: instanceId, kind: { type: 'chip', chipId: chip.id }, x: minX, y: minY });
  const outerWires = circuit.wires.filter((w) => !S.has(w.from.partId) && !S.has(w.to.partId));
  const outerIds = new Set(outerWires.map((w) => w.id));
  const outerFresh = () => {
    let n = 1;
    while (outerIds.has(`w${n}`)) n++;
    outerIds.add(`w${n}`);
    return `w${n}`;
  };
  b.inputs.forEach((pin, i) => outerWires.push({ id: outerFresh(), from: { ...pin.source }, to: { partId: instanceId, pin: inNames[i]! } }));
  b.outputs.forEach((pin, i) => {
    for (const w of pin.wires) outerWires.push({ id: outerFresh(), from: { partId: instanceId, pin: outNames[i]! }, to: { ...w.to } });
  });

  return { chip, circuit: { parts: outerParts, wires: outerWires }, instanceId };
}

/** 내보낼 칩: 루트들과 그 칩들이 의존하는 모든 칩 (SPEC 4.3) */
export function withDependencies(rootIds: Iterable<string>, lib: Library): Library {
  const ids = new Set<string>();
  for (const id of rootIds) {
    if (!lib[id]) continue;
    ids.add(id);
    for (const d of allDeps(id, lib)) ids.add(d);
  }
  return Object.fromEntries([...ids].filter((id) => lib[id]).map((id) => [id, lib[id]!]));
}

export function chipsUsedIn(circuit: Circuit): Set<string> {
  return directDeps({ circuit });
}

export type ConflictMode = 'overwrite' | 'copy' | 'skip';

/** 가져올 칩 중 같은 id가 이미 있고 내용이 다른 것 */
export function importConflicts(lib: Library, incoming: Library): ChipDef[] {
  return Object.values(incoming).filter((d) => lib[d.id] && JSON.stringify(lib[d.id]) !== JSON.stringify(d));
}

function remapCircuit(circuit: Circuit, remap: Map<string, string>): Circuit {
  if (remap.size === 0) return circuit;
  return {
    ...circuit,
    parts: circuit.parts.map((p) => (p.kind.type === 'chip' && remap.has(p.kind.chipId) ? { ...p, kind: { type: 'chip', chipId: remap.get(p.kind.chipId)! } } : p)),
  };
}

/**
 * 가져온 칩을 라이브러리에 합친다 (SPEC 4.3).
 * 같은 id 충돌: 덮어쓰기 / 복사본으로 저장(새 id, "이름 (2)") / 건너뛰기(기존 칩 유지).
 */
export function mergeImport(
  lib: Library,
  incoming: Library,
  mode: ConflictMode,
  workspace?: Circuit,
): { library: Library; workspace?: Circuit; added: number } {
  const conflicts = new Set(importConflicts(lib, incoming).map((d) => d.id));
  const remap = new Map<string, string>();
  if (mode === 'copy') for (const id of conflicts) remap.set(id, newId());
  const out: Library = { ...lib };
  let added = 0;
  for (const def of Object.values(incoming)) {
    if (conflicts.has(def.id) && mode === 'skip') continue;
    const id = remap.get(def.id) ?? def.id;
    const name = conflicts.has(def.id) && mode === 'copy' ? uniqueName(def.name, out) : def.name;
    if (!lib[def.id] || conflicts.has(def.id)) added++;
    out[id] = { ...def, id, name, circuit: remapCircuit(def.circuit, remap) };
  }
  const cycle = findChipCycle(out);
  if (cycle) throw new Error(`가져오면 칩 순환 참조가 생깁니다: ${cycle.map((id) => out[id]?.name ?? id).join(' → ')}`);
  return { library: out, workspace: workspace && remapCircuit(workspace, remap), added };
}
