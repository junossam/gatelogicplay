import { describe, expect, it } from 'vitest';
import { junctions, routeAll, simplify, type Box, type Pt } from './router';

/** 경로가 지나는 모든 격자점 */
function cells(path: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const sx = Math.sign(b.x - a.x);
    const sy = Math.sign(b.y - a.y);
    for (let x = a.x, y = a.y; x !== b.x || y !== b.y; x += sx, y += sy) out.push({ x, y });
  }
  out.push(path[path.length - 1]!);
  return out;
}

const inside = (p: Pt, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

describe('전선 경로 찾기', () => {
  it('가운데 막힌 부품을 돌아간다', () => {
    const chip: Box = { x: 5, y: -3, w: 6, h: 6 };
    const routes = routeAll([{ id: 'w', net: 'a', from: { x: 0, y: 0 }, to: { x: 16, y: 0 } }], [chip], [{ x: 0, y: 0 }, { x: 16, y: 0 }]);
    const path = routes.get('w')!;
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 16, y: 0 });
    expect(cells(path).some((p) => inside(p, chip))).toBe(false);
    // 모든 구간이 수평 또는 수직
    for (let i = 0; i + 1 < path.length; i++) expect(path[i]!.x === path[i + 1]!.x || path[i]!.y === path[i + 1]!.y).toBe(true);
  });

  it('출력 핀은 부품 바깥쪽으로 나가고 입력 핀에는 바깥에서 들어온다', () => {
    // 출력 핀이 오른쪽 변(x=4)에 있는 부품, 목표는 부품 왼쪽 뒤편
    const part: Box = { x: 0, y: 0, w: 4, h: 4 };
    const target: Box = { x: -10, y: 0, w: 3, h: 2 };
    const from = { x: 4, y: 2 };
    const to = { x: -10, y: 1 };
    const path = routeAll([{ id: 'w', net: 'a', from, to }], [part, target], [from, to]).get('w')!;
    expect(path[1]!.x).toBeGreaterThan(4);
    expect(path[path.length - 2]!.x).toBeLessThan(-10);
    expect(cells(path).slice(1, -1).some((p) => inside(p, part) || inside(p, target))).toBe(false);
  });

  it('다른 Net 전선과 같은 선 위로 겹치지 않는다', () => {
    const routes = routeAll(
      [
        { id: 'w1', net: 'a', from: { x: 0, y: 0 }, to: { x: 10, y: 4 } },
        { id: 'w2', net: 'b', from: { x: 0, y: 2 }, to: { x: 10, y: 6 } },
      ],
      [],
      [],
    );
    const used = new Map<string, Set<string>>();
    for (const [id, path] of routes) {
      const c = cells(path);
      for (let i = 0; i + 1 < c.length; i++) {
        const e = [c[i], c[i + 1]].map((p) => `${p!.x},${p!.y}`).sort().join('|');
        if (!used.has(e)) used.set(e, new Set());
        used.get(e)!.add(id);
      }
    }
    expect([...used.values()].every((s) => s.size === 1)).toBe(true);
  });

  it('같은 Net 전선은 줄기를 공유하고 갈라지는 점에 접점이 생긴다', () => {
    const routes = routeAll(
      [
        { id: 'w1', net: 'a', from: { x: 0, y: 0 }, to: { x: 10, y: -4 } },
        { id: 'w2', net: 'a', from: { x: 0, y: 0 }, to: { x: 10, y: 4 } },
      ],
      // 출력 핀(0,0)은 왼쪽 부품의 오른쪽 변에 있다
      [{ x: -4, y: -2, w: 4, h: 4 }],
      [{ x: 0, y: 0 }],
    );
    const j = junctions([...routes.values()]);
    expect(j).toHaveLength(1);
    expect(j[0]!.x).toBeGreaterThan(0);
  });

  it('simplify는 꺾이는 점만 남긴다', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }, { x: 2, y: 3 }])).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 3 },
    ]);
  });
});
