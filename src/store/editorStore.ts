import { useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';
import { pinDef } from '../sim/primitives';
import type { Circuit, Part, PinRef, PrimitiveKind } from '../sim/types';

const HISTORY_LIMIT = 200;

export interface Selection {
  parts: string[];
  wires: string[];
}

export interface EditorState {
  circuit: Circuit;
  selection: Selection;
  past: Circuit[];
  future: Circuit[];
  /** 드래그 시작 시점의 회로. 드래그 끝에서 한 번만 실행 취소 기록을 남긴다. */
  dragBase: Circuit | null;

  load(circuit: Circuit): void;
  addPart(kind: PrimitiveKind, x: number, y: number): string;
  setSelection(sel: Partial<Selection>): void;
  toggleSelection(sel: Partial<Selection>): void;
  clearSelection(): void;
  beginDrag(): void;
  dragBy(dx: number, dy: number): void;
  endDrag(): void;
  /** 두 핀을 잇는다. 방향은 자동으로 출력→입력으로 맞춘다. 실패하면 null. */
  connect(a: PinRef, b: PinRef): string | null;
  deleteSelection(): void;
  undo(): void;
  redo(): void;
}

const EMPTY: Circuit = { parts: [], wires: [] };

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

export function pinDirection(circuit: Circuit, ref: PinRef): 'in' | 'out' | undefined {
  const part = circuit.parts.find((p) => p.id === ref.partId);
  if (!part || part.kind.type !== 'primitive') return undefined;
  return pinDef(part.kind.kind, ref.pin)?.dir;
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
        selection: { parts: [], wires: [] },
        past: [],
        future: [],
        dragBase: null,

        load(circuit) {
          set((s) => {
            s.circuit = circuit;
            s.selection = { parts: [], wires: [] };
            s.past = [];
            s.future = [];
            s.dragBase = null;
          });
        },

        addPart(kind, x, y) {
          const { parts } = get().circuit;
          const id = nextId(kind.toLowerCase(), parts.map((p) => p.id));
          const part: Part = { id, kind: { type: 'primitive', kind }, x: Math.round(x), y: Math.round(y) };
          const label = nextLabel(kind, parts);
          if (label) part.label = label;
          commit((s) => {
            s.circuit.parts.push(part);
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
          const circuit = get().circuit;
          const da = pinDirection(circuit, a);
          const db = pinDirection(circuit, b);
          if (!da || !db || da === db) return null;
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
