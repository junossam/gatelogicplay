import { useState, type DragEvent, type ReactNode } from 'react';
import { GATE_KINDS, INPUT_KINDS } from '../../sim/primitives';
import { orderedIO } from '../../sim/truthTable';
import type { Part } from '../../sim/types';
import { circuitUses, usedBy } from '../../model/library';
import { editorStore, groupOfSelection, useEditor, useView, workspaceOf } from '../../store/editorStore';
import { useDisplayView } from '../Canvas/expand';
import { ExpandControl } from '../Canvas/ExpandControl';
import { PanelHead } from '../Layout';
import { useUi } from '../../store/uiStore';
import type { Group, Note } from '../../sim/types';
import { MAX_BITS, MAX_INPUTS, MULTI_INPUT_KINDS, partBits, partInputs, partPinSpecs, partOutputs } from '../../sim/pins';
import { engine, inputNumber, readPinNumber, simActions, useSim } from '../../store/simStore';
import { partPins } from '../Canvas/geometry';
import { TruthTableView, useTruthTable } from '../TruthTable/TruthTableView';

export const KIND_NAMES: Record<string, string> = {
  AND: 'AND 게이트',
  OR: 'OR 게이트',
  XOR: 'XOR 게이트',
  NAND: 'NAND 게이트',
  NOR: 'NOR 게이트',
  XNOR: 'XNOR 게이트',
  NOT: 'NOT 게이트',
  SWITCH: '스위치',
  PUSH: '푸시 버튼',
  LED: 'LED',
  CLOCK: '클럭',
  SPLIT: '나누기 (버스 → 비트)',
  MERGE: '묶기 (비트 → 버스)',
  SEG8: '8세그먼트 표시기',
  LUT: '진리표 부품',
  VCC: 'VCC (항상 1)',
  GND: 'GND (항상 0)',
};

