import { memo, type PointerEvent } from 'react';

interface Props {
  id: string;
  d: string;
  selected: boolean;
  value: 0 | 1;
  oscillating: boolean;
  /** 갈라지는 지점이면 점을 찍을 위치 */
  branch?: { x: number; y: number };
  onPointerDown(e: PointerEvent, wireId: string): void;
}

export const WireView = memo(function WireView({ id, d, selected, value, oscillating, branch, onPointerDown }: Props) {
  return (
    <g
      data-testid={`wire-${id}`}
      data-value={value}
      className={`wire${selected ? ' selected' : ''}${value ? ' on' : ''}${oscillating ? ' osc' : ''}`}
    >
      <path d={d} className="wire-hit" onPointerDown={(e) => onPointerDown(e, id)} />
      <path d={d} className="wire-line" pointerEvents="none" />
      {branch && <circle cx={branch.x} cy={branch.y} r={4} className="wire-branch" pointerEvents="none" />}
    </g>
  );
});
