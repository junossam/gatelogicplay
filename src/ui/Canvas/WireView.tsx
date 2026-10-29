import { memo, type PointerEvent } from 'react';
import type { Pt } from './router';

interface Props {
  id: string;
  d: string;
  selected: boolean;
  /** 마우스를 올린 전선과 같은 Net이면 강조 */
  highlight: boolean;
  source: string;
  /** 같은 Net이 갈라지는 점 */
  junctions: Pt[];
  /** 엇갈리는 곳에 틈을 내는 배경색 테두리 */
  halo: boolean;
  onPointerDown(e: PointerEvent, wireId: string): void;
  onHover(source: string | null): void;
  /** 값(data-value)과 진동(data-osc)은 Board가 틱마다 DOM에 직접 쓴다 — 전선마다 React 렌더를 피하려고 */
  register(id: string, el: SVGGElement | null): void;
}

export const WireView = memo(function WireView({ id, d, selected, highlight, source, junctions, halo, onPointerDown, onHover, register }: Props) {
  return (
    <g
      data-testid={`wire-${id}`}
      className={`wire${selected ? ' selected' : ''}${highlight ? ' highlight' : ''}`}
      ref={(el) => register(id, el)}
      onPointerEnter={() => onHover(source)}
      onPointerLeave={() => onHover(null)}
    >
      <path d={d} className="wire-hit" onPointerDown={(e) => onPointerDown(e, id)} />
      {/* 배경색 테두리: 다른 전선과 엇갈리는 곳이 끊겨 보여 연결되지 않았음을 알 수 있다 */}
      {halo && <path d={d} className="wire-halo" pointerEvents="none" />}
      <path d={d} className="wire-line" pointerEvents="none" />
      {junctions.map((p) => (
        <circle key={`${p.x},${p.y}`} cx={p.x} cy={p.y} r={4.5} className="wire-branch" pointerEvents="none" data-testid="junction" />
      ))}
    </g>
  );
});
