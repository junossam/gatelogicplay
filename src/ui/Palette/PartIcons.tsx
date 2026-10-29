import type { PrimitiveKind } from '../../sim/types';
import { kindSize, GRID } from '../Canvas/geometry';

/**
 * 부품 기호. 캔버스와 팔레트가 같은 도형을 쓴다.
 * 좌표계는 부품 크기(격자 칸 × 20px) 그대로이며, 핀 리드 선이 핀 위치까지 이어진다.
 */
/** 여러 비트 부품 기호 (나누기·묶기, 숫자 스위치·LED). 1비트 기호는 아래 PartShape. */
function BusShape({ kind, bits, value }: { kind: PrimitiveKind; bits: number; value: number }) {
  const stroke = 'var(--text-2)';
  const body = { fill: 'var(--bg-chip)', stroke, strokeWidth: 2, strokeLinejoin: 'round' as const };
  const bus = { stroke, strokeWidth: 4 };
  const lead = { stroke, strokeWidth: 2 };
  const h = 2 * bits * GRID;
  if (kind === 'SPLIT' || kind === 'MERGE') {
    const split = kind === 'SPLIT';
    const barX = split ? 12 : 28;
    return (
      <g>
        <rect x={barX - 3} y={8} width={6} height={h - 16} rx={2} fill="var(--text-2)" />
        <line x1={split ? 0 : barX} y1={h / 2} x2={split ? barX : 40} y2={h / 2} {...bus} />
        {Array.from({ length: bits }, (_, k) => {
          const y = (2 * k + 1) * GRID;
          return (
            <g key={k}>
              <line x1={split ? barX : 0} y1={y} x2={split ? 40 : barX} y2={y} {...lead} />
              <text x={split ? 22 : 8} y={y - 4} className="bus-bit-label">
                {k}
              </text>
            </g>
          );
        })}
      </g>
    );
  }
  const text = String(value);
  if (kind === 'SWITCH') {
    return (
      <g>
        <line x1={66} y1={20} x2={80} y2={20} {...bus} />
        <rect x={4} y={6} width={62} height={28} rx={6} {...body} />
        <text x={35} y={25} textAnchor="middle" className="bus-value">
          {text}
        </text>
      </g>
    );
  }
  // LED: 숫자 표시
  const on = value !== 0;
  return (
    <g>
      <line x1={0} y1={20} x2={14} y2={20} {...bus} />
      <rect x={14} y={6} width={62} height={28} rx={4} fill={on ? 'var(--sig-on)' : 'var(--sig-off)'} stroke={on ? 'var(--sig-on)' : stroke} strokeWidth={2} />
      <text x={45} y={25} textAnchor="middle" className={`bus-value${on ? ' on' : ''}`}>
        {text}
      </text>
    </g>
  );
}

export function PartShape({ kind, on = false, bits = 1, value = 0 }: { kind: PrimitiveKind; on?: boolean; bits?: number; value?: number }) {
  if (kind === 'SPLIT' || kind === 'MERGE' || ((kind === 'SWITCH' || kind === 'LED') && bits > 1)) return <BusShape kind={kind} bits={bits} value={value} />;
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
          <rect x={4} y={6} width={42} height={28} rx={4} {...body} stroke={on ? 'var(--sig-on)' : stroke} />
          <path d="M10 26 V14 H20 V26 H30 V14 H40" fill="none" {...lead} stroke={on ? 'var(--sig-on)' : stroke} />
        </g>
      );
  }
}

export function PartIcon({ kind, size = 36, bits = 1 }: { kind: PrimitiveKind; size?: number; bits?: number }) {
  const { w, h } = kindSize(kind, bits);
  const vw = w * GRID;
  const vh = h * GRID;
  // 정사각형 아이콘 영역 안에 비율을 유지해 넣는다
  const side = Math.max(vw, vh);
  return (
    <svg width={size} height={size} viewBox={`${(vw - side) / 2} ${(vh - side) / 2} ${side} ${side}`} aria-hidden="true">
      <PartShape kind={kind} bits={kind === 'SPLIT' || kind === 'MERGE' ? 2 : bits} />
    </svg>
  );
}
