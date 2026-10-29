import type { Bit, PrimitiveKind } from './types';

export type PinDir = 'in' | 'out';

export interface PinDef {
  name: string;
  dir: PinDir;
}

const TWO_INPUT: readonly PinDef[] = [
  { name: 'a', dir: 'in' },
  { name: 'b', dir: 'in' },
  { name: 'y', dir: 'out' },
];

/** 8세그먼트 표시기의 세그먼트 이름 (핀 순서) */
export const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;

/** 기본 부품의 핀 정의 (SPEC 5.4). 순서가 곧 화면 위→아래 순서. */
export const PRIMITIVE_PINS: Record<PrimitiveKind, readonly PinDef[]> = {
  AND: TWO_INPUT,
  OR: TWO_INPUT,
  XOR: TWO_INPUT,
  NAND: TWO_INPUT,
  NOR: TWO_INPUT,
  XNOR: TWO_INPUT,
  NOT: [
    { name: 'a', dir: 'in' },
    { name: 'y', dir: 'out' },
  ],
  SWITCH: [{ name: 'y', dir: 'out' }],
  PUSH: [{ name: 'y', dir: 'out' }],
  CLOCK: [{ name: 'y', dir: 'out' }],
  LED: [{ name: 'a', dir: 'in' }],
  // 나누기·묶기의 실제 핀은 비트 수에 따라 달라진다 (sim/pins.ts). 여기는 기본 4비트.
  SPLIT: [{ name: 'a', dir: 'in' }, ...[0, 1, 2, 3].map((k) => ({ name: `y${k}`, dir: 'out' as const }))],
  MERGE: [...[0, 1, 2, 3].map((k) => ({ name: `a${k}`, dir: 'in' as const })), { name: 'y', dir: 'out' }],
  // 8세그먼트 표시기: 세그먼트 a~g와 점(dp). 출력 없이 값만 보여 준다.
  SEG8: SEGMENTS.map((name) => ({ name, dir: 'in' as const })),
};

export function pinDef(kind: PrimitiveKind, pin: string): PinDef | undefined {
  return PRIMITIVE_PINS[kind].find((p) => p.name === pin);
}

export const GATE_KINDS = new Set<PrimitiveKind>(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT']);

export const INPUT_KINDS = new Set<PrimitiveKind>(['SWITCH', 'PUSH']);

/**
 * 입력 n개 중 1이 ones개일 때 게이트 출력 (입력 2~8개 게이트).
 * AND = 모두 1, OR = 하나라도 1, XOR = 1이 홀수 개. NAND/NOR/XNOR는 그 반대. 연결 안 된 입력은 0.
 */
export function evalGateCount(kind: PrimitiveKind, ones: number, n: number): Bit {
  switch (kind) {
    case 'AND':
      return ones === n ? 1 : 0;
    case 'OR':
      return ones > 0 ? 1 : 0;
    case 'XOR':
      return (ones & 1) as Bit;
    case 'NAND':
      return ones === n ? 0 : 1;
    case 'NOR':
      return ones > 0 ? 0 : 1;
    case 'XNOR':
      return (1 - (ones & 1)) as Bit;
    case 'NOT':
      return ones ? 0 : 1;
    default:
      return 0;
  }
}

/** 2입력(또는 NOT) 게이트 평가 (SPEC 5.4). 연결 안 된 입력은 0으로 들어온다. */
export function evalGate(kind: PrimitiveKind, a: number, b: number): Bit {
  switch (kind) {
    case 'AND':
      return (a & b) as Bit;
    case 'OR':
      return (a | b) as Bit;
    case 'XOR':
      return (a ^ b) as Bit;
    case 'NAND':
      return (1 - (a & b)) as Bit;
    case 'NOR':
      return (1 - (a | b)) as Bit;
    case 'XNOR':
      return (1 - (a ^ b)) as Bit;
    case 'NOT':
      return (1 - a) as Bit;
    default:
      return 0;
  }
}
