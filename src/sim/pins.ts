// 핀과 비트 수 (SPEC 13장 8단계: 다중 비트 버스)
import { PRIMITIVE_PINS, type PinDir } from './primitives';
import type { Library, Part, PrimitiveKind } from './types';

export const MAX_BITS = 16;
export const BUS_DEFAULT_BITS = 4;

export interface PinSpec {
  name: string;
  dir: PinDir;
  /** 비트 수 */
  width: number;
}

const clampBits = (n: number | undefined, min = 1) => Math.min(MAX_BITS, Math.max(min, Math.round(n ?? min)));

/** 기본 부품의 비트 수. 푸시 버튼·클럭은 항상 1, 나누기·묶기는 2 이상(기본 4). */
export function primitiveBits(kind: PrimitiveKind, bits: number | undefined): number {
  if (kind === 'PUSH' || kind === 'CLOCK') return 1;
  if (kind === 'SPLIT' || kind === 'MERGE') return clampBits(bits ?? BUS_DEFAULT_BITS, 2);
  return clampBits(bits);
}

export function partBits(part: Part): number {
  return part.kind.type === 'primitive' ? primitiveBits(part.kind.kind, part.props?.bits) : 1;
}

/** 비트 수를 반영한 기본 부품의 핀 */
export function primitivePins(kind: PrimitiveKind, bits: number): PinSpec[] {
  const n = primitiveBits(kind, bits);
  if (kind === 'SPLIT') return [{ name: 'a', dir: 'in', width: n }, ...Array.from({ length: n }, (_, k) => ({ name: `y${k}`, dir: 'out' as const, width: 1 }))];
  if (kind === 'MERGE') return [...Array.from({ length: n }, (_, k) => ({ name: `a${k}`, dir: 'in' as const, width: 1 })), { name: 'y', dir: 'out', width: n }];
  return PRIMITIVE_PINS[kind].map((p) => ({ ...p, width: n }));
}

/** 부품의 핀 (칩이면 내부 스위치·LED의 비트 수가 핀 비트 수) */
export function partPinSpecs(part: Part, library: Library = {}): PinSpec[] {
  if (part.kind.type === 'primitive') return primitivePins(part.kind.kind, partBits(part));
  const def = library[part.kind.chipId];
  if (!def) return [];
  const inner = new Map(def.circuit.parts.map((p) => [p.id, p]));
  const width = (partId: string) => {
    const p = inner.get(partId);
    return p ? partBits(p) : 1;
  };
  return [
    ...def.inputs.map((p) => ({ name: p.name, dir: 'in' as const, width: width(p.partId) })),
    ...def.outputs.map((p) => ({ name: p.name, dir: 'out' as const, width: width(p.partId) })),
  ];
}

export function pinSpec(part: Part, pin: string, library: Library = {}): PinSpec | undefined {
  return partPinSpecs(part, library).find((p) => p.name === pin);
}

/** k번 비트의 id/키: 0번은 그대로, k번은 `[k]`를 붙인다 */
export const bitKey = (key: string, k: number) => (k === 0 ? key : `${key}[${k}]`);
