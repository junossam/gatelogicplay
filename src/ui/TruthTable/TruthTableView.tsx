import { useRef } from 'react';
import { CompileError } from '../../sim/compile';
import { AUTO_INPUT_LIMIT, orderedIO, truthTable, type Cell, type TruthTable } from '../../sim/truthTable';
import type { Circuit, Library } from '../../sim/types';
import { useEditor } from '../../store/editorStore';
import { sameTopology } from '../../store/simBinding';
import { engine, useSim } from '../../store/simStore';

/** 노드가 이보다 많으면 자동 생성하지 않는다 (조합마다 안정될 때까지 돌리므로) */
const AUTO_NODE_LIMIT = 2000;

export type TableState =
  | { status: 'ok'; table: TruthTable; inputIds: string[] }
  | { status: 'empty' }
  | { status: 'manual'; reason: string }
  | { status: 'error'; message: string };

function sameStructure(a: Circuit, b: Circuit): boolean {
  if (!sameTopology(a, b)) return false;
  return a.parts.every((p, i) => p.label === b.parts[i]!.label);
}

export function computeTable(circuit: Circuit, library: Library, order: { inputs: string[]; outputs: string[] }, force: boolean): TableState {
  const io = orderedIO(circuit, order);
  if (io.inputs.length === 0 || io.outputs.length === 0) return { status: 'empty' };
  if (circuit.parts.some((p) => p.kind.type === 'primitive' && p.kind.kind === 'CLOCK')) {
    return { status: 'error', message: '클럭이 있는 회로는 진리표를 만들 수 없습니다.' };
  }
  if (!force && io.inputs.length > AUTO_INPUT_LIMIT) return { status: 'manual', reason: `입력이 ${io.inputs.length}개라 자동으로 만들지 않습니다.` };
  if (!force && engine.netlist.nodes.length > AUTO_NODE_LIMIT) return { status: 'manual', reason: '회로가 커서 자동으로 만들지 않습니다.' };
  try {
    return { status: 'ok', table: truthTable(circuit, library, order), inputIds: io.inputs.map((p) => p.id) };
  } catch (e) {
    if (e instanceof CompileError) return { status: 'error', message: e.message };
    throw e;
  }
}

/** 구조(연결·라벨·순서)가 바뀔 때만 다시 계산 */
export function useTruthTable(force: boolean): TableState {
  const circuit = useEditor((s) => s.circuit);
  const library = useEditor((s) => s.library);
  const order = useEditor((s) => s.pinOrder);
  const cache = useRef<{ circuit: Circuit; library: Library; order: unknown; force: boolean; state: TableState } | null>(null);
  const c = cache.current;
  if (c && c.library === library && c.order === order && c.force === force && sameStructure(c.circuit, circuit)) return c.state;
  const state = computeTable(circuit, library, order, force);
  cache.current = { circuit, library, order, force, state };
  return state;
}

function CellView({ cell }: { cell: Cell }) {
  if (cell === 'hold') return <span className="cell-hold">이전 유지</span>;
  if (cell === 'mixed') return <span className="muted">?</span>;
  if (cell === 'forbidden') return <span className="warn">금지 상태</span>;
  return <span className={`bit bit-${cell}`}>{cell}</span>;
}

export function TruthTableView({ state, onForce }: { state: TableState; onForce?: () => void }) {
  useSim((s) => s.version);
  if (state.status === 'empty') return <p className="muted small">스위치·푸시 버튼과 LED가 있어야 진리표를 만들 수 있습니다.</p>;
  if (state.status === 'error') return <p className="warn small">{state.message}</p>;
  if (state.status === 'manual')
    return (
      <div className="small">
        <p className="muted">{state.reason}</p>
        <button type="button" className="text-button" onClick={onForce}>
          진리표 만들기
        </button>
      </div>
    );

  const { table, inputIds } = state;
  const current = inputIds.reduce((acc, id) => acc * 2 + engine.inputValue(id), 0);
  return (
    <div className="truth-wrap">
      <table className="truth-table mono" data-testid="truth-table">
        <thead>
          <tr>
            {table.inputs.map((n, i) => (
              <th key={`i${i}`} scope="col" className="in">
                {n}
              </th>
            ))}
            {table.outputs.map((n, i) => (
              <th key={`o${i}`} scope="col" className="out">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className={r === current ? 'current' : undefined} aria-current={r === current ? 'true' : undefined}>
              {row.inputs.map((b, i) => (
                <td key={`i${i}`} className="in">
                  <CellView cell={b} />
                </td>
              ))}
              {row.forbidden ? (
                <td colSpan={row.outputs.length} className="out">
                  <CellView cell="forbidden" />
                </td>
              ) : (
                row.outputs.map((c, i) => (
                  <td key={`o${i}`} className="out">
                    <CellView cell={c} />
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{table.sequential ? '순차 회로 · 이전 상태별로 시험' : '조합 회로'}</p>
    </div>
  );
}
