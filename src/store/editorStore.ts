import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';
import {
  applyChipUpdate,
  chipPinsFrom,
  circuitUses,
  instancePrefix,
  mergeImport,
  newId,
  nextPartId,
  pinNameErrors,
  pruneDangling,
  rangeToChip,
  uniqueName,
  usedBy,
  wouldCreateCycle,
  type ConflictMode,
} from '../model/library';
import { findChipCycle } from '../sim/compile';
import { BUS_DEFAULT_BITS, pinSpec } from '../sim/pins';
import type { ChipDef, Circuit, Library, Part, PinRef, PrimitiveKind, Rotation } from '../sim/types';

const HISTORY_LIMIT = 200;

export interface Selection {
  parts: string[];
  wires: string[];
}

export interface PinOrder {
  inputs: string[];
  outputs: string[];
}

export interface SaveChipInput {
  name: string;
  color: string;
  /** 입력/출력 부품 id → 핀 이름 */
  names: Record<string, string>;
  order: PinOrder;
  /** 핀으로 쓰지 않을 입력/출력 부품 id */
  exclude?: string[];
  /** 편집 중인 칩을 저장할 때: 쓰는 칩에도 반영(같은 id 갱신) / 끄면 "이름 (2)"로 새 칩 */
  propagate: boolean;
}

export type SaveChipResult = { ok: true; id: string } | { ok: false; errors: string[] };

export interface EditorState {
  /** 편집 중인 회로: 작업 공간 또는 열어 둔 칩 정의 */
  circuit: Circuit;
  /** 칩 라이브러리 */
  library: Library;
  selection: Selection;
  past: Circuit[];
  future: Circuit[];
  /** 드래그 시작 시점의 회로. 드래그 끝에서 한 번만 실행 취소 기록을 남긴다. */
  dragBase: Circuit | null;
  /** 칩으로 만들 때의 입출력 핀 순서 (부품 id). 없는 id는 무시하고 빠진 부품은 위→아래 순. */
  pinOrder: PinOrder;
  /** 편집 중인 칩 정의 (null = 작업 공간) */
  openChipId: string | null;
  /** 칩을 편집하는 동안 맡겨 둔 작업 공간 */
  stash: { circuit: Circuit; past: Circuit[]; future: Circuit[]; pinOrder: PinOrder } | null;
  /** 칩을 연 시점의 회로 — 저장 안 된 변경 감지용 */
  openedCircuit: Circuit | null;
  /** 읽기 전용으로 들어가 본 칩 인스턴스 경로 (부품 id 목록) */
  viewPath: string[];
  /** 풀고 있는 챌린지 (null = 아님). 작업 공간은 stash에 맡겨 둔다 */
  openChallengeId: string | null;

  load(circuit: Circuit): void;
  loadAll(workspace: Circuit, library: Library, openChipId: string | null): void;
  setLibrary(library: Library): void;
  addPart(kind: PrimitiveKind, x: number, y: number): string;
  addChip(chipId: string, x: number, y: number): string | null;
  setSelection(sel: Partial<Selection>): void;
  toggleSelection(sel: Partial<Selection>): void;
  clearSelection(): void;
  beginDrag(): void;
  dragBy(dx: number, dy: number): void;
  endDrag(): void;
  /** 두 핀을 잇는다. 방향은 자동으로 출력→입력으로 맞춘다. 실패하면 null. */
  connect(a: PinRef, b: PinRef): string | null;
  deleteSelection(): void;
  updatePart(id: string, patch: Partial<Pick<Part, 'label' | 'props' | 'rotation'>>): void;
  rotateSelection(): void;
  /** 전선을 꺾은 점들(격자 칸, 끝점 제외). null이면 자동 경로로 */
  setWirePoints(id: string, points: { x: number; y: number }[] | null): void;
  setPinOrder(order: PinOrder): void;
  openChip(chipId: string): void;
  closeChip(): void;
  openChallenge(id: string, circuit: Circuit): void;
  closeChallenge(): void;
  enterInstance(partId: string): boolean;
  setViewPath(path: string[]): void;
  saveChip(input: SaveChipInput): SaveChipResult;
  makeChipFromSelection(): string | null;
  deleteChip(chipId: string): { ok: true } | { ok: false; users: string[] };
  importLibrary(library: Library, mode: ConflictMode, workspace?: Circuit): number;
  undo(): void;
  redo(): void;
}

const EMPTY: Circuit = { parts: [], wires: [] };
const NO_ORDER: PinOrder = { inputs: [], outputs: [] };

function nextId(prefix: string, taken: Iterable<string | undefined>): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const INPUT_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWX';

