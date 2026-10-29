import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { GATE_KINDS } from '../../sim/primitives';
import type { Part, PartKind, PinRef } from '../../sim/types';
import { editorStore, useEditor, useView } from '../../store/editorStore';
import { engine, simActions, useSim } from '../../store/simStore';
import { decodeKind, PART_DRAG_MIME, useUi } from '../../store/uiStore';
import { confirmLeaveChip } from '../Palette/Palette';
import { baseSize, GRID, normalizeRect, partRect, pinPoint, rectContains, wirePath, type Rect } from './geometry';
import { PartView } from './PartView';
import { WireView } from './WireView';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

type Point = { x: number; y: number };

type Gesture =
  | { type: 'drag'; start: Point; pointerId: number; partId: string; moved: boolean }
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

/** Esc: 배치 취소 → 선택 해제 → 한 단계 위로 (SPEC 11장) */
export function escapeAction() {
  const ui = useUi.getState();
  const st = editorStore.getState();
  if (ui.armed) return ui.setArmed(null);
  if (st.selection.parts.length || st.selection.wires.length) return st.clearSelection();
  if (st.viewPath.length) return st.setViewPath(st.viewPath.slice(0, -1));
  if (st.openChipId) confirmLeaveChip(() => editorStore.getState().closeChip());
}

export function Board() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { circuit, chain, prefix, readOnly } = useView();
  const library = useEditor((s) => s.library);
  const selection = useEditor((s) => s.selection);
  const armed = useUi((s) => s.armed);
  const zoom = useUi((s) => s.zoom);
  useSim((s) => s.version); // 틱마다 다시 그려 값 표시
  const oscillating = useSim((s) => s.oscillating);
  const hasFeedback = useSim((s) => s.hasFeedback);
  const simError = useSim((s) => s.error);
  const tick = useSim((s) => s.tick);

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
      setGesture({ type: 'pan', start: { x: e.clientX, y: e.clientY }, pan, pointerId: e.pointerId });
      return;
    }
    if (e.button !== 0) return;
    if (armed && !readOnly) {
      place(armed, world);
      useUi.getState().setArmed(null);
      return;
    }
    setCursor(world);
    setGesture({ type: 'box', start: world, additive: e.shiftKey, pointerId: e.pointerId });
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

  const partValue = (p: Part): 0 | 1 => {
    if (p.kind.type !== 'primitive') return 0;
    const k = p.kind.kind;
    if (k === 'SWITCH' || k === 'PUSH') return readOnly ? engine.readPin(`${prefix}${p.id}.y`) : engine.inputValue(p.id);
    if (k === 'LED') return engine.readPin(`${prefix}${p.id}.a`);
    return 0;
  };

  const onMove = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    if (gesture.type === 'pan') {
      setPan({ x: gesture.pan.x + e.clientX - gesture.start.x, y: gesture.pan.y + e.clientY - gesture.start.y });
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
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
    if (gesture.type === 'drag') {
      store.endDrag();
      // 끌지 않고 클릭만 했으면 스위치를 토글
      const part = circuit.parts.find((p) => p.id === gesture.partId);
      if (!gesture.moved && part?.kind.type === 'primitive' && part.kind.kind === 'SWITCH') simActions.toggleSwitch(part.id);
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
      useUi.getState().setSaveOpen(true);
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
    const a = part && pinPoint(part, gesture.from.pin, library);
    if (a) preview = `M${a.x} ${a.y} L${cursor.x} ${cursor.y}`;
  }
  const box = gesture?.type === 'box' ? normalizeRect(gesture.start.x, gesture.start.y, cursor.x, cursor.y) : null;
  const boxCount = box ? circuit.parts.filter((p) => rectContains(box, partRect(p, library))).length : 0;

  const gateCount = engine.netlist.nodes.filter((n) => GATE_KINDS.has(n.kind)).length;
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
            const a = fp && pinPoint(fp, w.from.pin, library);
            const b = tp && pinPoint(tp, w.to.pin, library);
            if (!a || !b) return null;
            const net = engine.netlist.pinNet.get(`${prefix}${w.from.partId}.${w.from.pin}`) ?? -1;
            return (
              <WireView
                key={w.id}
                id={w.id}
                d={wirePath(a, b)}
                selected={selectedWires.has(w.id)}
                value={engine.readNet(net)}
                oscillating={net >= 0 && oscillating.has(engine.netlist.netIds[net]!)}
                branch={(fanout.get(`${w.from.partId}:${w.from.pin}`) ?? 0) > 1 ? a : undefined}
                onPointerDown={onWireDown}
              />
            );
          })}
          {circuit.parts.map((p) => (
            <PartView
              key={p.id}
              part={p}
              chip={p.kind.type === 'chip' ? library[p.kind.chipId] : undefined}
              selected={selectedParts.has(p.id)}
              value={partValue(p)}
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
        <span data-testid="tick">틱 {tick}</span>
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
