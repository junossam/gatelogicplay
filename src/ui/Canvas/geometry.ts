import { PRIMITIVE_PINS, type PinDir } from '../../sim/primitives';
import type { Part, PrimitiveKind } from '../../sim/types';

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

export function kindSize(kind: PrimitiveKind): { w: number; h: number } {
  return SIZES[kind];
}

export interface PinGeom {
  name: string;
  dir: PinDir;
  /** 부품 왼쪽 위 기준 px 오프셋 */
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

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function partRect(part: Part): Rect {
  const size = part.kind.type === 'primitive' ? SIZES[part.kind.kind] : { w: 4, h: 4 };
  return { x: part.x * GRID, y: part.y * GRID, w: size.w * GRID, h: size.h * GRID };
}

export function partPins(part: Part): PinGeom[] {
  return part.kind.type === 'primitive' ? kindPins(part.kind.kind) : [];
}

export function pinPoint(part: Part, pin: string): { x: number; y: number } | undefined {
  const g = partPins(part).find((p) => p.name === pin);
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
