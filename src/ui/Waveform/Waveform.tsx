import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { bitKey } from '../../sim/pins';
import { RECORD_SIZE } from '../../sim/recorder';
import type { Bit } from '../../sim/types';
import { groupOfSelection, useEditor, useView } from '../../store/editorStore';
import { engine, recorder, simActions, useSim } from '../../store/simStore';
import { useUi } from '../../store/uiStore';
import { channelsFor, effectiveMode, type Channel, type NetLookup, type WaveMode } from './channels';

const MIN_WINDOW = 4;
const DEFAULT_WINDOW = 20;
const KIND_LABEL = { in: '입력', out: '출력', fb: '피드백' } as const;

/** 값이 바뀌는 지점만 이어서 M/H/V 경로를 만든다 (SPEC 6.5) */
/** 값이 같은 구간들: [시작, 끝) */
export function segments(values: number[]): { start: number; end: number; value: number }[] {
  const out: { start: number; end: number; value: number }[] = [];
  values.forEach((v, i) => {
    const last = out[out.length - 1];
    if (last && last.value === v) last.end = i + 1;
    else out.push({ start: i, end: i + 1, value: v });
  });
  return out;
}

/** 버스 파형: 위아래 두 줄, 값이 바뀌는 곳마다 X자로 교차 (SPEC 13장 8단계) */
export function busPath(values: number[]): string {
  const segs = segments(values);
  const e = 0.25;
  let d = '';
  segs.forEach((s, i) => {
    const a = i === 0 ? s.start : s.start + e;
    const b = i === segs.length - 1 ? s.end : s.end - e;
    d += ` M${a} 3 H${b} M${a} 17 H${b}`;
    if (i < segs.length - 1) d += ` M${b} 3 L${s.end + e} 17 M${b} 17 L${s.end + e} 3`;
  });
  return d.trim();
}

export function wavePath(bits: Bit[]): string {
  if (bits.length === 0) return '';
  const y = (b: Bit) => (b ? 3 : 17);
  let d = `M0 ${y(bits[0]!)}`;
  for (let i = 1; i < bits.length; i++) if (bits[i] !== bits[i - 1]) d += ` H${i} V${y(bits[i]!)}`;
  return `${d} H${bits.length}`;
}

