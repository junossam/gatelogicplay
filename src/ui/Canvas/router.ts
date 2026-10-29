// 전선 경로 찾기: 격자 위 A* (좌표는 격자 칸 단위)
// - 부품 몸체(테두리 포함)는 지나갈 수 없다. 핀은 그 핀에서 시작하거나 끝나는 전선만 쓴다.
// - 꺾일 때마다 비용을 더해 경로를 단순하게 한다.
// - 다른 Net 전선과 같은 방향으로 겹치면(연결된 것처럼 보임) 아주 비싸게, 직각으로 건너가면 조금 비싸게,
//   다른 Net이 꺾이거나 갈라지는 점을 밟으면 비싸게 한다.
// - 같은 Net은 이미 깔린 길을 싸게 따라가서 줄기를 공유하고, 갈라지는 점에 접점을 찍는다.

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteRequest {
  id: string;
  /** 같은 출력 핀에서 나온 전선은 같은 net */
  net: string;
  from: Pt;
  to: Pt;
}

const COST = {
  step: 1,
  shared: 0.3,
  bend: 2.5,
  cross: 4,
  overlap: 60,
  touchCorner: 30,
};

/** 탐색 범위: 두 끝점을 감싼 상자에 더하는 여백 (칸) — 실패하면 넓혀서 다시 */
const MARGINS = [6, 20];

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const OFF = 1 << 15;
const key = (x: number, y: number) => (x + OFF) * 65536 + (y + OFF);

class MinHeap {
  private f: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(f: number, v: number) {
    const fs = this.f;
    const vs = this.v;
    let i = vs.length;
    fs.push(f);
    vs.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fs[p]! <= f) break;
      fs[i] = fs[p]!;
      vs[i] = vs[p]!;
      i = p;
    }
    fs[i] = f;
    vs[i] = v;
  }
  pop(): number {
    const fs = this.f;
    const vs = this.v;
    const top = vs[0]!;
    const lf = fs.pop()!;
    const lv = vs.pop()!;
    const n = vs.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && fs[r]! < fs[l]! ? r : l;
        if (fs[c]! >= lf) break;
        fs[i] = fs[c]!;
        vs[i] = vs[c]!;
        i = c;
      }
      fs[i] = lf;
      vs[i] = lv;
    }
    return top;
  }
}

/** 꺾이는 점만 남긴다 */
export function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const n = out.length;
    if (n && out[n - 1]!.x === p.x && out[n - 1]!.y === p.y) continue;
    if (n >= 2) {
      const a = out[n - 2]!;
      const b = out[n - 1]!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out[n - 1] = p;
      else out.push(p);
    } else out.push(p);
  }
  return out;
}

/** 경로를 못 찾을 때: 가로 → 세로 → 가로 */
export function simpleRoute(a: Pt, b: Pt): Pt[] {
  const mx = Math.round((a.x + b.x) / 2);
  return simplify([a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]);
}

export class Router {
  private blocked = new Set<number>();
  private hNets = new Map<number, string[]>();
  private vNets = new Map<number, string[]>();
  private turnNets = new Map<number, string[]>();

  constructor(obstacles: Box[], terminals: Pt[]) {
    for (const o of obstacles) {
      for (let x = o.x; x <= o.x + o.w; x++) for (let y = o.y; y <= o.y + o.h; y++) this.blocked.add(key(x, y));
    }
    for (const t of terminals) this.blocked.add(key(t.x, t.y));
  }

  private static add(map: Map<number, string[]>, k: number, net: string) {
    const list = map.get(k);
    if (!list) map.set(k, [net]);
    else if (!list.includes(net)) list.push(net);
  }

