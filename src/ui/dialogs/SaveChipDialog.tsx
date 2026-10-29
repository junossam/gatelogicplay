import { useMemo, useState } from 'react';
import { CHIP_COLORS, chipPinsFrom, circuitUses, countBrokenWires, uniqueName, usedBy } from '../../model/library';
import { compile, CompileError } from '../../sim/compile';
import { Engine } from '../../sim/engine';
import { orderedIO } from '../../sim/truthTable';
import { editorStore, useEditor, workspaceOf } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { chipPins, chipSize, GRID } from '../Canvas/geometry';
import { computeTable } from '../TruthTable/TruthTableView';
import { Modal } from './Modal';

const COLOR_NAMES: Record<string, string> = { 'chip-1': '주황', 'chip-2': '파랑', 'chip-3': '보라', 'chip-4': '초록', 'chip-5': '분홍' };

function ChipPreview({ name, color, pins }: { name: string; color: string; pins: ReturnType<typeof chipPinsFrom> }) {
  const { w, h } = chipSize(pins);
  const W = w * GRID;
  const H = h * GRID;
  return (
    <svg className="chip-preview" viewBox={`-30 -28 ${W + 60} ${H + 40}`} role="img" aria-label={`${name || '칩'} 미리보기`}>
      <text x={W / 2} y={-10} textAnchor="middle" className="part-label chip-name">
        {name || '이름 없음'}
      </text>
      <rect x={0} y={0} width={W} height={H} rx={6} className="chip-body" style={{ stroke: `var(--${color})` }} />
      <rect x={0} y={0} width={6} height={H} rx={3} style={{ fill: `var(--${color})` }} />
      {chipPins(pins).map((p) => (
        <g key={`${p.dir}${p.name}`}>
          <line x1={p.dx} y1={p.dy} x2={p.dir === 'in' ? -16 : W + 16} y2={p.dy} className="preview-lead" />
          <circle cx={p.dir === 'in' ? -16 : W + 16} cy={p.dy} r={4} className="pin-dot" />
          <text x={p.dir === 'in' ? 12 : W - 8} y={p.dy + 4} textAnchor={p.dir === 'in' ? 'start' : 'end'} className="chip-pin-name">
            {p.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function SaveChipDialog() {
  const setOpen = useUi((s) => s.setSaveOpen);
  const st = editorStore.getState();
  const circuit = useEditor((s) => s.circuit);
  const library = useEditor((s) => s.library);
  const openChipId = useEditor((s) => s.openChipId);
  const pinOrder = useEditor((s) => s.pinOrder);
  const current = openChipId ? library[openChipId] : undefined;

  const io = orderedIO(circuit, pinOrder);
  const [name, setName] = useState(current?.name ?? '');
  const [color, setColor] = useState(current?.color ?? CHIP_COLORS[0]);
  const [order, setOrder] = useState({ inputs: io.inputs.map((p) => p.id), outputs: io.outputs.map((p) => p.id) });
  const [names, setNames] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of [...io.inputs, ...io.outputs]) init[p.id] = current?.inputs.concat(current.outputs).find((x) => x.partId === p.id)?.name ?? p.label ?? p.id;
    return init;
  });
  const [propagate, setPropagate] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const pins = chipPinsFrom(circuit, { names, order });
  const users = current ? [...usedBy(current.id, library).map((d) => d.name), ...(circuitUses(workspaceOf(st), current.id) ? ['작업 공간'] : [])] : [];
  const broken = current && propagate ? countBrokenWires(library, { ...current, ...pins }, [workspaceOf(st)]) : 0;

  const summary = useMemo(() => {
    let feedback: boolean | null = null;
    try {
      feedback = new Engine(compile(circuit, library)).hasFeedback;
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
    }
    const t = computeTable(circuit, library, order, false);
    const table =
      t.status === 'ok'
        ? `${t.table.rows.length}행 생성${t.table.rows.some((r) => r.forbidden) ? ' · 금지 상태 포함' : ''}${t.table.rows.some((r) => r.outputs.includes('hold')) ? ' · 이전 유지 포함' : ''}`
        : t.status === 'manual'
          ? t.reason
          : t.status === 'error'
            ? t.message
            : '입력이나 출력이 없어 만들지 않음';
    return { parts: circuit.parts.length, feedback, table };
  }, [circuit, library, order]);

  const move = (side: 'inputs' | 'outputs', i: number, d: -1 | 1) => {
    const list = [...order[side]];
    const [x] = list.splice(i, 1);
    list.splice(i + d, 0, x!);
    setOrder({ ...order, [side]: list });
  };

  const save = () => {
    const r = editorStore.getState().saveChip({ name, color, names, order, propagate });
    if (r.ok) setOpen(false);
    else setErrors(r.errors);
  };

  const pinList = (side: 'inputs' | 'outputs', title: string) => (
    <fieldset className="pin-fields">
      <legend>{title}</legend>
      {order[side].length === 0 && <p className="muted small">없음</p>}
      {order[side].map((id, i) => (
        <div key={id} className="pin-field">
          <input
            className="field"
            aria-label={`${title} 핀 ${i + 1} 이름`}
            value={names[id] ?? ''}
            onChange={(e) => setNames({ ...names, [id]: e.target.value })}
          />
          <button type="button" className="icon-button" aria-label={`${names[id]} 위로`} disabled={i === 0} onClick={() => move(side, i, -1)}>
            ▲
          </button>
          <button type="button" className="icon-button" aria-label={`${names[id]} 아래로`} disabled={i === order[side].length - 1} onClick={() => move(side, i, 1)}>
            ▼
          </button>
        </div>
      ))}
    </fieldset>
  );

  return (
    <Modal
      title={current ? `칩 저장 · ${current.name}` : '칩으로 저장'}
      onClose={() => setOpen(false)}
      wide
      footer={
        <>
          <button type="button" className="text-button" onClick={() => setOpen(false)}>
            취소
          </button>
          <button type="button" className="text-button primary" onClick={save}>
            {current && !propagate ? `"${uniqueName(name.trim() || current.name, library)}"(으)로 새로 저장` : '저장'}
          </button>
        </>
      }
    >
      <div className="save-grid">
        <div className="save-form">
          <label className="field-label">
            이름 (필수)
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="칩 이름" required onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
          <fieldset className="swatches">
            <legend>색상</legend>
            {CHIP_COLORS.map((c) => (
              <label key={c} className="swatch" title={COLOR_NAMES[c]}>
                <input type="radio" name="chip-color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={COLOR_NAMES[c]} />
                <span style={{ background: `var(--${c})` }} />
              </label>
            ))}
          </fieldset>
          <div className="pin-fields-grid">
            {pinList('inputs', '입력')}
            {pinList('outputs', '출력')}
          </div>
        </div>
        <div className="save-side">
          <ChipPreview name={name} color={color} pins={pins} />
          <dl className="props small">
            <dt>내부 부품</dt>
            <dd>{summary.parts}개</dd>
            <dt>피드백 루프</dt>
            <dd>{summary.feedback === null ? '확인 불가' : summary.feedback ? '있음 (순차 회로)' : '없음 (조합 회로)'}</dd>
            <dt>진리표</dt>
            <dd data-testid="save-truth-summary">{summary.table}</dd>
          </dl>
          {current && users.length > 0 && (
            <div className="propagate">
              <label className="check">
                <input type="checkbox" checked={propagate} onChange={(e) => setPropagate(e.target.checked)} />
                사용하는 칩에도 변경 사항 반영
              </label>
              <p className="muted small">사용 중인 곳: {users.join(', ')}</p>
              {propagate && broken > 0 && <p className="warn small">핀이 삭제되거나 이름이 바뀌어 연결이 끊기는 전선: {broken}개</p>}
              {!propagate && <p className="muted small">끄면 기존 칩은 그대로 두고 새 칩으로 저장합니다.</p>}
            </div>
          )}
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="errors warn small" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