function nextLabel(kind: PrimitiveKind, parts: Part[]): string | undefined {
  const used = new Set(parts.map((p) => p.label));
  if (kind === 'SWITCH' || kind === 'PUSH') {
    for (const c of INPUT_LABELS) if (!used.has(c)) return c;
    return nextId('IN', used);
  }
  if (kind === 'LED') return nextId('Y', used);
  return undefined;
}

export function pinDirection(circuit: Circuit, ref: PinRef, library: Library = {}): 'in' | 'out' | undefined {
  return pinOf(circuit, ref, library)?.dir;
}

/** 핀의 방향과 비트 수 */
export function pinOf(circuit: Circuit, ref: PinRef, library: Library = {}) {
  const part = circuit.parts.find((p) => p.id === ref.partId);
  return part ? pinSpec(part, ref.pin, library) : undefined;
}

/** 양 끝 핀이 있고 비트 수가 같은 전선만 남긴다 (비트 수를 바꾼 뒤) */
function keepValidWires(circuit: Circuit, library: Library): Circuit['wires'] {
  return circuit.wires.filter((w) => {
    const a = pinOf(circuit, w.from, library);
    const b = pinOf(circuit, w.to, library);
    return a?.dir === 'out' && b?.dir === 'in' && a.width === b.width;
  });
}

/** 지금 보고 있는 회로: 작업 공간(또는 편집 중인 칩) → viewPath를 따라 들어간 칩 내부 */
export function viewTarget(state: Pick<EditorState, 'circuit' | 'library' | 'viewPath'>): { circuit: Circuit; chain: ChipDef[] } {
  let circuit = state.circuit;
  const chain: ChipDef[] = [];
  for (const id of state.viewPath) {
    const part = circuit.parts.find((p) => p.id === id);
    const def = part?.kind.type === 'chip' ? state.library[part.kind.chipId] : undefined;
    if (!def) break;
    chain.push(def);
    circuit = def.circuit;
  }
  return { circuit, chain };
}

export function isChipDirty(state: Pick<EditorState, 'openChipId' | 'circuit' | 'openedCircuit'>): boolean {
  return state.openChipId !== null && state.circuit !== state.openedCircuit;
}

/** 작업 공간 회로 (칩을 편집 중이면 맡겨 둔 것) */
export function workspaceOf(state: Pick<EditorState, 'circuit' | 'stash' | 'openChipId'>): Circuit {
  return state.stash?.circuit ?? state.circuit;
}

