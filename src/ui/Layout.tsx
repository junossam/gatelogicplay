import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { LAYOUT_LIMITS, useUi } from '../store/uiStore';

type Side = 'left' | 'right';

const NAMES: Record<Side, string> = { left: '부품 팔레트', right: '인스펙터' };

/** 패널 맨 위: 제목과 숨기기 버튼 */
export function PanelHead({ side, title }: { side: Side; title: string }) {
  return (
    <div className="panel-head">
      <span className="panel-head-title">{title}</span>
      <button
        type="button"
        className="icon-button panel-collapse"
        aria-label={`${NAMES[side]} 숨기기`}
        title={`${NAMES[side]} 숨기기`}
        onClick={() => useUi.getState().setPanelCollapsed(side, true)}
      >
        {side === 'left' ? '«' : '»'}
      </button>
    </div>
  );
}

/** 숨긴 패널 자리: 누르면 다시 펼친다 */
export function CollapsedRail({ side }: { side: Side }) {
  return (
    <div className={`collapsed-rail ${side}`}>
      <button
        type="button"
        className="icon-button"
        aria-label={`${NAMES[side]} 펼치기`}
        title={`${NAMES[side]} 펼치기`}
        onClick={() => useUi.getState().setPanelCollapsed(side, false)}
      >
        {side === 'left' ? '»' : '«'}
      </button>
      <span className="collapsed-label" aria-hidden="true">
        {side === 'left' ? '부품' : '속성'}
      </span>
    </div>
  );
}

/** 패널과 캔버스 사이 경계: 끌거나 ←→로 폭 조절, 두 번 누르면 기본 폭 */
export function Resizer({ side }: { side: Side }) {
  const width = useUi((s) => (side === 'left' ? s.leftWidth : s.rightWidth));
  const drag = useRef<{ x: number; w: number } | null>(null);
  const { min, max, initial } = LAYOUT_LIMITS[side];
  const set = (w: number) => useUi.getState().setPanelWidth(side, w);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    // 왼쪽 패널은 오른쪽으로 끌면 넓어지고, 오른쪽 패널은 왼쪽으로 끌면 넓어진다
    set(drag.current.w + (side === 'left' ? dx : -dx));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const grow = (e.key === 'ArrowRight') === (side === 'left');
      set(width + (grow ? step : -step));
    } else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
  };

  return (
    <div
      className={`resizer ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`${NAMES[side]} 폭 조절`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title="끌어서 폭 조절 · 두 번 누르면 기본 폭"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => set(initial)}
      onKeyDown={onKey}
    />
  );
}
