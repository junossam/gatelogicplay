// 핀과 비트 수 (SPEC 13장 8단계: 다중 비트 버스)
import { PRIMITIVE_PINS, type PinDir } from './primitives';
import type { Library, Part, PrimitiveKind } from './types';

export const MAX_BITS = 16;
export const BUS_DEFAULT_BITS = 4;
/** 입력 수를 고를 수 있는 게이트 (2~8개) */
export const MULTI_INPUT_KINDS = new Set<PrimitiveKind>(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR']);
export const MAX_INPUTS = 8;
/** 진리표 부품의 입력·출력 수 범위 */
export const MAX_LUT_INPUTS = 8;
export const MAX_LUT_OUTPUTS = 16;

export interface PinSpec {
  name: string;
  dir: PinDir;
  /** 비트 수 */
  width: number;
}

const clampBits = (n: number | undefined, min = 1) => Math.min(MAX_BITS, Math.max(min, Math.round(n ?? min)));

/** 기본 부품의 비트 수. 푸시 버튼·클럭은 항상 1, 나누기·묶기는 2 이상(기본 4). */
export function primitiveBits(kind: PrimitiveKind, bits: number | undefined): number {
  if (kind === 'PUSH' || kind === 'CLOCK' || kind === 'SEG8' || kind === 'LUT') return 1;
  if (kind === 'SPLIT' || kind === 'MERGE') return clampBits(bits ?? BUS_DEFAULT_BITS, 2);
  return clampBits(bits);
}

export function partBits(part: Part): number {
  return part.kind.type === 'primitive' ? primitiveBits(part.kind.kind, part.props?.bits) : 1;
}

/** 게이트 입력 수 (AND·OR·XOR·NAND·NOR·XNOR는 2~8, 없으면 2) */
export function gateInputs(kind: PrimitiveKind, inputs: number | undefined): number {
  if (kind === 'LUT') return Math.min(MAX_LUT_INPUTS, Math.max(1, Math.round(inputs ?? 2)));
  return MULTI_INPUT_KINDS.has(kind) ? Math.min(MAX_INPUTS, Math.max(2, Math.round(inputs ?? 2))) : 2;
}

/** 진리표 부품의 출력 수 (1~16, 없으면 1). 다른 부품은 의미 없음. */
export function lutOutputs(outputs: number | undefined): number {
  return Math.min(MAX_LUT_OUTPUTS, Math.max(1, Math.round(outputs ?? 1)));
}

export function partOutputs(part: Part): number {
  return part.kind.type === 'primitive' && part.kind.kind === 'LUT' ? lutOutputs(part.props?.outputs) : 1;
}

/** 진리표 부품 가운데 이름 (부품 라벨, 없으면 "진리표") */
export const LUT_TITLE_DEFAULT = '진리표';
export const MAX_LUT_TITLE = 12;
export function lutTitle(part: Part): string {
  return part.label?.trim() || LUT_TITLE_DEFAULT;
}

/** 화면에 보일 핀 이름: 진리표 부품은 사용자가 정한 이름(없으면 A~·Y0~), 나머지는 핀 이름 그대로 */
export function pinLabel(part: Part, pin: string): string {
  if (part.kind.type !== 'primitive' || part.kind.kind !== 'LUT') return pin;
  const out = /^y(\d+)$/.exec(pin);
  if (out) return part.props?.outNames?.[Number(out[1])] || `Y${out[1]}`;
  return part.props?.inNames?.[pin.charCodeAt(0) - 97] || pin.toUpperCase();
}

/** 진리표 부품의 표: 2^입력 수 행, 각 행은 출력 비트 묶음 (빠진 행은 0) */
export function lutTable(part: Part): number[] {
  const n = partInputs(part);
  const mask = (1 << partOutputs(part)) - 1;
  const t = part.props?.table ?? [];
  return Array.from({ length: 1 << n }, (_, i) => (t[i] ?? 0) & mask);
}

export function partInputs(part: Part): number {
  return part.kind.type === 'primitive' ? gateInputs(part.kind.kind, part.props?.inputs) : 2;
}

/** 입력 핀 이름: a, b, c, … */
export const inputPinName = (k: number) => String.fromCharCode(97 + k);

/** 비트 수(와 게이트 입력 수)를 반영한 기본 부품의 핀 */
export function primitivePins(kind: PrimitiveKind, bits: number, inputs = 2, outputs = 1): PinSpec[] {
  const n = primitiveBits(kind, bits);
  if (kind === 'LUT') {
    const ni = gateInputs(kind, inputs);
    const no = lutOutputs(outputs);
    return [
      ...Array.from({ length: ni }, (_, k) => ({ name: inputPinName(k), dir: 'in' as const, width: 1 })),
      ...Array.from({ length: no }, (_, k) => ({ name: `y${k}`, dir: 'out' as const, width: 1 })),
    ];
  }
  if (MULTI_INPUT_KINDS.has(kind)) {
    const m = gateInputs(kind, inputs);
    return [...Array.from({ length: m }, (_, k) => ({ name: inputPinName(k), dir: 'in' as const, width: n })), { name: 'y', dir: 'out', width: n }];
  }
  if (kind === 'SPLIT') return [{ name: 'a', dir: 'in', width: n }, ...Array.from({ length: n }, (_, k) => ({ name: `y${k}`, dir: 'out' as const, width: 1 }))];
  if (kind === 'MERGE') return [...Array.from({ length: n }, (_, k) => ({ name: `a${k}`, dir: 'in' as const, width: 1 })), { name: 'y', dir: 'out', width: n }];
  return PRIMITIVE_PINS[kind].map((p) => ({ ...p, width: n }));
}

/** 부품의 핀 (칩이면 내부 스위치·LED의 비트 수가 핀 비트 수) */
export function partPinSpecs(part: Part, library: Library = {}): PinSpec[] {
  if (part.kind.type === 'primitive') return primitivePins(part.kind.kind, partBits(part), partInputs(part), partOutputs(part));
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
