// 칩 펼쳐 보기: 칩 부품을 그 자리에서 내부 회로로 풀어 보여 준다 (공부용, 읽기 전용).
// 엔진의 평탄화와 같은 경로 id(`dec/m3`)를 쓰므로 펼친 부품의 신호 값을 그대로 읽을 수 있다.
import { useMemo } from 'react';
import type { Circuit, Group, Library, Note, Part, PinRef, Wire } from '../../sim/types';
import { useEditor, useView } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { GRID, partRect } from './geometry';

/** 0 = 펼치지 않음, 1 = 한 단계, Infinity = 전부 */
export type ExpandDepth = number;

/** 펼친 칩의 그룹 id 끝 (사용자 그룹과 구분) */
export const CHIP_GROUP_SUFFIX = '#chip';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 부품들이 차지하는 영역 (격자 칸) */
function gridBounds(parts: Part[], library: Library): Box | null {
  if (!parts.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of parts) {
    const r = partRect(p, library);
    x0 = Math.min(x0, r.x / GRID);
    y0 = Math.min(y0, r.y / GRID);
    x1 = Math.max(x1, (r.x + r.w) / GRID);
    y1 = Math.max(y1, (r.y + r.h) / GRID);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 칩 부품을 depth 단계까지 내부 회로로 펼친다.
 * - 칩의 입력·출력 핀 부품(내부 스위치·LED)은 빼고, 바깥 전선을 안쪽 부품에 바로 잇는다 (엔진의 별칭과 같다).
 * - 펼친 칩이 커진 만큼 그 오른쪽·아래의 부품을 밀어 겹치지 않게 한다.
 * - 펼친 칩마다 점선 그룹("칩 이름 (부품 id)")을 만든다.
 */
export function expandCircuit(circuit: Circuit, library: Library, depth: ExpandDepth): Circuit {
  if (depth <= 0 || !circuit.parts.some((p) => p.kind.type === 'chip' && library[p.kind.chipId])) return circuit;
  return expandLevel(circuit, library, depth, '');
}

function expandLevel(circuit: Circuit, library: Library, depth: number, prefix: string): Circuit {
  interface Inst {
    part: Part;
    inner: Circuit;
    box: Box;
    w: number;
    h: number;
    dx: number;
    dy: number;
    /** 칩 입력 핀 → 그 핀을 받는 안쪽 입력들 */
    ins: Map<string, PinRef[]>;
    /** 칩 출력 핀 → 그 핀을 내는 안쪽 출력 */
    outs: Map<string, PinRef | undefined>;
    ids: string[];
    name: string;
  }
  const insts = new Map<string, Inst>();
  for (const p of circuit.parts) {
    if (depth <= 0 || p.kind.type !== 'chip') continue;
    const def = library[p.kind.chipId];
    if (!def) continue;
    const ip = `${prefix}${p.id}/`;
    const inner = expandLevel(def.circuit, library, depth - 1, ip);
    const ioIds = new Set([...def.inputs, ...def.outputs].map((q) => ip + q.partId));
    const ins = new Map(def.inputs.map((q) => [q.name, inner.wires.filter((w) => w.from.partId === ip + q.partId).map((w) => w.to)]));
    const outs = new Map(def.outputs.map((q) => [q.name, inner.wires.find((w) => w.to.partId === ip + q.partId)?.from]));
    const kept: Circuit = {
      ...inner,
      parts: inner.parts.filter((q) => !ioIds.has(q.id)),
      wires: inner.wires.filter((w) => !ioIds.has(w.from.partId) && !ioIds.has(w.to.partId)),
    };
    const box = gridBounds(kept.parts, library) ?? { x: 0, y: 0, w: 2, h: 2 };
    const r = partRect(p, library);
    const w = r.w / GRID;
    const h = r.h / GRID;
    // 그룹 사각형 여백과 이름표 자리를 둔다
    const W = Math.ceil(box.w) + 2;
    const H = Math.ceil(box.h) + 4;
    insts.set(p.id, { part: p, inner: kept, box, w, h, dx: Math.max(0, W - w), dy: Math.max(0, H - h), ins, outs, ids: kept.parts.map((q) => q.id), name: def.name });
  }
  if (!insts.size) return prefixCircuit(circuit, prefix);

  // 펼친 칩의 오른쪽(아래)에 있는 것은 그 칩이 넓어진(길어진) 만큼 민다
  const list = [...insts.values()];
  const shiftX = (x: number) => x + list.reduce((s, i) => (i.part.x + i.w <= x ? s + i.dx : s), 0);
  const shiftY = (y: number) => y + list.reduce((s, i) => (i.part.y + i.h <= y ? s + i.dy : s), 0);

  const parts: Part[] = [];
  const wires: Wire[] = [];
  const groups: Group[] = [];
  const notes: Note[] = [];
  for (const p of circuit.parts) {
    const inst = insts.get(p.id);
    if (!inst) {
      parts.push({ ...p, id: prefix + p.id, x: shiftX(p.x), y: shiftY(p.y) });
      continue;
    }
    const ox = shiftX(p.x) + 1 - Math.floor(inst.box.x);
    const oy = shiftY(p.y) + 3 - Math.floor(inst.box.y);
    for (const q of inst.inner.parts) parts.push({ ...q, x: q.x + ox, y: q.y + oy });
    wires.push(...inst.inner.wires.map((w) => ({ id: w.id, from: w.from, to: w.to })));
    for (const g of inst.inner.groups ?? []) groups.push(g);
    for (const n of inst.inner.notes ?? []) notes.push({ ...n, x: n.x + ox, y: n.y + oy });
    groups.push({ id: `${prefix}${p.id}${CHIP_GROUP_SUFFIX}`, name: `${inst.name} (${p.id})`, parts: inst.ids });
  }

  // 바깥 전선: 펼친 칩의 핀은 안쪽 부품으로 바꾼다
  let n = 0;
  for (const w of circuit.wires) {
    const fromInst = insts.get(w.from.partId);
    const toInst = insts.get(w.to.partId);
    const src = fromInst ? fromInst.outs.get(w.from.pin) : { partId: prefix + w.from.partId, pin: w.from.pin };
    if (!src) continue;
    const targets = toInst ? (toInst.ins.get(w.to.pin) ?? []) : [{ partId: prefix + w.to.partId, pin: w.to.pin }];
    for (const t of targets) {
      wires.push(!fromInst && !toInst ? { id: prefix + w.id, from: src, to: t } : { id: `${prefix}~${n++}`, from: src, to: t });
    }
  }

  // 사용자 그룹: 펼친 칩은 그 안쪽 부품으로 바꿔 담는다
  for (const g of circuit.groups ?? []) {
    groups.unshift({ ...g, id: prefix + g.id, parts: g.parts.flatMap((id) => insts.get(id)?.ids ?? [prefix + id]) });
  }
  for (const note of circuit.notes ?? []) notes.push({ ...note, id: prefix + note.id, x: shiftX(note.x), y: shiftY(note.y) });

  return { parts, wires, ...(groups.length ? { groups } : {}), ...(notes.length ? { notes } : {}) };
}

/** 펼칠 칩이 없는 회로: id에 경로만 붙인다 */
function prefixCircuit(c: Circuit, prefix: string): Circuit {
  if (!prefix) return c;
  const ref = (r: PinRef) => ({ partId: prefix + r.partId, pin: r.pin });
  return {
    parts: c.parts.map((p) => ({ ...p, id: prefix + p.id })),
    wires: c.wires.map((w) => ({ id: prefix + w.id, from: ref(w.from), to: ref(w.to) })),
    ...(c.groups ? { groups: c.groups.map((g) => ({ ...g, id: prefix + g.id, parts: g.parts.map((id) => prefix + id) })) } : {}),
    ...(c.notes ? { notes: c.notes.map((x) => ({ ...x, id: prefix + x.id })) } : {}),
  };
}

const cache = new WeakMap<Circuit, { library: Library; depth: number; result: Circuit }>();

/** 같은 회로·라이브러리·단계면 다시 계산하지 않는다 (캔버스·인스펙터·파형이 함께 쓴다) */
export function expandCached(circuit: Circuit, library: Library, depth: ExpandDepth): Circuit {
  const hit = cache.get(circuit);
  if (hit && hit.library === library && hit.depth === depth) return hit.result;
  const result = expandCircuit(circuit, library, depth);
  cache.set(circuit, { library, depth, result });
  return result;
}

/** 화면에 보이는 회로: useView에 칩 펼쳐 보기를 더한 것. 펼쳐 보는 동안은 읽기 전용. */
export function useDisplayView() {
  const view = useView();
  const library = useEditor((s) => s.library);
  const depth = useUi((s) => s.expandDepth);
  const hasChips = view.circuit.parts.some((p) => p.kind.type === 'chip');
  const circuit = useMemo(() => (depth > 0 ? expandCached(view.circuit, library, depth) : view.circuit), [view.circuit, library, depth]);
  const expanded = depth > 0 && circuit !== view.circuit;
  return { ...view, circuit, readOnly: view.readOnly || expanded, expanded, hasChips };
}
