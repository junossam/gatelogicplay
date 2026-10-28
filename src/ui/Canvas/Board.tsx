import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { PinRef, PrimitiveKind } from '../../sim/types';
import { GATE_KINDS } from '../../sim/primitives';
import { editorStore, useEditor } from '../../store/editorStore';
import { PART_DRAG_MIME, useUi } from '../../store/uiStore';
import { GRID, kindSize, normalizeRect, partRect, pinPoint, rectContains, wirePath, type Rect } from './geometry';
import { PartView } from './PartView';
import { WireView } from './WireView';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

type Point = { x: number; y: number };

type Gesture =
  | { type: 'drag'; start: Point; pointerId: number }
  | { type: 'wire'; from: PinRef; start: Point; pointerId: number }
  | { type: 'box'; start: Point; additive: boolean; pointerId: number }
  | { type: 'pan'; start: Point; pan: Point; pointerId: number };

function parsePin(el: Element | null): PinRef | null {
  const target = el?.closest('[data-pin]');
  const raw = target?.getAttribute('data-pin');
  if (!raw) return null;
  const i = raw.lastIndexOf(':');
  return { partId: raw.slice(0, i), pin: raw.slice(i + 1) };
}

export function Board() {
  const svgRef = useRef<SVGSVGElement>(null);
  const circuit = useEditor((s) => s.circuit);
  const selection = useEditor((s) => s.selection);
  const armedKind = useUi((s) => s.armedKind);
  const zoom = useUi((s) => s.zoom);

  const [pan, setPan] = useState<Point>({ x: 40, y: 40 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const spaceHeld = useRef(false);
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
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  };

  const place = (kind: PrimitiveKind, world: Point) => {
    const { w, h } = kindSize(kind);
    // 커서가 부품 가운데에 오도록 놓고 격자에 맞춘다
    editorStore.getState().addPart(kind, Math.round(world.x / GRID - w / 2), Math.round(world.y / GRID - h / 2));
  };

  const capture = (e: PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    svgRef.current?.focus();
  };

  const onBackgroundDown = (e: PointerEvent<SVGElement>) => {
    const world = toWorld(e.clientX, e.clientY);
    capture(e);
    if (e.button === 1 || spaceHeld.current) {
      e.preventDefault();
      setGesture({ type: 'pan', start: { x: e.clientX, y: e.clientY }, pan, pointerId: e.pointerId });
      return;
    }
    if (e.button !== 0) return;
    if (armedKind) {
      place(armedKind, world);
      useUi.getState().setArmed(null);
      return;
    }
    setCursor(world);
    setGesture({ type: 'box', start: world, additive: e.shiftKey, pointerId: e.pointerId });
  };

  const onPartDown = (e: PointerEvent, partId: string) => {
    if (e.button !== 0 || spaceHeld.current) return; // 배경 핸들러로 전파 (이동)
    e.stopPropagation();
    capture(e);
    const store = editorStore.getState();
    if (e.shiftKey) {
      store.toggleSelection({ parts: [partId] });
      return;
    }
    if (!store.selection.parts.includes(partId)) store.setSelection({ parts: [partId] });
    store.beginDrag();
    setGesture({ type: 'drag', start: toWorld(e.clientX, e.clientY), pointerId: e.pointerId });
  };

  const onPinDown = (e: PointerEvent, ref: PinRef) => {
    if (e.button !== 0 || spaceHeld.current) return; // 배경 핸들러로 전파 (이동)
    e.stopPropagation();
    capture(e);
    const world = toWorld(e.clientX, e.clientY);
    setCursor(world);
    setGesture({ type: 'wire', from: ref, start: world, pointerId: e.pointerId });
  };

  const onWireDown = (e: PointerEvent, wireId: string) => {
    if (e.button !== 0 || spaceHeld.current) return; // 배경 핸들러로 전파 (이동)
    e.stopPropagation();
    svgRef.current?.focus();
    const store = editorStore.getState();
    if (e.shiftKey) store.toggleSelection({ wires: [wireId] });
    else store.setSelection({ wires: [wireId] });
  };

  const onMove = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    if (gesture.type === 'pan') {
      setPan({ x: gesture.pan.x + e.clientX - gesture.start.x, y: gesture.pan.y + e.clientY - gesture.start.y });
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    if (gesture.type === 'drag') {
      editorStore.getState().dragBy(Math.round((world.x - gesture.start.x) / GRID), Math.round((world.y - gesture.start.y) / GRID));
    } else {
      setCursor(world);
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const store = editorStore.getState();
    if (gesture.type === 'drag') {
      store.endDrag();
    } else if (gesture.type === 'wire') {
      const target = parsePin(document.elementFromPoint(e.clientX, e.clientY));
      if (target) store.connect(gesture.from, target);
    } else if (gesture.type === 'box') {
      const world = toWorld(e.clientX, e.clientY);
      const box = normalizeRect(gesture.start.x, gesture.start.y, world.x, world.y);
      if (box.w < 3 && box.h < 3) {
        if (!gesture.additive) store.clearSelection();
      } else {
        const ids = circuit.parts.filter((p) => rectContains(box, partRect(p))).map((p) => p.id);
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

  const onKeyDown = (e: KeyboardEvent) => {
    const store = editorStore.getState();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') {
      spaceHeld.current = true;
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      store.deleteSelection();
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
    } else if (e.key === 'Escape') {
      useUi.getState().setArmed(null);
      store.clearSelection();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') spaceHeld.current = false;
  };

  // 갈라지는 출력 핀(전선 2개 이상)에 점을 찍는다
  const fanout = new Map<string, number>();
  for (const w of circuit.wires) {
    const key = `${w.from.partId}:${w.from.pin}`;
    fanout.set(key, (fanout.get(key) ?? 0) + 1);
  }
  const partById = new Map(circuit.parts.map((p) => [p.id, p]));
  const selectedParts = new Set(selection.parts);
  const selectedWires = new Set(selection.wires);

  const visible: Rect = { x: -pan.x / zoom, y: -pan.y / zoom, w: size.w / zoom, h: size.h / zoom };

  let preview: string | null = null;
  if (gesture?.type === 'wire') {
    const part = partById.get(gesture.from.partId);
    const a = part && pinPoint(part, gesture.from.pin);
    if (a) preview = `M${a.x} ${a.y} L${cursor.x} ${cursor.y}`;
  }
  const box = gesture?.type === 'box' ? normalizeRect(gesture.start.x, gesture.start.y, cursor.x, cursor.y) : null;
  const boxCount = box ? circuit.parts.filter((p) => rectContains(box, partRect(p))).length : 0;

  const gateCount = circuit.parts.filter((p) => p.kind.type === 'chip' || GATE_KINDS.has(p.kind.kind)).length;

  return (
    <div className="board">
      <svg
        ref={svgRef}
        className={`board-svg${armedKind ? ' armed' : ''}${gesture?.type === 'pan' ? ' panning' : ''}`}
        tabIndex={0}
        role="application"
        aria-label="회로 캔버스"
        data-testid="canvas"
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => (spaceHeld.current = false)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(PART_DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const kind = e.dataTransfer.getData(PART_DRAG_MIME) as PrimitiveKind;
          if (!kind) return;
          e.preventDefault();
          place(kind, toWorld(e.clientX, e.clientY));
          svgRef.current?.focus();
        }}
      >
        <defs>
          <pattern id="dot-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={1.2} fill="var(--border-2)" />
            <circle cx={GRID} cy={0} r={1.2} fill="var(--border-2)" />
            <circle cx={0} cy={GRID} r={1.2} fill="var(--border-2)" />
            <circle cx={GRID} cy={GRID} r={1.2} fill="var(--border-2)" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <rect x={visible.x} y={visible.y} width={visible.w} height={visible.h} fill="url(#dot-grid)" />
          {circuit.wires.map((w) => {
            const fp = partById.get(w.from.partId);
            const tp = partById.get(w.to.partId);
            const a = fp && pinPoint(fp, w.from.pin);
            const b = tp && pinPoint(tp, w.to.pin);
            if (!a || !b) return null;
            return (
              <WireView
                key={w.id}
                id={w.id}
                d={wirePath(a, b)}
                selected={selectedWires.has(w.id)}
                branch={(fanout.get(`${w.from.partId}:${w.from.pin}`) ?? 0) > 1 ? a : undefined}
                onPointerDown={onWireDown}
              />
            );
          })}
          {circuit.parts.map((p) => (
            <PartView key={p.id} part={p} selected={selectedParts.has(p.id)} onPartDown={onPartDown} onPinDown={onPinDown} />
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
      <footer className="statusbar" data-testid="statusbar">
        <span>틱 0</span>
        <span>
          게이트 {gateCount} · 전선 {circuit.wires.length}
        </span>
        <span className="legend">
          <span className="legend-swatch off" aria-hidden="true" /> 0
          <span className="legend-swatch on" aria-hidden="true" /> 1
        </span>
        <span className="zoom">{Math.round(zoom * 100)}%</span>
      </footer>
    </div>
  );
}
