import { SEGMENTS } from '../../sim/primitives';
import type { PrimitiveKind } from '../../sim/types';
import { kindPins, kindSize, GRID } from '../Canvas/geometry';

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

/** 8세그먼트 표시기 숫자 칸 (100×180 기준). 세그먼트마다 [x1, y1, x2, y2] */
const SEG_L = 44;
const SEG_R = 80;
const SEG_T = 28;
const SEG_M = 90;
const SEG_B = 152;
const SEG_LINES: Record<Exclude<(typeof SEGMENTS)[number], 'dp'>, [number, number, number, number]> = {
  a: [SEG_L + 6, SEG_T, SEG_R - 6, SEG_T],
  b: [SEG_R, SEG_T + 6, SEG_R, SEG_M - 6],
  c: [SEG_R, SEG_M + 6, SEG_R, SEG_B - 6],
  d: [SEG_L + 6, SEG_B, SEG_R - 6, SEG_B],
  e: [SEG_L, SEG_M + 6, SEG_L, SEG_B - 6],
  f: [SEG_L, SEG_T + 6, SEG_L, SEG_M - 6],
  g: [SEG_L + 6, SEG_M, SEG_R - 6, SEG_M],
};

/** 8세그먼트 표시기: 왼쪽에 핀 a~g·dp, value의 k번 비트가 SEGMENTS[k] 세그먼트 */
function SegmentShape({ value }: { value: number }) {
  const stroke = 'var(--text-2)';
  const lit = (k: number) => ((value >> k) & 1) === 1;
  const seg = (k: number) => ({
    stroke: lit(k) ? 'var(--sig-on)' : 'var(--sig-off)',
    opacity: lit(k) ? 1 : 0.45,
  });
  return (
    <g>
      {SEGMENTS.map((name, k) => (
        <line key={name} x1={0} y1={(k + 1) * GRID} x2={14} y2={(k + 1) * GRID} stroke={stroke} strokeWidth={2} />
      ))}
      <rect x={14} y={4} width={82} height={172} rx={6} fill="var(--bg-chip)" stroke={stroke} strokeWidth={2} />
      {SEGMENTS.map((name, k) => (
        <text key={name} x={19} y={(k + 1) * GRID + 4} className="seg-pin-name">
          {name}
        </text>
      ))}
      {SEGMENTS.map((name, k) => {
        if (name === 'dp') return <circle key={name} cx={SEG_R + 9} cy={SEG_B} r={4} fill={seg(k).stroke} opacity={seg(k).opacity} />;
        const [x1, y1, x2, y2] = SEG_LINES[name];
        return <line key={name} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={7} strokeLinecap="round" {...seg(k)} />;
      })}
    </g>
  );
}

/**
 * 입력 2~8개 게이트의 몸체 (80×80 기준 좌표). 입력이 많으면 세로로 늘린다.
 * inEnd: 입력 리드가 닿는 x, tip: 몸체 끝 x, bubble: 부정 원 중심 x, back: XOR 계열 뒤쪽 곡선
 */
const GATE_BODIES = {
  AND: { body: 'M20 10 H40 A30 30 0 0 1 40 70 H20 Z', inEnd: 20, tip: 70 },
  NAND: { body: 'M14 10 H34 A30 30 0 0 1 34 70 H14 Z', inEnd: 14, tip: 64, bubble: 68 },
  OR: { body: 'M16 10 Q34 40 16 70 Q50 70 72 40 Q50 10 16 10 Z', inEnd: 24, tip: 72 },
  NOR: { body: 'M10 10 Q28 40 10 70 Q42 70 62 40 Q42 10 10 10 Z', inEnd: 18, tip: 62, bubble: 66 },
  XOR: { body: 'M22 10 Q40 40 22 70 Q54 70 74 40 Q54 10 22 10 Z', back: 'M14 10 Q32 40 14 70', inEnd: 30, tip: 74 },
  XNOR: { body: 'M14 10 Q32 40 14 70 Q44 70 62 40 Q44 10 14 10 Z', back: 'M6 10 Q24 40 6 70', inEnd: 22, tip: 62, bubble: 66 },
} as const;

