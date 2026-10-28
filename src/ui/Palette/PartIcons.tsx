import type { PrimitiveKind } from '../../sim/types';
import { kindSize, GRID } from '../Canvas/geometry';

/**
 * 부품 기호. 캔버스와 팔레트가 같은 도형을 쓴다.
 * 좌표계는 부품 크기(격자 칸 × 20px) 그대로이며, 핀 리드 선이 핀 위치까지 이어진다.
 */
export function PartShape({ kind, on = false }: { kind: PrimitiveKind; on?: boolean }) {
  const stroke = 'var(--text-2)';
  const body = { fill: 'var(--bg-chip)', stroke, strokeWidth: 2, strokeLinejoin: 'round' as const };
  const lead = { stroke, strokeWidth: 2 };

  switch (kind) {
    case 'AND':
      return (
        <g>
          <line x1={0} y1={20} x2={20} y2={20} {...lead} />
          <line x1={0} y1={60} x2={20} y2={60} {...lead} />
          <line x1={70} y1={40} x2={80} y2={40} {...lead} />
          <path d="M20 10 H40 A30 30 0 0 1 40 70 H20 Z" {...body} />
        </g>
      );
    case 'OR':
      return (
        <g>
          <line x1={0} y1={20} x2={24} y2={20} {...lead} />
          <line x1={0} y1={60} x2={24} y2={60} {...lead} />
          <line x1={72} y1={40} x2={80} y2={40} {...lead} />
          <path d="M16 10 Q34 40 16 70 Q50 70 72 40 Q50 10 16 10 Z" {...body} />
        </g>
      );
    case 'XOR':
      return (
        <g>
          <line x1={0} y1={20} x2={30} y2={20} {...lead} />
          <line x1={0} y1={60} x2={30} y2={60} {...lead} />
          <line x1={74} y1={40} x2={80} y2={40} {...lead} />
          <path d="M14 10 Q32 40 14 70" fill="none" {...lead} />
          <path d="M22 10 Q40 40 22 70 Q54 70 74 40 Q54 10 22 10 Z" {...body} />
        </g>
      );
    // 부정 게이트: 원래 기호 끝에 작은 원(버블)을 붙인다
    case 'NAND':
      return (
        <g>
          <line x1={0} y1={20} x2={14} y2={20} {...lead} />
          <line x1={0} y1={60} x2={14} y2={60} {...lead} />
          <line x1={72} y1={40} x2={80} y2={40} {...lead} />
          <path d="M14 10 H34 A30 30 0 0 1 34 70 H14 Z" {...body} />
          <circle cx={68} cy={40} r={4} {...body} />
        </g>
      );
    case 'NOR':
      return (
        <g>
          <line x1={0} y1={20} x2={18} y2={20} {...lead} />
          <line x1={0} y1={60} x2={18} y2={60} {...lead} />
          <line x1={70} y1={40} x2={80} y2={40} {...lead} />
          <path d="M10 10 Q28 40 10 70 Q42 70 62 40 Q42 10 10 10 Z" {...body} />
          <circle cx={66} cy={40} r={4} {...body} />
        </g>
      );
    case 'XNOR':
      return (
        <g>
          <line x1={0} y1={20} x2={22} y2={20} {...lead} />
          <line x1={0} y1={60} x2={22} y2={60} {...lead} />
          <line x1={70} y1={40} x2={80} y2={40} {...lead} />
          <path d="M6 10 Q24 40 6 70" fill="none" {...lead} />
          <path d="M14 10 Q32 40 14 70 Q44 70 62 40 Q44 10 14 10 Z" {...body} />
          <circle cx={66} cy={40} r={4} {...body} />
        </g>
      );
    case 'NOT':
      return (
        <g>
          <line x1={0} y1={20} x2={20} y2={20} {...lead} />
          <line x1={68} y1={20} x2={80} y2={20} {...lead} />
          <path d="M20 4 L56 20 L20 36 Z" {...body} />
          <circle cx={62} cy={20} r={5} {...body} />
        </g>
      );
    case 'SWITCH':
      return (
        <g>
          <line x1={44} y1={20} x2={60} y2={20} {...lead} />
          <rect x={6} y={10} width={38} height={20} rx={10} {...body} fill={on ? 'var(--sig-on)' : 'var(--bg-chip)'} />
          <circle cx={on ? 34 : 16} cy={20} r={6} fill={on ? 'var(--bg)' : 'var(--sig-off)'} />
        </g>
      );
    case 'PUSH':
      return (
        <g>
          <line x1={46} y1={20} x2={60} y2={20} {...lead} />
          <path
            d={on ? 'M14 26 Q26 14 38 26 Z' : 'M14 26 Q26 4 38 26 Z'}
            fill="var(--push-cap)"
            stroke={on ? 'var(--sig-on)' : stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <rect x={6} y={26} width={40} height={8} rx={2} {...body} />
        </g>
      );
    case 'LED':
      return (
        <g>
          <line x1={0} y1={20} x2={24} y2={20} {...lead} />
          {on && <circle cx={38} cy={20} r={18} fill="var(--sig-on)" opacity={0.25} />}
          <circle cx={38} cy={20} r={13} fill={on ? 'var(--sig-on)' : 'var(--sig-off)'} stroke={on ? 'var(--sig-on)' : stroke} strokeWidth={2} />
        </g>
      );
    case 'CLOCK':
      return (
        <g>
          <line x1={46} y1={20} x2={60} y2={20} {...lead} />
          <rect x={4} y={6} width={42} height={28} rx={4} {...body} />
          <path d="M10 26 V14 H20 V26 H30 V14 H40" fill="none" {...lead} />
        </g>
      );
  }
}

export function PartIcon({ kind, size = 36 }: { kind: PrimitiveKind; size?: number }) {
  const { w, h } = kindSize(kind);
  const vw = w * GRID;
  const vh = h * GRID;
  // 정사각형 아이콘 영역 안에 비율을 유지해 넣는다
  const side = Math.max(vw, vh);
  return (
    <svg width={size} height={size} viewBox={`${(vw - side) / 2} ${(vh - side) / 2} ${side} ${side}`} aria-hidden="true">
      <PartShape kind={kind} />
    </svg>
  );
}