  /** 깔린 경로를 기록해 다음 전선이 피하거나(다른 Net) 따라가게(같은 Net) 한다 */
  commit(net: string, path: Pt[]) {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const map = a.y === b.y ? this.hNets : this.vNets;
      const sx = Math.sign(b.x - a.x);
      const sy = Math.sign(b.y - a.y);
      for (let x = a.x, y = a.y; ; x += sx, y += sy) {
        Router.add(map, key(x, y), net);
        if (x === b.x && y === b.y) break;
      }
    }
    for (const p of path) Router.add(this.turnNets, key(p.x, p.y), net);
  }

  private stepCost(k: number, horizontal: boolean, net: string): number {
    const same = (horizontal ? this.hNets : this.vNets).get(k);
    const other = (horizontal ? this.vNets : this.hNets).get(k);
    const turns = this.turnNets.get(k);
    let cost = COST.step;
    if (same) {
      for (const n of same) {
        if (n === net) cost = COST.shared;
        else cost += COST.overlap;
      }
    }
    if (other) for (const n of other) if (n !== net) cost += COST.cross;
    if (turns) for (const n of turns) if (n !== net) cost += COST.touchCorner;
    return cost;
  }

  /** 경로 하나 찾기. 못 찾으면 null */
  find(req: RouteRequest): Pt[] | null {
    for (const m of MARGINS) {
      const path = this.search(req, m);
      if (path) return path;
    }
    return null;
  }

  private search({ from, to, net }: RouteRequest, margin: number): Pt[] | null {
    const minX = Math.min(from.x, to.x) - margin;
    const minY = Math.min(from.y, to.y) - margin;
    const W = Math.abs(from.x - to.x) + 2 * margin + 1;
    const H = Math.abs(from.y - to.y) + 2 * margin + 1;
    const size = W * H * 4;
    const g = new Float64Array(size).fill(Infinity);
    const prev = new Int32Array(size).fill(-1);
    const heap = new MinHeap();
    const goalKey = key(to.x, to.y);
    const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
    const state = (x: number, y: number, d: number) => ((y - minY) * W + (x - minX)) * 4 + d;

    // 시작: 핀에서 나갈 수 있는 방향으로 한 칸 (부품 테두리가 막혀 있어 바깥쪽만 열려 있다)
    for (let d = 0; d < 4; d++) {
      const x = from.x + DX[d]!;
      const y = from.y + DY[d]!;
      const k = key(x, y);
      if (x < minX || y < minY || x >= minX + W || y >= minY + H) continue;
      if (this.blocked.has(k) && k !== goalKey) continue;
      const s = state(x, y, d);
      const c = this.stepCost(k, d < 2, net);
      if (c < g[s]!) {
        g[s] = c;
        prev[s] = -2;
        heap.push(c + h(x, y), s);
      }
    }

    while (heap.size) {
      const s = heap.pop();
      const d = s & 3;
      const cell = s >> 2;
      const x = (cell % W) + minX;
      const y = Math.floor(cell / W) + minY;
      if (x === to.x && y === to.y) return this.rebuild(s, prev, W, minX, minY, from);
      const gs = g[s]!;
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === d) continue; // 뒤로 돌기 금지
        const nx = x + DX[nd]!;
        const ny = y + DY[nd]!;
        if (nx < minX || ny < minY || nx >= minX + W || ny >= minY + H) continue;
        const k = key(nx, ny);
        if (this.blocked.has(k) && k !== goalKey) continue;
        const ns = state(nx, ny, nd);
        const c = gs + this.stepCost(k, nd < 2, net) + (nd === d ? 0 : COST.bend);
        if (c < g[ns]!) {
          g[ns] = c;
          prev[ns] = s;
          heap.push(c + h(nx, ny), ns);
        }
      }
    }
    return null;
  }

  private rebuild(s: number, prev: Int32Array, W: number, minX: number, minY: number, from: Pt): Pt[] {
    const pts: Pt[] = [];
    for (let cur = s; cur >= 0; cur = prev[cur]!) {
      const cell = cur >> 2;
      pts.push({ x: (cell % W) + minX, y: Math.floor(cell / W) + minY });
      if (prev[cur] === -2) break;
    }
    pts.push(from);
    return simplify(pts.reverse());
  }
}

/** 같은 Net 전선을 이어서, 짧은 Net부터 경로를 깐다 */
export function routeAll(reqs: RouteRequest[], obstacles: Box[], terminals: Pt[]): Map<string, Pt[]> {
  const router = new Router(obstacles, terminals);
  const len = (r: RouteRequest) => Math.abs(r.from.x - r.to.x) + Math.abs(r.from.y - r.to.y);
  const byNet = new Map<string, RouteRequest[]>();
  for (const r of reqs) {
    const list = byNet.get(r.net);
    if (list) list.push(r);
    else byNet.set(r.net, [r]);
  }
  const nets = [...byNet.values()].map((list) => list.sort((a, b) => len(a) - len(b)));
  nets.sort((a, b) => len(a[0]!) - len(b[0]!));
  const out = new Map<string, Pt[]>();
  for (const list of nets) {
    for (const r of list) {
      const path = router.find(r) ?? simpleRoute(r.from, r.to);
      router.commit(r.net, path);
      out.set(r.id, path);
    }
  }
  return out;
}

/** 같은 Net 경로들이 갈라지는 점 (세 방향 이상으로 이어진 점) */
export function junctions(paths: Pt[][]): Pt[] {
  const edges = new Set<string>();
  const degree = new Map<number, number>();
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const sx = Math.sign(b.x - a.x);
      const sy = Math.sign(b.y - a.y);
      for (let x = a.x, y = a.y; x !== b.x || y !== b.y; x += sx, y += sy) {
        const nx = x + sx;
        const ny = y + sy;
        const e = x < nx || y < ny ? `${x},${y},${nx},${ny}` : `${nx},${ny},${x},${y}`;
        if (edges.has(e)) continue;
        edges.add(e);
        degree.set(key(x, y), (degree.get(key(x, y)) ?? 0) + 1);
        degree.set(key(nx, ny), (degree.get(key(nx, ny)) ?? 0) + 1);
      }
    }
  }
  const out: Pt[] = [];
  for (const [k, d] of degree) if (d >= 3) out.push({ x: Math.floor(k / 65536) - OFF, y: (k % 65536) - OFF });
  return out;
}

export function toPath(points: Pt[], grid: number): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x * grid} ${p.y * grid}`).join(' ');
}
