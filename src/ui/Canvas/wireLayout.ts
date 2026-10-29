import type { Circuit, Library } from '../../sim/types';
import { GRID, partPins, partRect, pinPoint, type Rect } from './geometry';
import { junctions, routeAll, simpleRoute, toPath, type Pt, type RouteRequest } from './router';

/** 이보다 전선이 많으면 경로 찾기를 하지 않고 단순 경로로 그린다 (성능) */
export const ROUTE_WIRE_LIMIT = 1500;

export interface WireGeom {
  id: string;
  /** SVG path (px) */
  d: string;
  /** 출력 핀 `${부품}.${핀}` — 같은 Net 묶음 */
  source: string;
  /** 화면 밖 판정용 경계 (px) */
  box: Rect;
  /** 같은 Net 전선이 갈라지는 점 (px). Net의 마지막 전선에만 붙여 다른 전선 위에 그려지게 한다. */
  junctions: Pt[];
  /** 경로 (격자 칸) */
  points: Pt[];
}

export interface WireLayout {
  wires: WireGeom[];
  /** 경로 찾기를 했는가. 전선이 너무 많아 단순 경로로 그렸으면 교차 틈(테두리)도 생략한다 */
  routed: boolean;
  byId: Map<string, WireGeom>;
}

function bounds(points: Pt[]): Rect {
  const xs = points.map((p) => p.x * GRID);
  const ys = points.map((p) => p.y * GRID);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const samePt = (a: Pt | undefined, b: Pt) => a !== undefined && a.x === b.x && a.y === b.y;

/**
 * 전선 경로 배치.
 * 부품을 끄는 동안(prev가 있을 때)은 끝점이 그대로인 전선은 이전 경로를 쓰고,
 * 움직인 부품에 붙은 전선만 단순 경로로 그린다. 놓으면 다시 전체 경로를 찾는다.
 */
export function layoutWires(circuit: Circuit, library: Library, prev: WireLayout | null = null): WireLayout {
  const parts = new Map(circuit.parts.map((p) => [p.id, p]));
  const reqs: RouteRequest[] = [];
  for (const w of circuit.wires) {
    const fp = parts.get(w.from.partId);
    const tp = parts.get(w.to.partId);
    const a = fp && pinPoint(fp, w.from.pin, library);
    const b = tp && pinPoint(tp, w.to.pin, library);
    if (!a || !b) continue;
    reqs.push({ id: w.id, net: `${w.from.partId}.${w.from.pin}`, from: { x: a.x / GRID, y: a.y / GRID }, to: { x: b.x / GRID, y: b.y / GRID } });
  }

  let paths: Map<string, Pt[]>;
  const fresh = new Set<string>();
  const routed = reqs.length <= ROUTE_WIRE_LIMIT;
  if (prev) {
    paths = new Map();
    for (const r of reqs) {
      const old = prev.byId.get(r.id)?.points;
      if (old && samePt(old[0], r.from) && samePt(old[old.length - 1], r.to)) paths.set(r.id, old);
      else {
        paths.set(r.id, simpleRoute(r.from, r.to));
        fresh.add(r.net);
      }
    }
  } else if (!routed) {
    paths = new Map(reqs.map((r) => [r.id, simpleRoute(r.from, r.to)]));
  } else {
    const obstacles = circuit.parts.map((p) => {
      const r = partRect(p, library);
      return { x: r.x / GRID, y: r.y / GRID, w: r.w / GRID, h: r.h / GRID };
    });
    const terminals = circuit.parts.flatMap((p) => partPins(p, library).map((pin) => ({ x: p.x + pin.dx / GRID, y: p.y + pin.dy / GRID })));
    paths = routeAll(reqs, obstacles, terminals);
  }

  // Net별 접점: Net의 마지막 전선에 붙인다 (끄는 중에 바뀐 Net은 접점 생략)
  const lastOfNet = new Map<string, string>();
  const netPaths = new Map<string, Pt[][]>();
  for (const r of reqs) {
    lastOfNet.set(r.net, r.id);
    const list = netPaths.get(r.net);
    if (list) list.push(paths.get(r.id)!);
    else netPaths.set(r.net, [paths.get(r.id)!]);
  }
  const dots = new Map<string, Pt[]>();
  for (const [net, list] of netPaths) {
    if (list.length < 2 || fresh.has(net)) continue;
    dots.set(lastOfNet.get(net)!, junctions(list).map((p) => ({ x: p.x * GRID, y: p.y * GRID })));
  }

  const wires = reqs.map((r) => {
    const points = paths.get(r.id)!;
    return { id: r.id, d: toPath(points, GRID), source: r.net, box: bounds(points), junctions: dots.get(r.id) ?? [], points };
  });
  return { wires, routed, byId: new Map(wires.map((w) => [w.id, w])) };
}