export function Waveform() {
  const { circuit, prefix, readOnly } = useView();
  const library = useEditor((s) => s.library);
  const selected = useEditor((s) => s.selection.parts);
  const selection = useEditor((s) => s.selection);
  // 그룹 전체를 골랐으면 부품이 하나여도 그룹 경계를 드나드는 신호를 보인다
  const group = groupOfSelection(circuit, selection);
  const editOrder = useEditor((s) => s.pinOrder);
  const pinOrder = readOnly ? undefined : editOrder;
  const running = useSim((s) => s.running);
  useSim((s) => s.version);
  const open = useUi((s) => s.waveOpen);
  const setOpen = useUi((s) => s.setWaveOpen);

  const [override, setOverride] = useState<WaveMode | null>(null);
  const [span, setSpan] = useState(DEFAULT_WINDOW);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const wavesRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; offset: number } | null>(null);

  // 선택이 바뀌면 자동 모드로
  useEffect(() => setOverride(null), [selected]);
  // 실행하면 현재 시점으로
  useEffect(() => {
    if (running) setOffset(0);
  }, [running]);

  const mode = effectiveMode(selected.length, override ?? (group ? 'range' : null));
  const nets: NetLookup = useMemo(
    () => ({
      pinNetId: (partId, pin, bit = 0) => {
        const i = engine.netlist.pinNet.get(bitKey(`${prefix}${partId}.${pin}`, bit)) ?? -1;
        return i >= 0 ? engine.netlist.netIds[i]! : null;
      },
      loopOf: (netId) => engine.loopOf(netId),
    }),
    // 재컴파일되면 engine.netlist가 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefix, engine.netlist],
  );
  const channels = useMemo(
    () => channelsFor(circuit, selected, mode, nets, library, pinOrder),
    [circuit, selected, mode, nets, library, pinOrder],
  );

  // 휠로 창 크기 조절 (최대 512틱)
  useEffect(() => {
    const el = wavesRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSpan((s) => Math.min(RECORD_SIZE, Math.max(MIN_WINDOW, Math.round(s * (e.deltaY > 0 ? 1.25 : 0.8)))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  const end = recorder.lastTick - offset;
  const from = end - span + 1;
  const maxOffset = Math.max(0, recorder.lastTick - recorder.firstTick + 1 - span);

  const tickAt = (clientX: number) => {
    const r = wavesRef.current!.getBoundingClientRect();
    return Math.min(span - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * span)));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (running) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, offset };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    setHover(tickAt(e.clientX));
    if (!drag.current) return;
    const w = wavesRef.current!.getBoundingClientRect().width;
    const delta = Math.round(((e.clientX - drag.current.x) / w) * span);
    setOffset(Math.min(maxOffset, Math.max(0, drag.current.offset + delta)));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // 틱별 값: 1비트는 0/1, 버스는 비트를 모은 숫자
  const rows = channels.map((c) => {
    const values = Array<number>(span).fill(0);
    c.netIds.forEach((id, k) => {
      if (!id) return;
      recorder.window(id, from, end).forEach((b, i) => (values[i]! |= b << k));
    });
    return { c, bits: values };
  });

  return (
    <section className={`waveform${open ? ' open' : ''}`} aria-label="파형" data-testid="waveform">
      <div className="waveform-bar">
        <button type="button" className="icon-button" aria-label={open ? '파형 접기' : '파형 펼치기'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'}
        </button>
        <h2 className="panel-title inline">파형</h2>
        <div className="segmented" role="group" aria-label="파형 모드">
          {(['part', 'range'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={selected.length === 0}
              onClick={() => setOverride(m)}
            >
              {m === 'part' ? '선택한 부품' : '선택 범위'}
            </button>
          ))}
        </div>
        <span className="muted small" data-testid="wave-summary">
          {mode === null ? '모든 입력과 출력' : `${group && mode === 'range' ? `그룹 "${group.name}" 경계 · ` : ''}채널 ${channels.length}개`}
        </span>
        <button type="button" className="text-button small-button" onClick={simActions.clearRecording}>
          기록 지우기
        </button>
      </div>
      {open && (
        <div className="waveform-body">
          <div className="wave-row axis">
            <span />
            <span />
            <div className="axis-labels mono">
              <span>t−{span - 1 + offset}</span>
              <span>{offset ? `t−${offset}` : '지금'}</span>
            </div>
            <span />
          </div>
          <div
            className="wave-rows"
            ref={wavesRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
          >
            {rows.map(({ c, bits }) => (
              <WaveRow key={c.key} channel={c} bits={bits} span={span} />
            ))}
            {hover !== null && rows.length > 0 && (
              <>
                <div className="wave-cursor" style={{ left: `calc(var(--wave-label) + (100% - var(--wave-label) - var(--wave-value)) * ${(hover + 0.5) / span})` }} />
                <div className="wave-tooltip mono" role="tooltip">
                  <div>t={from + hover}</div>
                  {rows.map(({ c, bits }) => (
                    <div key={c.key}>
                      {c.name}: {bits[hover]}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {rows.length === 0 && <p className="muted small">표시할 채널이 없습니다.</p>}
        </div>
      )}
    </section>
  );
}

function WaveRow({ channel, bits, span }: { channel: Channel; bits: number[]; span: number }) {
  const value = channel.netIds.reduce((v, id, k) => v | ((id ? engine.read(id) : 0) << k), 0);
  const bus = channel.netIds.length > 1;
  return (
    <div className={`wave-row kind-${channel.kind}`} data-testid="wave-channel" data-kind={channel.kind}>
      <span className={`kind-badge ${channel.kind}`}>{KIND_LABEL[channel.kind]}</span>
      <span className="wave-name mono" title={channel.name}>
        {channel.name}
      </span>
      {bus ? (
        <div className="wave-bus" data-testid="bus-wave">
          <svg className="wave" viewBox={`0 0 ${span} 20`} preserveAspectRatio="none" aria-hidden="true">
            <path d={busPath(bits)} vectorEffect="non-scaling-stroke" />
          </svg>
          {/* 값 글자는 늘어나지 않게 SVG 밖에서 비율로 놓는다. 너무 좁은 구간은 생략 */}
          {segments(bits)
            .filter((s) => (s.end - s.start) / span >= 0.06)
            .map((s) => (
              <span key={s.start} className="bus-seg mono" style={{ left: `${((s.start + s.end) / 2 / span) * 100}%` }}>
                {s.value}
              </span>
            ))}
        </div>
      ) : (
        <svg className="wave" viewBox={`0 0 ${span} 20`} preserveAspectRatio="none" aria-hidden="true">
          <path d={wavePath(bits as Bit[])} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <span className={`wave-value mono${value ? ' on' : ''}`}>{value}</span>
    </div>
  );
}
