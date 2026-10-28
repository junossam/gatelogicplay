import { useEditor } from '../../store/editorStore';
import { partPins } from '../Canvas/geometry';

const KIND_NAMES: Record<string, string> = {
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

export function Inspector() {
  const circuit = useEditor((s) => s.circuit);
  const selection = useEditor((s) => s.selection);

  const selectedParts = circuit.parts.filter((p) => selection.parts.includes(p.id));
  const part = selectedParts.length === 1 && selection.wires.length === 0 ? selectedParts[0] : undefined;
  const wire =
    selection.wires.length === 1 && selection.parts.length === 0 ? circuit.wires.find((w) => w.id === selection.wires[0]) : undefined;

  return (
    <aside className="inspector" aria-label="인스펙터">
      <h2 className="panel-title">선택한 부품</h2>
      {part ? (
        <dl className="props" data-testid="inspector-part">
          <dt>종류</dt>
          <dd>{part.kind.type === 'primitive' ? KIND_NAMES[part.kind.kind] : '칩'}</dd>
          <dt>ID</dt>
          <dd className="mono">{part.id}</dd>
          {part.label && (
            <>
              <dt>라벨</dt>
              <dd className="mono">{part.label}</dd>
            </>
          )}
          {partPins(part).map((pin) => {
            const wires = circuit.wires.filter((w) =>
              pin.dir === 'in' ? w.to.partId === part.id && w.to.pin === pin.name : w.from.partId === part.id && w.from.pin === pin.name,
            );
            return (
              <div key={pin.name} className="pin-row">
                <dt className="mono">
                  {pin.dir === 'in' ? '입력' : '출력'} {pin.name}
                </dt>
                <dd>
                  {pin.dir === 'in' ? (
                    wires[0] ? (
                      <span className="mono">← {wires[0].from.partId}.{wires[0].from.pin}</span>
                    ) : (
                      <span className="warn">연결 안 됨 · 0으로 처리</span>
                    )
                  ) : (
                    <span>{wires.length}개 연결</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
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
      <h2 className="panel-title">도움말</h2>
      <ul className="help small muted">
        <li>팔레트에서 부품을 고른 뒤 캔버스를 클릭하거나 끌어다 놓아 배치합니다.</li>
        <li>출력 핀에서 끌어서 입력 핀에 놓으면 전선이 연결됩니다.</li>
        <li>빈 곳을 드래그하면 범위 선택, Shift+클릭은 선택 추가입니다.</li>
        <li>Delete로 삭제, Ctrl+Z로 실행 취소, 휠로 확대·축소합니다.</li>
      </ul>
    </aside>
  );
}
