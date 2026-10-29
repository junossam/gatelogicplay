import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { bitKey, partBits } from '../../sim/pins';
import { GATE_KINDS } from '../../sim/primitives';
import type { Part, PartKind, PinRef } from '../../sim/types';
import { editorStore, useEditor, useView } from '../../store/editorStore';
import { engine, simActions, simStore, useSim } from '../../store/simStore';
import { decodeKind, PART_DRAG_MIME, useUi } from '../../store/uiStore';
import { confirmLeaveChip } from '../Palette/Palette';
import { baseSize, boundsOf, GRID, normalizeRect, partRect, pinPoint, rectContains, type Rect } from './geometry';
import { challengeById, isAllowedIn } from '../../model/challenges';
import { PartView } from './PartView';
import { moveSegment, toPath } from './router';
import { layoutWires, type WireLayout } from './wireLayout';
import { WireView } from './WireView';

const MIN_ZOOM = 0.25;
/** 화면 밖으로 이만큼(px)까지는 미리 그려 둔다 */
const CULL_MARGIN = 120;

const intersects = (a: Rect, b: Rect) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
const MAX_ZOOM = 4;

type Point = { x: number; y: number };
type GridPt = { x: number; y: number };

type Gesture =
  | { type: 'drag'; start: Point; pointerId: number; partId: string; moved: boolean }
  | { type: 'wire'; from: PinRef; start: Point; pointerId: number }
  | { type: 'box'; start: Point; additive: boolean; pointerId: number }
  /** 선택한 전선의 index번째 구간을 직각 방향으로 옮기기 */
  | { type: 'segment'; wireId: string; index: number; base: GridPt[]; start: Point; pointerId: number; preview: GridPt[] }
  /** clearOnClick: 바닥을 끌지 않고 클릭만 했으면 선택 해제 */
  | { type: 'pan'; start: Point; pan: Point; pointerId: number; clearOnClick: boolean };

function parsePin(el: Element | null): PinRef | null {
  const target = el?.closest('[data-pin]');
  const raw = target?.getAttribute('data-pin');
  if (!raw) return null;
  const i = raw.lastIndexOf(':');
  return { partId: raw.slice(0, i), pin: raw.slice(i + 1) };
}

/** Esc: 배치 취소 → 선택 해제 → 한 단계 위로 (SPEC 11장) */
export function escapeAction() {
  const ui = useUi.getState();
  const st = editorStore.getState();
  if (ui.armed) return ui.setArmed(null);
  if (st.selection.parts.length || st.selection.wires.length) return st.clearSelection();
  if (st.viewPath.length) return st.setViewPath(st.viewPath.slice(0, -1));
  if (st.openChipId) confirmLeaveChip(() => editorStore.getState().closeChip());
}

function TickCount() {
  const tick = useSim((s) => s.tick);
  return <span data-testid="tick">틱 {tick}</span>;
}