function GateShape({ kind, inputs }: { kind: keyof typeof GATE_BODIES; inputs: number }) {
  const g: { body: string; inEnd: number; tip: number; bubble?: number; back?: string } = GATE_BODIES[kind];
  const stroke = 'var(--text-2)';
  const H = Math.max(4, 2 * inputs) * GRID;
  const mid = H / 2;
  // 몸체만 세로로 늘리고, 선 굵기와 리드·부정 원은 늘리지 않는다
  const scale = H / 80;
  const outStart = g.bubble !== undefined ? g.bubble + 4 : g.tip;
  return (
    <g>
      {Array.from({ length: inputs }, (_, k) => (
        <line key={k} x1={0} y1={(2 * k + 1) * GRID} x2={g.inEnd} y2={(2 * k + 1) * GRID} stroke={stroke} strokeWidth={2} />
      ))}
      <line x1={outStart} y1={mid} x2={80} y2={mid} stroke={stroke} strokeWidth={2} />
      <g transform={scale === 1 ? undefined : `scale(1 ${scale})`}>
        {g.back && <path d={g.back} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        <path d={g.body} fill="var(--bg-chip)" stroke={stroke} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
      {g.bubble !== undefined && <circle cx={g.bubble} cy={mid} r={4} fill="var(--bg-chip)" stroke={stroke} strokeWidth={2} />}
    </g>
  );
}

/** 진리표 부품: 상자에 "진리표"와 핀 이름 (입력 A~, 출력 Y0~) */
function LutShape({ inputs, outputs, width, label, title }: { inputs: number; outputs: number; width: number; label: (pin: string) => string; title: string }) {
  const { w, h } = kindSize('LUT', 1, inputs, outputs, width);
  const W = w * GRID;
  const H = h * GRID;
  const stroke = 'var(--text-2)';
  const pins = kindPins('LUT', 1, inputs, outputs, width);
  return (
    <g>
      {pins.map((p) => (
        <line key={p.name} x1={p.dir === 'in' ? 0 : W - 14} y1={p.dy} x2={p.dir === 'in' ? 14 : W} y2={p.dy} stroke={stroke} strokeWidth={2} />
      ))}
      <rect x={14} y={4} width={W - 28} height={H - 8} rx={4} fill="var(--bg-chip)" stroke={stroke} strokeWidth={2} />
      {/* 표 모양 아이콘 */}
      <g stroke={stroke} strokeWidth={1} opacity={0.6}>
        <rect x={W / 2 - 9} y={H / 2 - 12} width={18} height={14} fill="none" />
        <line x1={W / 2 - 9} y1={H / 2 - 7} x2={W / 2 + 9} y2={H / 2 - 7} />
        <line x1={W / 2 + 2} y1={H / 2 - 12} x2={W / 2 + 2} y2={H / 2 + 2} />
      </g>
      <text x={W / 2} y={H / 2 + 14} textAnchor="middle" className="lut-title">
        {title}
      </text>
      {pins.map((p) => (
        <text key={p.name} x={p.dir === 'in' ? 18 : W - 18} y={p.dy + 4} textAnchor={p.dir === 'in' ? 'start' : 'end'} className="seg-pin-name">
          {label(p.name)}
        </text>
      ))}
    </g>
  );
}

export function PartShape({
  kind,
  on = false,
  bits = 1,
  value = 0,
  inputs = 2,
  outputs = 1,
  width = 5,
  pinLabel = (pin: string) => pin.toUpperCase(),
  title = '진리표',
}: {
  kind: PrimitiveKind;
  on?: boolean;
  bits?: number;
  value?: number;
  inputs?: number;
  outputs?: number;
  /** 진리표 부품 폭 (격자 칸) */
  width?: number;
  /** 진리표 부품 핀 이름 */
  pinLabel?: (pin: string) => string;
  /** 진리표 부품 가운데 이름 */
  title?: string;
}) {
  if (kind === 'LUT') return <LutShape inputs={inputs} outputs={outputs} width={width} label={pinLabel} title={title} />;
  if (kind === 'SPLIT' || kind === 'MERGE' || ((kind === 'SWITCH' || kind === 'LED') && bits > 1)) return <BusShape kind={kind} bits={bits} value={value} />;
  const stroke = 'var(--text-2)';
  const body = { fill: 'var(--bg-chip)', stroke, strokeWidth: 2, strokeLinejoin: 'round' as const };
  const lead = { stroke, strokeWidth: 2 };

  if (kind === 'SEG8') return <SegmentShape value={value} />;
  if (kind in GATE_BODIES) return <GateShape kind={kind as keyof typeof GATE_BODIES} inputs={inputs} />;

  switch (kind) {
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
    case 'VCC':
    case 'GND': {
      // 상수: 몸체에 이름, VCC는 1 색, GND는 0 색
      const vcc = kind === 'VCC';
      return (
        <g>
          <line x1={44} y1={20} x2={60} y2={20} {...lead} />
          <rect x={4} y={8} width={40} height={24} rx={4} {...body} stroke={vcc ? 'var(--sig-on)' : stroke} />
          <text x={24} y={24} textAnchor="middle" className={`const-label${vcc ? ' on' : ''}`}>
            {kind}
          </text>
        </g>
      );
    }
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
