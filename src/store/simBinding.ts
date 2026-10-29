import type { Circuit } from '../sim/types';
import type { EditorStore } from './editorStore';
import { loadCircuit, setRecordedPrefix } from './simStore';

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

/** 편집 중인 회로(작업 공간 또는 칩)와 라이브러리가 바뀌면 다시 컴파일하고, 열어 본 칩 내부는 기록 대상에 넣는다 */
export function bindSimulation(store: EditorStore): () => void {
  let { circuit, library, viewPath } = store.getState();
  loadCircuit(circuit, library);
  return store.subscribe((state) => {
    if (state.viewPath !== viewPath) {
      viewPath = state.viewPath;
      setRecordedPrefix(viewPath.length ? `${viewPath.join('/')}/` : null);
    }
    if (state.library === library && sameTopology(circuit, state.circuit)) {
      circuit = state.circuit;
      return;
    }
    circuit = state.circuit;
    library = state.library;
    loadCircuit(circuit, library);
  });
}