export function Board() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { circuit, chain, prefix, readOnly } = useView();
  const library = useEditor((s) => s.library);
  const selection = useEditor((s) => s.selection);
  const dragging = useEditor((s) => s.dragBase !== null);
  const armed = useUi((s) => s.armed);
  const zoom = useUi((s) => s.zoom);
  const oscillating = useSim((s) => s.oscillating);
  const hasFeedback = useSim((s) => s.hasFeedback);
  const simError = useSim((s) => s.error);
  // 재컴파일되면 Net 번호가 바뀌므로 그때만 다시 계산
  const netlist = useSim(() => engine.netlist);

  const [pan, setPan] = useState<Point>({ x: 40, y: 40 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const space = useRef({ held: false, panned: false });
  const view = useRef({ pan, zoom });
  view.current = { pan, zoom };

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // 휠 확대/축소: 커서 위치를 기준으로. passive 리스너로는 기본 스크롤을 막을 수 없어 직접 등록한다.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { pan: p, zoom: z } = view.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * Math.exp(-e.deltaY * 0.0015)));
      const rect = svg.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setPan({ x: sx - ((sx - p.x) / z) * next, y: sy - ((sy - p.y) / z) * next });
      useUi.getState().setZoom(next);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const { pan: p, zoom: z } = view.current;
    return { x: (clientX - rect.left - p.x) / z, y: (clientY - rect.top - p.y) / z };
  };

  const focusCanvas = () => svgRef.current?.focus({ preventScroll: true });

  const place = (kind: PartKind, world: Point) => {
    const probe: Part = { id: '_', kind, x: 0, y: 0 };
    const { w, h } = baseSize(probe, library);
    // 커서가 부품 가운데에 오도록 놓고 격자에 맞춘다
    const x = Math.round(world.x / GRID - w / 2);
    const y = Math.round(world.y / GRID - h / 2);
    const st = editorStore.getState();
    // 챌린지에서 쓸 수 없는 부품은 끌어다 놓아도 배치하지 않는다
    const ch = st.openChallengeId ? challengeById(st.openChallengeId) : undefined;
    if (ch && !isAllowedIn(ch, kind, library)) return;
    if (kind.type === 'chip') st.addChip(kind.chipId, x, y);
    else st.addPart(kind.kind, x, y);
  };

  const onBackgroundDown = (e: PointerEvent<SVGElement>) => {
    const world = toWorld(e.clientX, e.clientY);
    svgRef.current?.setPointerCapture(e.pointerId);
    focusCanvas();
    if (e.button === 1 || space.current.held) {
      e.preventDefault();
      space.current.panned = true;
      setGesture({ type: 'pan', start: { x: e.clientX, y: e.clientY }, pan, pointerId: e.pointerId, clearOnClick: false });
      return;
    }
    if (e.button !== 0) return;
    if (armed && !readOnly) {
      place(armed, world);
      useUi.getState().setArmed(null);
      return;
    }
    if (e.shiftKey) {
      // Shift+드래그: 범위 선택 (Ctrl/⌘도 누르면 지금 선택에 더하기)
      setCursor(world);
      setGesture({ type: 'box', start: world, additive: e.ctrlKey || e.metaKey, pointerId: e.pointerId });
      return;
    }
    // 바닥을 끌면 화면 전체 이동
    setGesture({ type: 'pan', start: { x: e.clientX, y: e.clientY }, pan, pointerId: e.pointerId, clearOnClick: true });
  };

  const onPartDown = useCallback(
    (e: PointerEvent, partId: string) => {
      if (e.button !== 0 || space.current.held) return; // 배경 핸들러로 전파 (이동)
      e.stopPropagation();
      svgRef.current?.setPointerCapture(e.pointerId);
      focusCanvas();
      const store = editorStore.getState();
      if (e.shiftKey) {
        store.toggleSelection({ parts: [partId] });
        return;
      }
      if (!store.selection.parts.includes(partId)) store.setSelection({ parts: [partId] });
      if (readOnly) return;
      store.beginDrag();
      setGesture({ type: 'drag', start: toWorld(e.clientX, e.clientY), pointerId: e.pointerId, partId, moved: false });
    },
    // toWorld는 ref만 읽는다
     
    [readOnly],
  );

  const onPinDown = useCallback((e: PointerEvent, ref: PinRef) => {
    if (e.button !== 0 || space.current.held) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    focusCanvas();
    const world = toWorld(e.clientX, e.clientY);
    setCursor(world);
    setGesture({ type: 'wire', from: ref, start: world, pointerId: e.pointerId });
     
  }, []);

  const onPush = useCallback((partId: string, v: 0 | 1) => {
    if (engine.inputValue(partId) !== v) simActions.setInput(partId, v);
  }, []);

  // 포인터 캡처 때문에 dblclick은 svg로 오므로 좌표로 부품을 찾는다
  const onDoubleClick = (e: MouseEvent) => {
    const id = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-part-id]')?.getAttribute('data-part-id');
    if (id) editorStore.getState().enterInstance(id);
  };

  const onWireDown = useCallback((e: PointerEvent, wireId: string) => {
    if (e.button !== 0 || space.current.held) return;
    e.stopPropagation();
    focusCanvas();
    const store = editorStore.getState();
    if (e.shiftKey) store.toggleSelection({ wires: [wireId] });
    else store.setSelection({ wires: [wireId] });
  }, []);

  const onMove = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    if (gesture.type === 'pan') {
      setPan({ x: gesture.pan.x + e.clientX - gesture.start.x, y: gesture.pan.y + e.clientY - gesture.start.y });
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    if (gesture.type === 'segment') {
      const a = gesture.base[gesture.index]!;
      const b = gesture.base[gesture.index + 1]!;
      const d = a.y === b.y ? Math.round((world.y - gesture.start.y) / GRID) : Math.round((world.x - gesture.start.x) / GRID);
      setGesture({ ...gesture, preview: moveSegment(gesture.base, gesture.index, d) });
      return;
    }
    if (gesture.type === 'drag') {
      const dx = Math.round((world.x - gesture.start.x) / GRID);
      const dy = Math.round((world.y - gesture.start.y) / GRID);
      if ((dx || dy) && !gesture.moved) setGesture({ ...gesture, moved: true });
      editorStore.getState().dragBy(dx, dy);
    } else {
      setCursor(world);
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const store = editorStore.getState();
    if (gesture.type === 'segment') {
      if (gesture.preview !== gesture.base) store.setWirePoints(gesture.wireId, gesture.preview.slice(1, -1));
    } else if (gesture.type === 'pan') {
      const moved = Math.abs(e.clientX - gesture.start.x) + Math.abs(e.clientY - gesture.start.y) > 3;
      if (gesture.clearOnClick && !moved) store.clearSelection();
    } else if (gesture.type === 'drag') {
      store.endDrag();
      // 끌지 않고 클릭만 했으면 스위치를 토글
      const part = circuit.parts.find((p) => p.id === gesture.partId);
      if (!gesture.moved && part?.kind.type === 'primitive' && part.kind.kind === 'SWITCH') simActions.toggleSwitch(part.id, partBits(part));
    } else if (gesture.type === 'wire') {
      const target = parsePin(document.elementFromPoint(e.clientX, e.clientY));
      if (target) store.connect(gesture.from, target);
    } else if (gesture.type === 'box') {
      const world = toWorld(e.clientX, e.clientY);
      const box = normalizeRect(gesture.start.x, gesture.start.y, world.x, world.y);
      if (box.w < 3 && box.h < 3) {
        if (!gesture.additive) store.clearSelection();
      } else {
        const ids = circuit.parts.filter((p) => rectContains(box, partRect(p, library))).map((p) => p.id);
        if (gesture.additive) store.toggleSelection({ parts: ids.filter((id) => !store.selection.parts.includes(id)) });
        else store.setSelection({ parts: ids });
      }
    }
    setGesture(null);
  };

  const onCancel = () => {
    if (gesture?.type === 'drag') editorStore.getState().endDrag();
    setGesture(null);
  };

  // 단축키는 캔버스에 포커스가 있을 때만 (SPEC 11장)
  const onKeyDown = (e: KeyboardEvent) => {
    const store = editorStore.getState();
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) space.current = { held: true, panned: false };
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly) {
      e.preventDefault();
      store.deleteSelection();
    } else if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      store.redo();
    } else if (mod && key === 'g') {
      e.preventDefault();
      if (!readOnly) store.makeChipFromSelection();
    } else if (mod && key === 's') {
      e.preventDefault();
      if (!store.openChallengeId) useUi.getState().setSaveOpen(true);
    } else if (e.key === 'Enter') {
      const [only] = store.selection.parts;
      if (store.selection.parts.length === 1 && only) store.enterInstance(only);
    } else if (e.key === 'Escape') {
      escapeAction();
    } else if (e.key === '.' && !mod) {
      simActions.step();
    } else if (key === 'r' && !mod && !readOnly) {
      store.rotateSelection();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== ' ') return;
    // 스페이스를 눌렀다 떼기만 했으면 실행/일시정지, 끌어서 이동했으면 이동만
    if (space.current.held && !space.current.panned) simActions.toggle();
    space.current = { held: false, panned: false };
  };

  const partById = useMemo(() => new Map(circuit.parts.map((p) => [p.id, p])), [circuit.parts]);
  // 전선 경로는 회로가 바뀔 때만 찾고, 매 틱에는 값만 읽는다 (게이트 5천 개에서 60fps)
  // 부품을 끄는 동안은 움직인 전선만 단순 경로로, 놓으면 전체를 다시 찾는다
  const lastLayout = useRef<WireLayout | null>(null);
  const layout = useMemo(
    () => layoutWires(circuit, library, dragging ? lastLayout.current : null),
    // circuit 전체가 아니라 부품·전선 배열이 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [circuit.parts, circuit.wires, library, dragging],
  );
  useEffect(() => {
    lastLayout.current = layout;
  }, [layout]);
  const wireGeom = layout.wires;
  // 전선이 꽂힌 핀은 채운 점으로 (부품별 "a,y" 같은 문자열 — PartView memo가 깨지지 않게)
  const connectedPins = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (part: string, pin: string) => {
      if (!m.has(part)) m.set(part, new Set());
      m.get(part)!.add(pin);
    };
    for (const w of circuit.wires) {
      add(w.from.partId, w.from.pin);
      add(w.to.partId, w.to.pin);
    }
    return new Map([...m].map(([k, v]) => [k, [...v].sort().join(',')]));
  }, [circuit.wires]);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  // 전선 하나만 선택했으면 구간 손잡이를 보인다
  const selectedWireGeom = selection.wires.length === 1 && selection.parts.length === 0 ? layout.byId.get(selection.wires[0]!) : undefined;
  const partRects = useMemo(() => circuit.parts.map((p) => partRect(p, library)), [circuit.parts, library]);

  /** 모든 부품이 화면에 들어오게 배율과 위치를 맞춘다 (100%보다 크게 확대하지는 않음) */
  const fitView = useCallback(() => {
    const b = boundsOf(partRects);
    if (!b) return;
    const margin = 60;
    const z = Math.min(1, Math.max(MIN_ZOOM, Math.min((size.w - 2 * margin) / Math.max(b.w, 1), (size.h - 2 * margin) / Math.max(b.h, 1))));
    setPan({ x: size.w / 2 - (b.x + b.w / 2) * z, y: size.h / 2 - (b.y + b.h / 2) * z });
    useUi.getState().setZoom(z);
  }, [partRects, size]);

  // 다른 회로(칩 편집·칩 내부·챌린지)로 바뀌었는데 부품이 하나도 보이지 않으면 전체 보기.
  // 처음 열 때는 하지 않는다: 큰 회로를 25%까지 줄여 전부 그리면 느려진다.
  const docKey = `${useEditor((s) => s.openChipId)}|${useEditor((s) => s.openChallengeId)}|${prefix}`;
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    if (fittedKey.current === docKey || size.w < 50) return;
    const first = fittedKey.current === null;
    fittedKey.current = docKey;
    if (first) return;
    const { pan: p, zoom: z } = view.current;
    const vis = { x: -p.x / z, y: -p.y / z, w: size.w / z, h: size.h / z };
    if (partRects.length && !partRects.some((r) => intersects(vis, r))) fitView();
  }, [docKey, size, partRects, fitView]);
  // 전선마다 비트별 Net (버스는 여러 개)
  const wireNets = useMemo(
    () => wireGeom.map((g) => Array.from({ length: g.width }, (_, k) => netlist.pinNet.get(bitKey(prefix + g.source, k)) ?? -1)),
    [wireGeom, netlist, prefix],
  );
  const gateCount = useMemo(() => netlist.nodes.filter((n) => GATE_KINDS.has(n.kind)).length, [netlist]);

  // 전선 값은 React를 거치지 않고 바뀐 것만 DOM에 쓴다
  const wireEls = useRef(new Map<string, SVGGElement>());
  const register = useCallback((id: string, el: SVGGElement | null) => {
    if (el) wireEls.current.set(id, el);
    else wireEls.current.delete(id);
  }, []);
  const applyWireValues = useCallback(() => {
    const { values, netlist: nl } = engine;
    const osc = simStore.getState().oscillating;
    for (let i = 0; i < wireGeom.length; i++) {
      const el = wireEls.current.get(wireGeom[i]!.id);
      if (!el) continue;
      const nets = wireNets[i]!;
      // 버스는 비트 하나라도 1이면 강조
      const v = nets.some((n) => n >= 0 && values[n]) ? '1' : '0';
      if (el.dataset.value !== v) el.dataset.value = v;
      const o = osc.size > 0 && nets.some((n) => n >= 0 && osc.has(nl.netIds[n]!)) ? '1' : '0';
      if (el.dataset.osc !== o) el.dataset.osc = o;
    }
  }, [wireGeom, wireNets]);
  useLayoutEffect(() => {
    applyWireValues();
  });
  useEffect(() => simStore.subscribe(applyWireValues), [applyWireValues]);

  const selectedParts = new Set(selection.parts);
  const selectedWires = new Set(selection.wires);

  const visible: Rect = { x: -pan.x / zoom, y: -pan.y / zoom, w: size.w / zoom, h: size.h / zoom };
  // 화면 밖 부품과 전선은 그리지 않는다 (큰 회로에서 SVG 노드 수를 줄여 60fps 유지)
  const cull = { x: visible.x - CULL_MARGIN, y: visible.y - CULL_MARGIN, w: visible.w + 2 * CULL_MARGIN, h: visible.h + 2 * CULL_MARGIN };
  const shownParts = circuit.parts.filter((p, i) => intersects(cull, partRects[i]!) || selectedParts.has(p.id));
  const shownWires = wireGeom.filter((g) => intersects(cull, g.box));

  let preview: string | null = null;
  if (gesture?.type === 'wire') {
    const part = partById.get(gesture.from.partId);
    const a = part && pinPoint(part, gesture.from.pin, library);
    if (a) preview = `M${a.x} ${a.y} L${cursor.x} ${cursor.y}`;
  }
  const box = gesture?.type === 'box' ? normalizeRect(gesture.start.x, gesture.start.y, cursor.x, cursor.y) : null;
  const boxCount = box ? circuit.parts.filter((p) => rectContains(box, partRect(p, library))).length : 0;

  const viewing = chain[chain.length - 1];

  return (
    <div className="board">
      <svg
        ref={svgRef}
        className={`board-svg${armed && !readOnly ? ' armed' : ''}${gesture?.type === 'pan' ? ' panning' : ''}${readOnly ? ' readonly' : ''}`}
        tabIndex={0}
        role="application"
        aria-label="회로 캔버스"
        data-testid="canvas"
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => (space.current = { held: false, panned: false })}
        // 20px 점 격자는 CSS 배경으로 (SVG 패턴은 전선 값이 바뀔 때마다 다시 칠해져 느리다)
        style={{ backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
        onDragOver={(e) => {
          if (!readOnly && e.dataTransfer.types.includes(PART_DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const kind = decodeKind(e.dataTransfer.getData(PART_DRAG_MIME));
          if (!kind || readOnly) return;
          e.preventDefault();
          place(kind, toWorld(e.clientX, e.clientY));
          focusCanvas();
        }}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {shownWires.map((g) => (
            <WireView
              key={g.id}
              id={g.id}
              d={g.d}
              source={g.source}
              junctions={g.junctions}
              halo={layout.routed}
              bus={g.width > 1}
              selected={selectedWires.has(g.id)}
              highlight={hoverNet === g.source}
              onPointerDown={onWireDown}
              onHover={setHoverNet}
              register={register}
            />
          ))}
          {/* 구간 손잡이는 부품 아래에: 핀이 손잡이에 가려 전선 연결이 막히지 않도록 */}
          {selectedWireGeom && !readOnly && (
            <g className="segment-handles" data-testid="segment-handles">
              {gesture?.type === 'segment' && <path d={toPath(gesture.preview, GRID)} className="wire-preview" />}
              {(gesture?.type === 'segment' ? gesture.preview : selectedWireGeom.points).slice(0, -1).map((p, i) => {
                const q = (gesture?.type === 'segment' ? gesture.preview : selectedWireGeom.points)[i + 1]!;
                const horizontal = p.y === q.y;
                const cx = ((p.x + q.x) / 2) * GRID;
                const cy = ((p.y + q.y) / 2) * GRID;
                return (
                  <g key={i} className={`segment-handle ${horizontal ? 'h' : 'v'}`} data-testid={`segment-${i}`}>
                    <rect x={cx - 5} y={cy - 5} width={10} height={10} rx={2} className="segment-dot" />
                    <rect
                      x={cx - 12}
                      y={cy - 12}
                      width={24}
                      height={24}
                      className="segment-hit"
                      aria-label={`전선 구간 ${i + 1} ${horizontal ? '위아래' : '좌우'}로 옮기기`}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        svgRef.current?.setPointerCapture(e.pointerId);
                        const base = selectedWireGeom.points;
                        setGesture({ type: 'segment', wireId: selectedWireGeom.id, index: i, base, start: toWorld(e.clientX, e.clientY), pointerId: e.pointerId, preview: base });
                      }}
                    />
                  </g>
                );
              })}
            </g>
          )}
          {shownParts.map((p) => (
            <PartView
              key={p.id}
              part={p}
              chip={p.kind.type === 'chip' ? library[p.kind.chipId] : undefined}
              selected={selectedParts.has(p.id)}
              connected={connectedPins.get(p.id) ?? ''}
              prefix={prefix}
              readOnly={readOnly}
              onPartDown={onPartDown}
              onPinDown={onPinDown}
              onPush={onPush}
            />
          ))}
          {preview && <path d={preview} className="wire-preview" />}
          {box && (
            <g pointerEvents="none">
              <rect x={box.x} y={box.y} width={box.w} height={box.h} className="selection-box" />
              <text x={box.x} y={box.y - 6} className="selection-label">
                범위 선택 · 부품 {boxCount}개
              </text>
            </g>
          )}
        </g>
      </svg>
      <button type="button" className="icon-button fit-button" aria-label="전체 보기" title="모든 부품이 보이게 맞추기" onClick={fitView}>
        ⤢
      </button>
      <div className="canvas-overlay">
        {(simError || hasFeedback) && (
          <div className={`canvas-badge${simError || oscillating.size ? ' danger' : ''}`} role="status" data-testid="sim-badge">
            {simError ?? (oscillating.size ? '진동 중' : '피드백 루프 감지됨 · 안정')}
          </div>
        )}
        {viewing && (
          <div className="view-banner" data-testid="view-banner">
            <span>
              읽기 전용으로 보는 중 · <strong>{viewing.name}</strong>
            </span>
            <button type="button" className="text-button small-button" onClick={() => confirmLeaveChip(() => editorStore.getState().openChip(viewing.id))}>
              이 칩 편집
            </button>
            <button type="button" className="text-button small-button" onClick={escapeAction}>
              위로
            </button>
          </div>
        )}
      </div>
      <footer className="statusbar" data-testid="statusbar">
        <TickCount />
        <span>
          게이트 {gateCount} · 전선 {circuit.wires.length}
        </span>
        <span className="legend">
          <span className="legend-swatch off" aria-hidden="true" /> 0
          <span className="legend-swatch on" aria-hidden="true" /> 1
        </span>
        <span className="hint">드래그: 화면 이동 · Shift+드래그: 범위 선택</span>
        <span className="zoom">{Math.round(zoom * 100)}%</span>
      </footer>
    </div>
  );
}
