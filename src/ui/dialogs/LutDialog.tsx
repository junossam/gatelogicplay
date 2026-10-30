import { useState } from 'react';
import { lutTable, MAX_LUT_INPUTS, MAX_LUT_OUTPUTS, partInputs, partOutputs } from '../../sim/pins';
import { editorStore } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { useDisplayView } from '../Canvas/expand';
import { Modal } from './Modal';

const letter = (k: number) => String.fromCharCode(65 + k);

/** 진리표 부품 편집: 입력·출력 수와 행마다 출력 값. 적용하면 한 번에 바꾼다 (실행 취소 한 번). */
export function LutDialog() {
  const partId = useUi((s) => s.lutEdit)!;
  const close = () => useUi.getState().setLutEdit(null);
  const { circuit, readOnly } = useDisplayView();
  const part = circuit.parts.find((p) => p.id === partId);
  const [n, setN] = useState(() => (part ? partInputs(part) : 2));
  const [m, setM] = useState(() => (part ? partOutputs(part) : 1));
  const [table, setTable] = useState(() => (part ? lutTable(part) : [0, 0, 0, 0]));
  if (!part) return null;

  const rows = 1 << n;
  const mask = (1 << m) - 1;
  // 입력·출력 수를 바꾸면 같은 번호의 행은 남기고 새 행은 0
  const resize = (nn: number, mm: number) => {
    setN(nn);
    setM(mm);
    setTable(Array.from({ length: 1 << nn }, (_, i) => (table[i] ?? 0) & ((1 << mm) - 1)));
  };
  const toggle = (i: number, j: number) => setTable(table.map((v, r) => (r === i ? v ^ (1 << j) : v)));
  const apply = () => {
    editorStore.getState().updatePart(part.id, { props: { ...part.props, inputs: n, outputs: m, table: table.map((v) => v & mask) } });
    close();
  };

  return (
    <Modal
      title={readOnly ? '진리표 보기' : '진리표 편집'}
      onClose={close}
      wide
      footer={
        readOnly ? (
          <button type="button" className="text-button primary" onClick={close}>
            닫기
          </button>
        ) : (
          <>
            <button type="button" className="text-button" onClick={close}>
              취소
            </button>
            <button type="button" className="text-button primary" onClick={apply}>
              적용
            </button>
          </>
        )
      }
    >
      {!readOnly && (
        <div className="lut-controls">
          <label className="field-label inline">
            입력 수
            <select className="field" aria-label="진리표 입력 수" value={n} onChange={(e) => resize(Number(e.target.value), m)}>
              {Array.from({ length: MAX_LUT_INPUTS }, (_, i) => i + 1).map((k) => (
                <option key={k} value={k}>
                  {k}개
                </option>
              ))}
            </select>
          </label>
          <label className="field-label inline">
            출력 수
            <select className="field" aria-label="진리표 출력 수" value={m} onChange={(e) => resize(n, Number(e.target.value))}>
              {Array.from({ length: MAX_LUT_OUTPUTS }, (_, i) => i + 1).map((k) => (
                <option key={k} value={k}>
                  {k}개
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="text-button" onClick={() => setTable(table.map(() => 0))}>
            모두 0
          </button>
          <button type="button" className="text-button" onClick={() => setTable(table.map(() => mask))}>
            모두 1
          </button>
        </div>
      )}
      <p className="muted small">출력 칸을 누르면 0과 1이 바뀝니다. 입력은 A가 가장 높은 자리입니다 (행 번호 = 입력을 2진수로 읽은 값).</p>
      <div className="lut-scroll">
        <table className="lut-table">
          <thead>
            <tr>
              {Array.from({ length: n }, (_, k) => (
                <th key={`i${k}`} className="in">
                  {letter(k)}
                </th>
              ))}
              {Array.from({ length: m }, (_, j) => (
                <th key={`o${j}`} className="out">
                  Y{j}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                {Array.from({ length: n }, (_, k) => {
                  const b = (i >> (n - 1 - k)) & 1;
                  return (
                    <td key={`i${k}`} className={`in mono${b ? ' one' : ''}`}>
                      {b}
                    </td>
                  );
                })}
                {Array.from({ length: m }, (_, j) => {
                  const b = ((table[i] ?? 0) >> j) & 1;
                  return (
                    <td key={`o${j}`}>
                      <button
                        type="button"
                        className={`lut-cell mono${b ? ' one' : ''}`}
                        aria-label={`${i}행 Y${j}`}
                        aria-pressed={b === 1}
                        disabled={readOnly}
                        onClick={() => toggle(i, j)}
                      >
                        {b}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