export function createEditorStore(initial: Circuit = EMPTY) {
  return createStore<EditorState>()(
    immer((set, get) => {
      const pushHistory = (s: EditorState, before: Circuit) => {
        s.past.push(before);
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
      };

      /** 회로를 바꾸는 모든 동작은 이 함수를 거쳐 실행 취소 기록을 남긴다. */
      const commit = (mutate: (draft: EditorState) => void) => {
        const before = get().circuit;
        set((s) => {
          mutate(s);
          pushHistory(s, before);
        });
      };

      const pruneSelection = (s: EditorState) => {
        const parts = new Set(s.circuit.parts.map((p) => p.id));
        const wires = new Set(s.circuit.wires.map((w) => w.id));
        s.selection.parts = s.selection.parts.filter((id) => parts.has(id));
        s.selection.wires = s.selection.wires.filter((id) => wires.has(id));
      };

      return {
        circuit: initial,
        library: {},
        selection: { parts: [], wires: [] },
        past: [],
        future: [],
        dragBase: null,
        pinOrder: NO_ORDER,
        openChipId: null,
        stash: null,
        openedCircuit: null,
        viewPath: [],
        openChallengeId: null,

        load(circuit) {
          set((s) => {
            s.circuit = circuit;
            s.pinOrder = NO_ORDER;
            s.selection = { parts: [], wires: [] };
            s.past = [];
            s.future = [];
            s.dragBase = null;
            s.openChipId = null;
            s.stash = null;
            s.openedCircuit = null;
            s.viewPath = [];
            s.openChallengeId = null;
          });
        },

        loadAll(workspace, library, openChipId) {
          get().load(workspace);
          set((s) => {
            s.library = library;
          });
          if (openChipId && library[openChipId]) get().openChip(openChipId);
        },

        setLibrary(library) {
          set((s) => {
            s.library = library;
          });
        },

        addPart(kind, x, y) {
          const { parts } = get().circuit;
          const id = nextId(kind.toLowerCase(), parts.map((p) => p.id));
          const part: Part = { id, kind: { type: 'primitive', kind }, x: Math.round(x), y: Math.round(y) };
          const label = nextLabel(kind, parts);
          if (label) part.label = label;
          if (kind === 'CLOCK') part.props = { hz: 1 };
          if (kind === 'SPLIT' || kind === 'MERGE') part.props = { bits: BUS_DEFAULT_BITS };
          commit((s) => {
            s.circuit.parts.push(part);
            s.selection = { parts: [id], wires: [] };
          });
          return id;
        },

        addChip(chipId, x, y) {
          const { library, openChipId, circuit } = get();
          const def = library[chipId];
          if (!def || wouldCreateCycle(openChipId, chipId, library)) return null;
          const id = nextPartId(instancePrefix(def), circuit.parts);
          commit((s) => {
            s.circuit.parts.push({ id, kind: { type: 'chip', chipId }, x: Math.round(x), y: Math.round(y) });
            s.selection = { parts: [id], wires: [] };
          });
          return id;
        },

        setSelection(sel) {
          set((s) => {
            s.selection = { parts: sel.parts ?? [], wires: sel.wires ?? [] };
          });
        },

        toggleSelection(sel) {
          set((s) => {
            for (const key of ['parts', 'wires'] as const) {
              for (const id of sel[key] ?? []) {
                const list = s.selection[key];
                const i = list.indexOf(id);
                if (i >= 0) list.splice(i, 1);
                else list.push(id);
              }
            }
          });
        },

        clearSelection() {
          set((s) => {
            s.selection = { parts: [], wires: [] };
          });
        },

        beginDrag() {
          const base = get().circuit;
          set((s) => {
            s.dragBase = base;
          });
        },

        dragBy(dx, dy) {
          const base = get().dragBase;
          if (!base) return;
          const moving = new Set(get().selection.parts);
          set((s) => {
            for (const part of s.circuit.parts) {
              if (!moving.has(part.id)) continue;
              const orig = base.parts.find((p) => p.id === part.id);
              if (!orig) continue;
              part.x = orig.x + Math.round(dx);
              part.y = orig.y + Math.round(dy);
            }
          });
        },

        endDrag() {
          const { dragBase, circuit } = get();
          if (!dragBase) return;
          const moved = circuit.parts.some((p) => {
            const orig = dragBase.parts.find((o) => o.id === p.id);
            return orig !== undefined && (orig.x !== p.x || orig.y !== p.y);
          });
          set((s) => {
            s.dragBase = null;
            if (moved) pushHistory(s, dragBase);
          });
        },

        connect(a, b) {
          const { circuit, library } = get();
          const pa = pinOf(circuit, a, library);
          const pb = pinOf(circuit, b, library);
          const da = pa?.dir;
          const db = pb?.dir;
          // 출력↔입력이고 비트 수가 같아야 연결 (SPEC 13장 8단계)
          if (!da || !db || da === db || pa.width !== pb.width) return null;
          const from = da === 'out' ? a : b;
          const to = da === 'out' ? b : a;
          const existing = circuit.wires.find((w) => w.to.partId === to.partId && w.to.pin === to.pin);
          if (existing && existing.from.partId === from.partId && existing.from.pin === from.pin) return null;
          const id = nextId('w', circuit.wires.map((w) => w.id));
          commit((s) => {
            // 입력 핀에는 전선 하나만: 기존 전선은 새 전선으로 교체
            if (existing) s.circuit.wires = s.circuit.wires.filter((w) => w.id !== existing.id);
            s.circuit.wires.push({ id, from: { partId: from.partId, pin: from.pin }, to: { partId: to.partId, pin: to.pin } });
            s.selection = { parts: [], wires: [id] };
          });
          return id;
        },

        deleteSelection() {
          const { selection } = get();
          if (selection.parts.length === 0 && selection.wires.length === 0) return;
          const parts = new Set(selection.parts);
          const wires = new Set(selection.wires);
          commit((s) => {
            s.circuit.parts = s.circuit.parts.filter((p) => !parts.has(p.id));
            s.circuit.wires = s.circuit.wires.filter(
              (w) => !wires.has(w.id) && !parts.has(w.from.partId) && !parts.has(w.to.partId),
            );
            s.selection = { parts: [], wires: [] };
          });
        },

        updatePart(id, patch) {
          const part = get().circuit.parts.find((p) => p.id === id);
          if (!part) return;
          const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => JSON.stringify(part[k]) !== JSON.stringify(patch[k]));
          if (!changed) return;
          const lib = get().library;
          commit((s) => {
            const draft = s.circuit.parts.find((p) => p.id === id)!;
            for (const [k, v] of Object.entries(patch)) {
              if (v === undefined || v === '' || (k === 'rotation' && v === 0)) delete (draft as unknown as Record<string, unknown>)[k];
              else (draft as unknown as Record<string, unknown>)[k] = v;
            }
            // 비트 수가 바뀌어 맞지 않게 된 전선은 지운다
            if ('props' in patch) s.circuit.wires = keepValidWires(s.circuit, lib);
          });
        },

        setWirePoints(id, points) {
          const wire = get().circuit.wires.find((w) => w.id === id);
          if (!wire) return;
          if (!points?.length && !wire.points) return;
          commit((s) => {
            const draft = s.circuit.wires.find((w) => w.id === id)!;
            if (points?.length) draft.points = points.map((p) => ({ x: p.x, y: p.y }));
            else delete draft.points;
          });
        },

        rotateSelection() {
          const ids = new Set(get().selection.parts);
          if (ids.size === 0) return;
          commit((s) => {
            for (const p of s.circuit.parts) {
              if (!ids.has(p.id)) continue;
              const next = (((p.rotation ?? 0) + 90) % 360) as Rotation;
              if (next === 0) delete p.rotation;
              else p.rotation = next;
            }
          });
        },

        setPinOrder(order) {
          set((s) => {
            s.pinOrder = order;
          });
        },

        openChip(chipId) {
          const st = get();
          const def = st.library[chipId];
          if (!def) return;
          set((s) => {
            if (!s.stash) s.stash = { circuit: st.circuit, past: st.past, future: st.future, pinOrder: st.pinOrder };
            s.openChipId = chipId;
            s.circuit = def.circuit;
            s.openedCircuit = def.circuit;
            s.past = [];
            s.future = [];
            s.selection = { parts: [], wires: [] };
            s.viewPath = [];
            s.pinOrder = { inputs: def.inputs.map((p) => p.partId), outputs: def.outputs.map((p) => p.partId) };
          });
        },

        openChallenge(id, circuit) {
          const st = get();
          if (st.openChipId) st.closeChip();
          const cur = get();
          set((s) => {
            if (!s.stash) s.stash = { circuit: cur.circuit, past: cur.past, future: cur.future, pinOrder: cur.pinOrder };
            s.openChallengeId = id;
            s.circuit = circuit;
            s.past = [];
            s.future = [];
            s.selection = { parts: [], wires: [] };
            s.viewPath = [];
            s.pinOrder = NO_ORDER;
          });
        },

        closeChallenge() {
          if (get().openChallengeId === null) return;
          set((s) => {
            s.openChallengeId = null;
          });
          get().closeChip();
        },

        closeChip() {
          const { stash } = get();
          if (!stash) return;
          set((s) => {
            s.circuit = stash.circuit;
            s.past = stash.past;
            s.future = stash.future;
            s.pinOrder = stash.pinOrder;
            s.stash = null;
            s.openChipId = null;
            s.openedCircuit = null;
            s.selection = { parts: [], wires: [] };
            s.viewPath = [];
          });
        },

        enterInstance(partId) {
          const target = viewTarget(get()).circuit;
          const part = target.parts.find((p) => p.id === partId);
          if (part?.kind.type !== 'chip' || !get().library[part.kind.chipId]) return false;
          set((s) => {
            s.viewPath.push(partId);
            s.selection = { parts: [], wires: [] };
          });
          return true;
        },

        setViewPath(path) {
          set((s) => {
            s.viewPath = path;
            s.selection = { parts: [], wires: [] };
          });
        },

        saveChip(input) {
          const st = get();
          const name = input.name.trim();
          const pins = chipPinsFrom(st.circuit, { names: input.names, order: input.order, exclude: input.exclude });
          const errors = pinNameErrors(pins);
          if (!name) errors.unshift('이름을 입력하세요.');
          if (pins.inputs.length + pins.outputs.length === 0) errors.push('입력(스위치·푸시 버튼)이나 출력(LED)이 하나 이상 있어야 합니다.');
          const updating = st.openChipId !== null && input.propagate ? st.openChipId : null;
          const finalName = st.openChipId !== null && !input.propagate ? uniqueName(name, st.library) : name;
          if (name && Object.values(st.library).some((d) => d.name === finalName && d.id !== updating)) {
            errors.push(`같은 이름의 칩이 이미 있습니다: ${finalName}`);
          }
          if (errors.length) return { ok: false, errors };

          // 핀 이름은 내부 부품의 라벨로 저장
          const named = new Map([...pins.inputs, ...pins.outputs].map((p) => [p.partId, p.name]));
          const circuit: Circuit = {
            ...st.circuit,
            parts: st.circuit.parts.map((p) => (named.has(p.id) && p.label !== named.get(p.id) ? { ...p, label: named.get(p.id) } : p)),
          };
          const now = new Date().toISOString();
          const prev = updating ? st.library[updating] : undefined;
          const def: ChipDef = {
            id: updating ?? newId(),
            name: finalName,
            color: input.color,
            inputs: pins.inputs,
            outputs: pins.outputs,
            circuit,
            createdAt: prev?.createdAt ?? now,
            updatedAt: now,
            revision: (prev?.revision ?? 0) + 1,
          };
          // 이름만 바뀐 핀은 쓰는 곳의 전선도 따라 바꾸고, 사라진 핀의 전선만 지운다
          const updated = applyChipUpdate(st.library, def, st.stash ? [st.stash.circuit] : []);
          const library = updated.library;
          const cycle = findChipCycle(library);
          if (cycle) return { ok: false, errors: [`칩 순환 참조가 생깁니다: ${cycle.map((id) => library[id]?.name ?? id).join(' → ')}`] };
          set((s) => {
            s.library = library;
            if (s.openChipId !== null) {
              // 편집 중인 칩 저장: 이제 저장된 칩(또는 복사본)을 편집하는 상태
              s.openChipId = def.id;
              s.circuit = library[def.id]!.circuit;
              s.openedCircuit = library[def.id]!.circuit;
              if (s.stash) s.stash.circuit = updated.others[0]!;
            } else {
              s.circuit = pruneDangling(circuit, library);
            }
            s.pinOrder = { inputs: def.inputs.map((p) => p.partId), outputs: def.outputs.map((p) => p.partId) };
          });
          return { ok: true, id: def.id };
        },

        makeChipFromSelection() {
          const st = get();
          if (st.selection.parts.length === 0) return null;
          const { chip, circuit, instanceId } = rangeToChip(st.circuit, st.selection.parts, st.library, {
            id: newId(),
            name: uniqueName('새 칩', st.library),
            color: 'chip-1',
            now: new Date().toISOString(),
          });
          set((s) => {
            s.library = { ...st.library, [chip.id]: chip };
          });
          commit((s) => {
            s.circuit = circuit;
            s.selection = { parts: [instanceId], wires: [] };
          });
          return chip.id;
        },

        deleteChip(chipId) {
          const st = get();
          const users = usedBy(chipId, st.library).map((d) => d.name);
          if (circuitUses(workspaceOf(st), chipId)) users.push('작업 공간');
          if (st.openChipId !== null && st.openChipId !== chipId && circuitUses(st.circuit, chipId)) users.push('편집 중인 칩');
          if (users.length) return { ok: false, users };
          if (st.openChipId === chipId) get().closeChip();
          set((s) => {
            const lib = { ...s.library };
            delete lib[chipId];
            s.library = lib;
          });
          return { ok: true };
        },

        importLibrary(incoming, mode, workspace) {
          const st = get();
          const merged = mergeImport(st.library, incoming, mode, workspace);
          // 칩 정의가 먼저 있어야 작업 공간을 컴파일할 수 있다
          set((s) => {
            s.library = merged.library;
          });
          if (merged.workspace) get().load(merged.workspace);
          return merged.added;
        },

        undo() {
          const { past, circuit } = get();
          const prev = past[past.length - 1];
          if (!prev) return;
          set((s) => {
            s.past.pop();
            s.future.push(circuit);
            s.circuit = prev;
            pruneSelection(s);
          });
        },

        redo() {
          const { future, circuit } = get();
          const next = future[future.length - 1];
          if (!next) return;
          set((s) => {
            s.future.pop();
            s.past.push(circuit);
            s.circuit = next;
            pruneSelection(s);
          });
        },
      };
    }),
  );
}

export type EditorStore = ReturnType<typeof createEditorStore>;

export const editorStore = createEditorStore();

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector);
}

/** 캔버스·인스펙터·파형이 함께 쓰는 "지금 보고 있는 회로" */
export function useView(): { circuit: Circuit; chain: ChipDef[]; prefix: string; readOnly: boolean } {
  const circuit = useEditor((s) => s.circuit);
  const library = useEditor((s) => s.library);
  const viewPath = useEditor((s) => s.viewPath);
  if (viewPath.length === 0) return { circuit, chain: [], prefix: '', readOnly: false };
  const target = viewTarget({ circuit, library, viewPath });
  return { ...target, prefix: `${viewPath.join('/')}/`, readOnly: true };
}
