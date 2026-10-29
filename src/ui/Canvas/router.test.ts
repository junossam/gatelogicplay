import { describe, expect, it } from 'vitest';
import { junctions, moveSegment, orthoJoin, routeAll, simplify, type Box, type Pt } from './router';

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

describe('전선 직접 꺾기', () => {
  it('moveSegment: 가운데 구간은 직각으로 옮기고, 이웃 구간은 그대로 직각', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 10, y: 4 },
    ];
    // 수직 구간(1번)을 오른쪽으로 2칸
    expect(moveSegment(path, 1, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 4 },
      { x: 10, y: 4 },
    ]);
  });

  it('moveSegment: 핀에 붙은 구간을 옮기면 끝점은 그대로 두고 꺾는 점을 넣는다', () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(moveSegment(straight, 0, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { x: 10, y: 3 },
      { x: 10, y: 0 },
    ]);
  });

  it('orthoJoin: 부품이 움직여 어긋나면 꺾는 점을 넣어 직각만 남긴다', () => {
    const path = orthoJoin({ x: 0, y: 1 }, [{ x: 4, y: 0 }, { x: 4, y: 6 }], { x: 9, y: 5 });
    for (let i = 0; i + 1 < path.length; i++) expect(path[i]!.x === path[i + 1]!.x || path[i]!.y === path[i + 1]!.y).toBe(true);
    expect(path[0]).toEqual({ x: 0, y: 1 });
    expect(path[path.length - 1]).toEqual({ x: 9, y: 5 });
    // 입력 핀에는 수평으로 들어간다
    expect(path[path.length - 2]!.y).toBe(5);
  });

  it('꺾은 전선은 고정되고 자동 경로 전선이 그 위로 겹치지 않는다', () => {
    const fixedPath = [
      { x: 0, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 8 },
      { x: 12, y: 8 },
    ];
    const routes = routeAll([{ id: 'w2', net: 'b', from: { x: 0, y: 8 }, to: { x: 12, y: 2 } }], [], [], [{ net: 'a', path: fixedPath }]);
    const p = routes.get('w2')!;
    const onFixed = (x: number, y: number) =>
      fixedPath.some((a, i) => {
        const b = fixedPath[i + 1];
        return b && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y);
      });
    // 같은 방향으로 이어 붙은 구간(겹침)이 없어야 한다: 연속한 두 점이 모두 고정 경로 위인 경우가 없음
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      const sx = Math.sign(b.x - a.x);
      const sy = Math.sign(b.y - a.y);
      for (let x = a.x, y = a.y; x !== b.x || y !== b.y; x += sx, y += sy) pts.push({ x, y });
    }
    for (let i = 0; i + 1 < pts.length; i++) expect(onFixed(pts[i]!.x, pts[i]!.y) && onFixed(pts[i + 1]!.x, pts[i + 1]!.y)).toBe(false);
  });
});