/** 비트 수를 바꿀 수 있는 부품 (푸시 버튼·클럭은 1비트만) */
const BITS_KINDS = new Set(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT', 'SWITCH', 'LED', 'SPLIT', 'MERGE', 'VCC', 'GND']);

/** N비트 값: 10진수와 2진수 */
function MultiBit({ v, width }: { v: number; width: number }) {
  return (
    <span className="mono">
      <span className={`bit bit-${v ? 1 : 0}`}>{v}</span> <span className="muted small">0b{v.toString(2).padStart(width, '0')}</span>
    </span>
  );
}

function delayText(part: Part): string {
  if (part.kind.type === 'chip') return '내부 게이트마다 1틱';
  const k = part.kind.kind;
  if (GATE_KINDS.has(k)) return '1틱';
  if (INPUT_KINDS.has(k) || k === 'CLOCK') return '없음 (틱 시작에 반영)';
  if (k === 'SPLIT' || k === 'MERGE') return '없음 (배선)';
  return '없음 (표시만)';
}

function Bit({ v }: { v: 0 | 1 }) {
  return <span className={`bit bit-${v}`}>{v}</span>;
}

/** 엔터나 포커스 이동 시 반영되는 입력 */
function CommitInput({ value, onCommit, label, type = 'text' }: { value: string; onCommit(v: string): void; label: string; type?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="field"
      type={type}
      aria-label={label}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function PartDetails({ part, prefix, readOnly }: { part: Part; prefix: string; readOnly: boolean }) {
  const { circuit } = useView();
  const library = useEditor((s) => s.library);
  useSim((s) => s.version);
  const kind = part.kind.type === 'primitive' ? part.kind.kind : null;
  const labelled = kind === 'SWITCH' || kind === 'PUSH' || kind === 'LED';
  const value = (pin: string) => engine.readPin(`${prefix}${part.id}.${pin}`);
  const widths = new Map(partPinSpecs(part, library).map((p) => [`${p.dir}${p.name}`, p.width]));
  const bits = partBits(part);
  return (
    <dl className="props" data-testid="inspector-part">
      <dt>종류</dt>
      <dd>{kind ? KIND_NAMES[kind] : `칩 · ${library[(part.kind as { chipId: string }).chipId]?.name ?? '?'}`}</dd>
      <dt>ID</dt>
      <dd className="mono">{part.id}</dd>
      {labelled && (
        <>
          <dt>{kind === 'LED' ? '출력 핀 이름' : '입력 핀 이름'}</dt>
          <dd>
            {readOnly ? (
              <span className="mono">{part.label}</span>
            ) : (
              <CommitInput label="라벨" value={part.label ?? ''} onCommit={(v) => editorStore.getState().updatePart(part.id, { label: v.trim() })} />
            )}
          </dd>
        </>
      )}
      {kind === 'CLOCK' && (
        <>
          <dt>주파수</dt>
          <dd className="row">
            {readOnly ? (
              <span className="mono">{part.props?.hz ?? 1}</span>
            ) : (
              <CommitInput
                label="클럭 주파수(Hz)"
                type="number"
                value={String(part.props?.hz ?? 1)}
                onCommit={(v) => {
                  const hz = Number(v);
                  if (hz > 0) editorStore.getState().updatePart(part.id, { props: { hz } });
                }}
              />
            )}
            <span className="muted small">Hz</span>
          </dd>
        </>
      )}
      {kind === 'LUT' && (
        <>
          <dt>진리표</dt>
          <dd>
            입력 {partInputs(part)}개 · 출력 {partOutputs(part)}개
          </dd>
        </>
      )}
      {kind && MULTI_INPUT_KINDS.has(kind) && (
        <>
          <dt>입력 수</dt>
          <dd>
            {readOnly ? (
              <span className="mono">{partInputs(part)}</span>
            ) : (
              <select
                className="field"
                aria-label="입력 수"
                value={partInputs(part)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const props: { hz?: number; bits?: number; inputs?: number } = { ...part.props, inputs: n };
                  if (n === 2) delete props.inputs;
                  editorStore.getState().updatePart(part.id, { props: Object.keys(props).length ? props : undefined });
                }}
              >
                {Array.from({ length: MAX_INPUTS - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            )}
          </dd>
        </>
      )}
      {kind && BITS_KINDS.has(kind) && (
        <>
          <dt>비트 수</dt>
          <dd>
            {readOnly ? (
              <span className="mono">{bits}</span>
            ) : (
              <CommitInput
                label="비트 수"
                type="number"
                value={String(bits)}
                onCommit={(v) => {
                  const min = kind === 'SPLIT' || kind === 'MERGE' ? 2 : 1;
                  const n = Math.round(Number(v));
                  if (!(n >= min && n <= MAX_BITS)) return;
                  const props: { hz?: number; bits?: number; inputs?: number } = { ...part.props, bits: n };
                  if (n === 1) delete props.bits;
                  editorStore.getState().updatePart(part.id, { props: Object.keys(props).length ? props : undefined });
                }}
              />
            )}
          </dd>
        </>
      )}
      {kind === 'SWITCH' && bits > 1 && !readOnly && (
        <>
          <dt>값</dt>
          <dd>
            <CommitInput
              label="스위치 값"
              type="number"
              value={String(inputNumber(part.id, bits))}
              onCommit={(v) => {
                const n = Math.round(Number(v));
                if (n >= 0 && n < 2 ** bits) simActions.setInputNumber(part.id, n, bits);
              }}
            />
          </dd>
        </>
      )}
      <dt>지연</dt>
      <dd>{delayText(part)}</dd>
      {partPins(part, library).map((pin) => {
        const wires = circuit.wires.filter((w) =>
          pin.dir === 'in' ? w.to.partId === part.id && w.to.pin === pin.name : w.from.partId === part.id && w.from.pin === pin.name,
        );
        return (
          <div key={`${pin.dir}${pin.name}`} className="pin-row">
            <dt className="mono">
              {pin.dir === 'in' ? '입력' : '출력'} {pin.name}
            </dt>
            <dd>
              {(widths.get(`${pin.dir}${pin.name}`) ?? 1) > 1 ? (
                <MultiBit v={readPinNumber(`${prefix}${part.id}.${pin.name}`, widths.get(`${pin.dir}${pin.name}`)!)} width={widths.get(`${pin.dir}${pin.name}`)!} />
              ) : (
                <Bit v={value(pin.name)} />
              )}{' '}
              {pin.dir === 'in' ? (
                wires[0] ? (
                  <span className="mono muted">
                    ← {wires[0].from.partId}.{wires[0].from.pin}
                  </span>
                ) : (
                  <span className="warn">연결 안 됨 · 0으로 처리</span>
                )
              ) : (
                <span className="muted">→ {wires.length}개</span>
              )}
            </dd>
          </div>
        );
      })}
      {kind === 'LUT' && (
        <button type="button" className="text-button wide-button" onClick={() => useUi.getState().setLutEdit(part.id)}>
          {readOnly ? '진리표 보기' : '진리표 편집'}
        </button>
      )}
    </dl>
  );
}

/** 칩으로 만들 때의 입력·출력 핀 순서. 끌어서 또는 ▲▼로 바꾼다. */
function PinOrderEditor() {
  const circuit = useEditor((s) => s.circuit);
  const order = useEditor((s) => s.pinOrder);
  const io = orderedIO(circuit, order);
  const [dragging, setDragging] = useState<{ side: 'inputs' | 'outputs'; id: string } | null>(null);

  const move = (side: 'inputs' | 'outputs', id: string, to: number) => {
    const ids = io[side].map((p) => p.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    editorStore.getState().setPinOrder({ ...order, inputs: io.inputs.map((p) => p.id), outputs: io.outputs.map((p) => p.id), [side]: ids });
  };

  const list = (side: 'inputs' | 'outputs', title: string) => (
    <div>
      <h3 className="sub-title">{title}</h3>
      {io[side].length === 0 ? (
        <p className="muted small">없음</p>
      ) : (
        <ol className="pin-order" data-testid={`pin-order-${side}`}>
          {io[side].map((p, i) => (
            <li
              key={p.id}
              draggable
              onDragStart={(e: DragEvent) => {
                e.dataTransfer.effectAllowed = 'move';
                setDragging({ side, id: p.id });
              }}
              onDragOver={(e) => dragging?.side === side && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging?.side === side) move(side, dragging.id, i);
                setDragging(null);
              }}
            >
              <span className="mono">{p.label ?? p.id}</span>
              <span className="order-buttons">
                <button type="button" className="icon-button" aria-label={`${p.label ?? p.id} 위로`} disabled={i === 0} onClick={() => move(side, p.id, i - 1)}>
                  ▲
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${p.label ?? p.id} 아래로`}
                  disabled={i === io[side].length - 1}
                  onClick={() => move(side, p.id, i + 1)}
                >
                  ▼
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <div className="pin-order-grid">
      {list('inputs', '입력')}
      {list('outputs', '출력')}
    </div>
  );
}

function AutoTruthTable() {
  const [force, setForce] = useState(false);
  const state = useTruthTable(force);
  return <TruthTableView state={state} onForce={() => setForce(true)} />;
}

/** 이 칩을 포함하는 다른 칩 (SPEC 6.4) */
function UsedBy({ chipId }: { chipId: string }) {
  const library = useEditor((s) => s.library);
  const ws = useEditor(workspaceOf);
  const def = library[chipId];
  if (!def) return null;
  const users = [...usedBy(chipId, library).map((d) => d.name), ...(circuitUses(ws, chipId) ? ['작업 공간'] : [])];
  return (
    <>
      <h2 className="panel-title">사용 중인 곳 · {def.name}</h2>
      {users.length ? (
        <ul className="used-by" data-testid="used-by">
          {users.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">이 칩을 쓰는 곳이 없습니다.</p>
      )}
    </>
  );
}

/** 그룹 전체를 골랐을 때: 이름 바꾸기, 그룹 풀기 */
function GroupDetails({ group, readOnly }: { group: Group; readOnly: boolean }) {
  const [name, setName] = useState(group.name);
  const [prevId, setPrevId] = useState(group.id);
  if (prevId !== group.id) {
    setPrevId(group.id);
    setName(group.name);
  }
  const commit = () => {
    if (name.trim()) editorStore.getState().renameGroup(group.id, name);
    else setName(group.name);
  };
  return (
    <>
      <dl className="props">
        <dt>그룹</dt>
        <dd>
          {readOnly ? (
            group.name
          ) : (
            <input
              className="field"
              aria-label="그룹 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
            />
          )}
        </dd>
        <dt>부품</dt>
        <dd>{group.parts.length}개</dd>
      </dl>
      <p className="muted small">파형에는 이 그룹 경계를 드나드는 신호가 보입니다. 이름표를 끌면 그룹 전체가 움직입니다.</p>
      {!readOnly && (
        <button type="button" className="text-button wide-button" onClick={() => editorStore.getState().ungroup(group.id)}>
          그룹 풀기
        </button>
      )}
    </>
  );
}

/** 메모 하나를 골랐을 때: 내용 고치기 */
function NoteDetails({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const [text, setText] = useState(note.text);
  const [prev, setPrev] = useState(note);
  if (prev !== note) {
    setPrev(note);
    setText(note.text);
  }
  return (
    <>
      <label className="field-label">
        메모
        <textarea
          className="field note-field"
          aria-label="메모 내용 편집"
          rows={5}
          value={text}
          readOnly={readOnly}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => editorStore.getState().updateNote(note.id, text)}
        />
      </label>
      {!readOnly && (
        <button type="button" className="text-button wide-button" onClick={() => editorStore.getState().deleteSelection()}>
          메모 지우기
        </button>
      )}
    </>
  );
}

export function Inspector({ top, extra }: { top?: ReactNode; extra?: ReactNode }) {
  const { circuit, prefix, readOnly, chain } = useDisplayView();
  const openChipId = useEditor((s) => s.openChipId);
  const selection = useEditor((s) => s.selection);

  const selectedParts = circuit.parts.filter((p) => selection.parts.includes(p.id));
  const group = groupOfSelection(circuit, selection);
  const note =
    selection.notes.length === 1 && !selection.parts.length && !selection.wires.length
      ? circuit.notes?.find((n) => n.id === selection.notes[0])
      : undefined;
  const part = !group && selectedParts.length === 1 && selection.wires.length === 0 && !selection.notes.length ? selectedParts[0] : undefined;
  const wire =
    selection.wires.length === 1 && selection.parts.length === 0 ? circuit.wires.find((w) => w.id === selection.wires[0]) : undefined;

  return (
    <aside className="inspector" aria-label="인스펙터">
      <PanelHead side="right" title="속성" />
      <ExpandControl />
      {top}
      <h2 className="panel-title">선택한 부품</h2>
      {group ? (
        <GroupDetails group={group} readOnly={readOnly} />
      ) : note ? (
        <NoteDetails note={note} readOnly={readOnly} />
      ) : part ? (
        <PartDetails part={part} prefix={prefix} readOnly={readOnly} />
      ) : wire ? (
        <>
          <dl className="props">
            <dt>전선</dt>
            <dd className="mono">
              {wire.from.partId}.{wire.from.pin} → {wire.to.partId}.{wire.to.pin}
            </dd>
            <dt>경로</dt>
            <dd>{wire.points?.length ? '직접 꺾음' : '자동'}</dd>
          </dl>
          {!readOnly && (
            <p className="muted small">전선 위의 네모 손잡이를 끌면 그 구간을 옮겨 꺾을 수 있습니다.</p>
          )}
          {!readOnly && wire.points?.length ? (
            <button type="button" className="text-button wide-button" onClick={() => editorStore.getState().setWirePoints(wire.id, null)}>
              자동 경로로 되돌리기
            </button>
          ) : null}
        </>
      ) : selectedParts.length > 1 || selection.wires.length > 1 || selection.notes.length > 0 ? (
        <p className="muted small">
          부품 {selectedParts.length}개, 전선 {selection.wires.length}개{selection.notes.length ? `, 메모 ${selection.notes.length}개` : ''} 선택됨
        </p>
      ) : (
        <p className="muted small">부품이나 전선을 선택하세요.</p>
      )}
      {!readOnly && selectedParts.length > 0 && !group && (
        <button type="button" className="text-button wide-button" onClick={() => useUi.getState().setGroupEdit({ create: true })} title="Ctrl+Shift+G">
          그룹으로 묶기
        </button>
      )}
      {!readOnly && selectedParts.length > 0 && (
        <button type="button" className="text-button wide-button" onClick={() => editorStore.getState().makeChipFromSelection()} title="Ctrl+G">
          선택 범위를 칩으로 만들기
        </button>
      )}

      {!readOnly && (
        <>
          <h2 className="panel-title">핀 순서</h2>
          <PinOrderEditor />
        </>
      )}

      <h2 className="panel-title">진리표(자동)</h2>
      <AutoTruthTable />

      {(() => {
        // 보고 있는 칩, 편집 중인 칩, 또는 선택한 칩 부품의 사용처
        const selectedChip = part?.kind.type === 'chip' ? part.kind.chipId : null;
        const id = chain[chain.length - 1]?.id ?? selectedChip ?? openChipId;
        return id ? <UsedBy chipId={id} /> : null;
      })()}

      {extra}
    </aside>
  );
}
