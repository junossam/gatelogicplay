import { useState, type DragEvent, type ReactNode } from 'react';
import { GATE_KINDS, INPUT_KINDS } from '../../sim/primitives';
import { orderedIO } from '../../sim/truthTable';
import type { Part } from '../../sim/types';
import { circuitUses, usedBy } from '../../model/library';
import { editorStore, useEditor, useView, workspaceOf } from '../../store/editorStore';
import { engine, useSim } from '../../store/simStore';
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
};

function delayText(part: Part): string {
  if (part.kind.type === 'chip') return '내부 게이트마다 1틱';
  const k = part.kind.kind;
  if (GATE_KINDS.has(k)) return '1틱';
  if (INPUT_KINDS.has(k) || k === 'CLOCK') return '없음 (틱 시작에 반영)';
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
              <Bit v={value(pin.name)} />{' '}
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

export function Inspector({ extra }: { extra?: ReactNode }) {
  const { circuit, prefix, readOnly, chain } = useView();
  const openChipId = useEditor((s) => s.openChipId);
  const selection = useEditor((s) => s.selection);

  const selectedParts = circuit.parts.filter((p) => selection.parts.includes(p.id));
  const part = selectedParts.length === 1 && selection.wires.length === 0 ? selectedParts[0] : undefined;
  const wire =
    selection.wires.length === 1 && selection.parts.length === 0 ? circuit.wires.find((w) => w.id === selection.wires[0]) : undefined;

  return (
    <aside className="inspector" aria-label="인스펙터">
      <h2 className="panel-title">선택한 부품</h2>
      {part ? (
        <PartDetails part={part} prefix={prefix} readOnly={readOnly} />
      ) : wire ? (
        <dl className="props">
          <dt>전선</dt>
          <dd className="mono">
            {wire.from.partId}.{wire.from.pin} → {wire.to.partId}.{wire.to.pin}
          </dd>
        </dl>
      ) : selectedParts.length > 1 || selection.wires.length > 1 ? (
        <p className="muted small">
          부품 {selectedParts.length}개, 전선 {selection.wires.length}개 선택됨
        </p>
      ) : (
        <p className="muted small">부품이나 전선을 선택하세요.</p>
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
