import { useRef, useState } from 'react';
import { defaultInName, defaultOutName, lutToCsv, MAX_PIN_NAME, parseLutCsv } from '../../model/lutCsv';
import { LUT_TITLE_DEFAULT, lutTable, MAX_LUT_INPUTS, MAX_LUT_OUTPUTS, MAX_LUT_TITLE, partInputs, partOutputs } from '../../sim/pins';
import { editorStore } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { useDisplayView } from '../Canvas/expand';
import { Modal } from './Modal';

/** 표 한 칸 폭 (px). 입력 열은 가로로 밀어도 왼쪽에 고정되므로 위치 계산에 쓴다. */
const COL = 56;

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 이름 목록을 저장할 꼴로: 기본 이름과 같거나 비었으면 빈 문자열, 모두 비면 생략 */
function cleanNames(names: string[], count: number, def: (k: number) => string): string[] | undefined {
  const out = Array.from({ length: count }, (_, k) => {
    const v = (names[k] ?? '').trim().slice(0, MAX_PIN_NAME);
    return v === def(k) ? '' : v;
  });
  return out.some(Boolean) ? out : undefined;
}

/** 진리표 부품 편집: 입력·출력 수와 행마다 출력 값. 적용하면 한 번에 바꾼다 (실행 취소 한 번). */
export function LutDialog() {
  const partId = useUi((s) => s.lutEdit)!;
  const close = () => useUi.getState().setLutEdit(null);
  const { circuit, readOnly } = useDisplayView();
  const part = circuit.parts.find((p) => p.id === partId);
  const [n, setN] = useState(() => (part ? partInputs(part) : 2));
  const [m, setM] = useState(() => (part ? partOutputs(part) : 1));
  const [table, setTable] = useState(() => (part ? lutTable(part) : [0, 0, 0, 0]));
  const [inNames, setInNames] = useState<string[]>(() => [...(part?.props?.inNames ?? [])]);
  const [outNames, setOutNames] = useState<string[]>(() => [...(part?.props?.outNames ?? [])]);
  const [title, setTitle] = useState(() => part?.label ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    const props = { ...part.props, inputs: n, outputs: m, table: table.map((v) => v & mask) };
    const ins = cleanNames(inNames, n, defaultInName);
    const outs = cleanNames(outNames, m, defaultOutName);
    if (ins) props.inNames = ins;
    else delete props.inNames;
    if (outs) props.outNames = outs;
    else delete props.outNames;
    const name = title.trim();
    editorStore.getState().updatePart(part.id, { props, label: name && name !== LUT_TITLE_DEFAULT ? name : undefined });
    close();
  };
  const inName = (k: number) => inNames[k] || defaultInName(k);
  const outName = (j: number) => outNames[j] || defaultOutName(j);
  const exportCsv = () => download(`${title.trim() || part.label || part.id} 진리표.csv`, lutToCsv({ inputs: n, outputs: m, table, inNames, outNames }));
  const importCsv = async (file: File) => {
    const r = parseLutCsv(await file.text(), n);
    if (!r.ok) {
      setError(`${file.name}: ${r.error}`);
      setLoaded(null);
      return;
    }
    setError(null);
    setN(r.data.inputs);
    setM(r.data.outputs);
    setTable(r.data.table);
    setInNames(r.data.inNames);
    setOutNames(r.data.outNames);
    setLoaded(`${file.name}을 불러왔습니다 (입력 ${r.data.inputs} · 출력 ${r.data.outputs}). 적용을 누르면 부품에 반영됩니다.`);
  };
  const setName = (list: string[], set: (v: string[]) => void, k: number, v: string) => {
    const next = [...list];
    next[k] = v.slice(0, MAX_PIN_NAME);
    set(next);
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
            부품 이름
            <input
              className="field lut-title-field"
              aria-label="진리표 부품 이름"
              value={title}
              placeholder={LUT_TITLE_DEFAULT}
              maxLength={MAX_LUT_TITLE}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
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
          <span className="lut-controls-gap" />
          <button type="button" className="text-button" onClick={exportCsv} title="엑셀에서 열고 고칠 수 있는 CSV 파일로 저장">
            진리표 내려받기
          </button>
          <button type="button" className="text-button" onClick={() => fileRef.current?.click()} title="CSV(쉼표·탭) 파일에서 표와 핀 이름을 불러오기">
            진리표 올리기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            hidden
            data-testid="lut-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {readOnly && (
        <div className="lut-controls">
          <button type="button" className="text-button" onClick={exportCsv}>
            진리표 내려받기
          </button>
        </div>
      )}
      {error && (
        <p className="warn small" role="alert">
          {error}
        </p>
      )}
      {loaded && (
        <p className="small" role="status">
          {loaded}
        </p>
      )}
      <p className="muted small">
        출력 칸을 누르면 0과 1이 바뀝니다. 입력은 A가 가장 높은 자리입니다 (행 번호 = 입력을 2진수로 읽은 값). 맨 위 칸에서 핀 이름을 바꿀 수 있습니다(최대 {MAX_PIN_NAME}자).
        <br />
        CSV 형식: 첫 줄은 핀 이름, 입력과 출력 사이에 <span className="mono">|</span> 열 (예: <span className="mono">A,B,|,S,C</span>), 그다음 줄마다 0/1. 빠진 줄은 0.
      </p>
      <div className="lut-scroll">
        <table className="lut-table">
          <thead>
            <tr>
              {Array.from({ length: n }, (_, k) => (
                <th key={`i${k}`} className="in" style={{ left: k * COL }}>
                  {readOnly ? (
                    inName(k)
                  ) : (
                    <input
                      className="lut-name"
                      aria-label={`입력 ${defaultInName(k)} 이름`}
                      value={inNames[k] ?? ''}
                      placeholder={defaultInName(k)}
                      maxLength={MAX_PIN_NAME}
                      onChange={(e) => setName(inNames, setInNames, k, e.target.value)}
                    />
                  )}
                </th>
              ))}
              {Array.from({ length: m }, (_, j) => (
                <th key={`o${j}`} className="out">
                  {readOnly ? (
                    outName(j)
                  ) : (
                    <input
                      className="lut-name"
                      aria-label={`출력 ${defaultOutName(j)} 이름`}
                      value={outNames[j] ?? ''}
                      placeholder={defaultOutName(j)}
                      maxLength={MAX_PIN_NAME}
                      onChange={(e) => setName(outNames, setOutNames, j, e.target.value)}
                    />
                  )}
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
                    <td key={`i${k}`} className={`in mono${b ? ' one' : ''}`} style={{ left: k * COL }}>
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
