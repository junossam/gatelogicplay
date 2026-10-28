import type { Circuit } from '../sim/types';
import type { EditorStore } from './editorStore';
import { loadCircuit } from './simStore';

/** 부품 이동처럼 연결 구조가 그대로인 편집은 재컴파일하지 않는다. */
export function sameTopology(a: Circuit, b: Circuit): boolean {
  if (a === b) return true;
  if (a.wires !== b.wires || a.parts.length !== b.parts.length) return false;
  for (let i = 0; i < a.parts.length; i++) {
    const p = a.parts[i]!;
    const q = b.parts[i]!;
    if (p === q) continue;
    if (p.id !== q.id || p.kind !== q.kind || p.props !== q.props) return false;
  }
  return true;
}

export function bindSimulation(store: EditorStore): () => void {
  let current = store.getState().circuit;
  loadCircuit(current, {});
  return store.subscribe((state) => {
    if (sameTopology(current, state.circuit)) {
      current = state.circuit;
      return;
    }
    current = state.circuit;
    loadCircuit(current, {});
  });
}
