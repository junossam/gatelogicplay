import { useState } from 'react';
import type { PrimitiveKind } from '../../sim/types';
import { PART_DRAG_MIME, useUi } from '../../store/uiStore';
import { PartIcon } from './PartIcons';

interface Item {
  kind: PrimitiveKind;
  name: string;
  desc?: string;
}

const GATES: Item[] = [
  { kind: 'AND', name: 'AND' },
  { kind: 'NAND', name: 'NAND' },
  { kind: 'OR', name: 'OR' },
  { kind: 'NOR', name: 'NOR' },
  { kind: 'XOR', name: 'XOR' },
  { kind: 'XNOR', name: 'XNOR' },
  { kind: 'NOT', name: 'NOT' },
];

const IO: Item[] = [
  { kind: 'SWITCH', name: '스위치', desc: '누르면 켜짐 유지' },
  { kind: 'PUSH', name: '푸시 버튼', desc: '누르는 동안만 켜짐' },
  { kind: 'LED', name: 'LED', desc: '입력 값을 표시' },
];

function matches(item: Item, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || item.name.toLowerCase().includes(s) || item.kind.toLowerCase().includes(s) || !!item.desc?.includes(s);
}

function PaletteButton({ item, wide }: { item: Item; wide?: boolean }) {
  const armed = useUi((s) => s.armedKind === item.kind);
  const setArmed = useUi((s) => s.setArmed);
  return (
    <button
      type="button"
      className={`palette-item${wide ? ' wide' : ''}`}
      aria-pressed={armed}
      data-testid={`palette-${item.kind}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PART_DRAG_MIME, item.kind);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => setArmed(armed ? null : item.kind)}
      title={armed ? '캔버스를 클릭하면 배치됩니다' : '클릭한 뒤 캔버스를 클릭하거나, 끌어다 놓으세요'}
    >
      <PartIcon kind={item.kind} />
      <span className="palette-text">
        <span className="palette-name">{item.name}</span>
        {item.desc && <span className="palette-desc">{item.desc}</span>}
      </span>
    </button>
  );
}

export function Palette() {
  const [query, setQuery] = useState('');
  const gates = GATES.filter((i) => matches(i, query));
  const io = IO.filter((i) => matches(i, query));

  return (
    <aside className="palette" aria-label="부품 팔레트">
      <input
        className="palette-search"
        type="search"
        placeholder="부품 검색"
        aria-label="부품 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {gates.length > 0 && (
        <section>
          <h2 className="panel-title">기본 게이트</h2>
          <div className="palette-grid">
            {gates.map((item) => (
              <PaletteButton key={item.kind} item={item} />
            ))}
          </div>
        </section>
      )}
      {io.length > 0 && (
        <section>
          <h2 className="panel-title">입력 · 출력</h2>
          <div className="palette-list">
            {io.map((item) => (
              <PaletteButton key={item.kind} item={item} wide />
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="panel-title">내 칩</h2>
        <p className="muted small">아직 저장한 칩이 없습니다.</p>
      </section>
    </aside>
  );
}
