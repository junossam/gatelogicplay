import type { PrimitiveKind } from './types';

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
};

export function pinDef(kind: PrimitiveKind, pin: string): PinDef | undefined {
  return PRIMITIVE_PINS[kind].find((p) => p.name === pin);
}

export const GATE_KINDS = new Set<PrimitiveKind>(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT']);
