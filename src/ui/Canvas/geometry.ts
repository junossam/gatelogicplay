import { PRIMITIVE_PINS, type PinDir } from '../../sim/primitives';
import type { ChipDef, Library, Part, PrimitiveKind, Rotation } from '../../sim/types';

export const GRID = 20;

/** 부품 크기 (격자 칸 단위) */
const SIZES: Record<PrimitiveKind, { w: number; h: number }> = {
  AND: { w: 4, h: 4 },
  OR: { w: 4, h: 4 },
  XOR: { w: 4, h: 4 },
  NAND: { w: 4, h: 4 },
  NOR: { w: 4, h: 4 },
  XNOR: { w: 4, h: 4 },
  NOT: { w: 4, h: 2 },
  SWITCH: { w: 3, h: 2 },
  PUSH: { w: 3, h: 2 },
  CLOCK: { w: 3, h: 2 },
  LED: { w: 3, h: 2 },
};

/** 칩 블록 핀 간격 (격자 칸) */
export const CHIP_PIN_PITCH = 2;
export const CHIP_WIDTH = 6;

export function kindSize(kind: PrimitiveKind): { w: number; h: number } {
  return SIZES[kind];
}

/** 칩 블록 높이 = max(입력 수, 출력 수) × 핀 간격 (SPEC 4.2) */
export function chipSize(def: Pick<ChipDef, 'inputs' | 'outputs'>): { w: number; h: number } {
  return { w: CHIP_WIDTH, h: Math.max(def.inputs.length, def.outputs.length, 1) * CHIP_PIN_PITCH };
}

export interface PinGeom {
  name: string;
  dir: PinDir;
  /** 부품 왼쪽 위 기준 px 오프셋 (회전 반영) */
  dx: number;
  dy: number;
}

/** 입력 핀은 왼쪽 변, 출력 핀은 오른쪽 변에 격자점마다 고르게 배치한다. */
export function kindPins(kind: PrimitiveKind): PinGeom[] {
  const { w, h } = SIZES[kind];
  const pins = PRIMITIVE_PINS[kind];
  const place = (dir: PinDir, x: number) => {
    const list = pins.filter((p) => p.dir === dir);
    const step = h / (list.length + 1);
    return list.map((p, i) => ({ name: p.name, dir, dx: x * GRID, dy: Math.round(step * (i + 1)) * GRID }));
  };
  return [...place('in', 0), ...place('out', w)];
}

export function chipPins(def: Pick<ChipDef, 'inputs' | 'outputs'>): PinGeom[] {
  const { w } = chipSize(def);
  const at = (i: number) => (i * CHIP_PIN_PITCH + CHIP_PIN_PITCH / 2) * GRID;
  return [
    ...def.inputs.map((p, i) => ({ name: p.name, dir: 'in' as const, dx: 0, dy: at(i) })),
    ...def.outputs.map((p, i) => ({ name: p.name, dir: 'out' as const, dx: w * GRID, dy: at(i) })),
  ];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 회전 전 크기 (격자 칸) */
export function baseSize(part: Part, library: Library = {}): { w: number; h: number } {
  if (part.kind.type === 'primitive') return SIZES[part.kind.kind];
  const def = library[part.kind.chipId];
  return def ? chipSize(def) : { w: CHIP_WIDTH, h: CHIP_PIN_PITCH };
}

/** 회전 전 핀 */
export function basePins(part: Part, library: Library = {}): PinGeom[] {
  if (part.kind.type === 'primitive') return kindPins(part.kind.kind);
  const def = library[part.kind.chipId];
  return def ? chipPins(def) : [];
}

/**
 * 시계 방향 회전. 회전한 도형도 같은 왼쪽 위 칸에서 시작하므로
 * 격자점 위 핀은 회전 후에도 격자점 위에 있다.
 */
export function rotatePoint(x: number, y: number, W: number, H: number, rot: Rotation = 0): { x: number; y: number } {
  switch (rot) {
    case 90:
      return { x: H - y, y: x };
    case 180:
      return { x: W - x, y: H - y };
    case 270:
      return { x: y, y: W - x };
    default:
      return { x, y };
  }
}

/** SVG에서 회전 전 도형을 그릴 때 쓰는 변환 */
export function rotationTransform(W: number, H: number, rot: Rotation = 0): string | undefined {
  switch (rot) {
    case 90:
      return `translate(${H} 0) rotate(90)`;
    case 180:
      return `translate(${W} ${H}) rotate(180)`;
    case 270:
      return `translate(0 ${W}) rotate(270)`;
    default:
      return undefined;
  }
}

export function partRect(part: Part, library: Library = {}): Rect {
  const s = baseSize(part, library);
  const swap = part.rotation === 90 || part.rotation === 270;
  return { x: part.x * GRID, y: part.y * GRID, w: (swap ? s.h : s.w) * GRID, h: (swap ? s.w : s.h) * GRID };
}

export function partPins(part: Part, library: Library = {}): PinGeom[] {
  const s = baseSize(part, library);
  return basePins(part, library).map((p) => ({ ...p, ...toDelta(rotatePoint(p.dx, p.dy, s.w * GRID, s.h * GRID, part.rotation)) }));
}

const toDelta = (p: { x: number; y: number }) => ({ dx: p.x, dy: p.y });

export function pinPoint(part: Part, pin: string, library: Library = {}): { x: number; y: number } | undefined {
  const g = partPins(part, library).find((p) => p.name === pin);
  if (!g) return undefined;
  return { x: part.x * GRID + g.dx, y: part.y * GRID + g.dy };
}

/** 출력→입력 직교 경로 */
export function wirePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = Math.round((a.x + b.x) / 2);
  return `M${a.x} ${a.y} H${mx} V${b.y} H${b.x}`;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}
