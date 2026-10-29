import { memo, type PointerEvent } from 'react';
import type { ChipDef, Part, PinRef } from '../../sim/types';
import { partBits, partInputs, partPinSpecs } from '../../sim/pins';
import { SEGMENTS } from '../../sim/primitives';
import { engine, inputNumber, readPinNumber, useSim } from '../../store/simStore';
import { PartShape } from '../Palette/PartIcons';
import { baseSize, chipPins, GRID, partPins, partRect, rotationTransform } from './geometry';

/** 핀의 보이는 원보다 넓게 잡는 히트 영역 반지름 (SPEC 12장) */
const PIN_HIT_R = 14;
/** 부품 히트 영역 여백 — 작은 부품도 44px 이상 */
const HIT_PAD = 4;

interface Props {
  part: Part;
  /** 칩 부품이면 그 정의 */
  chip?: ChipDef;
  selected: boolean;
  /** 전선이 꽂힌 핀 이름들 ("a,y") */
  connected: string;
  /** 칩 내부를 볼 때의 경로 접두어 */
  prefix: string;
  /** 칩 내부를 읽기 전용으로 볼 때: 조작·연결 불가 */
  readOnly: boolean;
  onPartDown(e: PointerEvent, partId: string): void;
  onPinDown(e: PointerEvent, ref: PinRef): void;
  onPush(partId: string, v: 0 | 1): void;
}

/** 칩 블록: 핀 이름은 블록 안쪽에 (SPEC 4.2) */
function ChipBlock({ def, w, h, part }: { def: ChipDef; w: number; h: number; part: Part }) {
  const pins = chipPins(def);
  const widths = new Map(partPinSpecs(part, { [def.id]: def }).map((p) => [p.name, p.width]));
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={6} className="chip-body" style={{ stroke: `var(--${def.color})` }} />
      <rect x={0} y={0} width={6} height={h} rx={3} style={{ fill: `var(--${def.color})` }} />
      {pins.map((p) => (
        <text
          key={`${p.dir}${p.name}`}
          x={p.dir === 'in' ? 12 : w - 8}
          y={p.dy + 4}
          textAnchor={p.dir === 'in' ? 'start' : 'end'}
          className="chip-pin-name"
        >
          {p.name}
          {(widths.get(p.name) ?? 1) > 1 && <tspan className="pin-width">[{widths.get(p.name)}]</tspan>}
        </text>
      ))}
    </g>
  );
}

/** SWITCH/PUSH는 입력 상태, LED는 입력 값, CLOCK은 출력. 여러 비트면 숫자. 값이 바뀐 부품만 다시 그린다. */
function usePartValue(part: Part, prefix: string, readOnly: boolean): number {
  return useSim(() => {
    if (part.kind.type !== 'primitive') return 0;
    const bits = partBits(part);
    switch (part.kind.kind) {
      case 'SWITCH':
      case 'PUSH':
        if (bits > 1) return readOnly ? readPinNumber(`${prefix}${part.id}.y`, bits) : inputNumber(part.id, bits);
        return readOnly ? engine.readPin(`${prefix}${part.id}.y`) : engine.inputValue(part.id);
      case 'LED':
        return bits > 1 ? readPinNumber(`${prefix}${part.id}.a`, bits) : engine.readPin(`${prefix}${part.id}.a`);
      case 'CLOCK':
        return engine.readPin(`${prefix}${part.id}.y`);
      case 'SEG8':
        // k번 비트 = k번 세그먼트(a~g, dp)
        return SEGMENTS.reduce((v, name, k) => v | (engine.readPin(`${prefix}${part.id}.${name}`) << k), 0);
      default:
        return 0;
    }
  });
}

export const PartView = memo(function PartView({ part, chip, selected, connected, prefix, readOnly, onPartDown, onPinDown, onPush }: Props) {
  const wired = new Set(connected.split(','));
  const value = usePartValue(part, prefix, readOnly);
  const lib = chip && part.kind.type === 'chip' ? { [part.kind.chipId]: chip } : {};
  const r = partRect(part, lib);
  const base = baseSize(part, lib);
  const W = base.w * GRID;
  const H = base.h * GRID;
  const kind = part.kind.type === 'primitive' ? part.kind.kind : null;
  const bits = partBits(part);
  const release = () => onPush(part.id, 0);
  const title = chip ? chip.name : part.label;
  return (
    <g
      transform={`translate(${r.x} ${r.y})`}
      data-testid={`part-${part.id}`}
      data-part-id={part.id}
      data-value={kind === 'SWITCH' || kind === 'PUSH' || kind === 'LED' || kind === 'CLOCK' || kind === 'SEG8' ? value : undefined}
      data-bits={bits > 1 ? bits : undefined}
      className={`part${readOnly ? ' readonly' : ''}`}
    >
      <rect
        x={-HIT_PAD}
        y={-HIT_PAD}
        width={r.w + HIT_PAD * 2}
        height={r.h + HIT_PAD * 2}
        rx={6}
        className={`part-hit${selected ? ' selected' : ''}${kind === 'SWITCH' && !readOnly ? ' toggle' : ''}`}
        onPointerDown={(e) => onPartDown(e, part.id)}
      />
      <g transform={rotationTransform(W, H, part.rotation)}>
        <g pointerEvents="none">
          {kind && <PartShape kind={kind} on={value === 1 && kind !== 'SEG8'} bits={bits} value={value} inputs={partInputs(part)} />}
          {kind && bits > 1 && kind !== 'SWITCH' && kind !== 'LED' && kind !== 'SPLIT' && kind !== 'MERGE' && (
            <text x={W - 4} y={H - 2} textAnchor="end" className="bits-badge">
              ×{bits}
            </text>
          )}
          {chip && <ChipBlock def={chip} w={W} h={H} part={part} />}
        </g>
        {kind === 'PUSH' && !readOnly && (
          // 캡을 누르는 동안만 1. 손을 떼거나 영역을 벗어나거나 취소되면 0.
          <rect
            x={4}
            y={-14}
            width={44}
            height={44}
            className="push-hit"
            data-testid={`push-${part.id}`}
            aria-label={`${part.label ?? part.id} 누르기`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              onPush(part.id, 1);
            }}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
          />
        )}
      </g>
      {title && (
        <text x={r.w / 2} y={-8} className={`part-label${chip ? ' chip-name' : ''}`} textAnchor="middle" pointerEvents="none">
          {title}
        </text>
      )}
      {partPins(part, lib).map((pin) => (
        <g key={`${pin.dir}${pin.name}`} className={`pin pin-${pin.dir}${wired.has(pin.name) ? ' connected' : ''}`}>
          <circle cx={pin.dx} cy={pin.dy} r={4} className="pin-dot" pointerEvents="none" />
          {!readOnly && (
            <circle
              cx={pin.dx}
              cy={pin.dy}
              r={PIN_HIT_R}
              className="pin-hit"
              data-pin={`${part.id}:${pin.name}`}
              aria-label={`${part.id} ${pin.dir === 'in' ? '입력' : '출력'} 핀 ${pin.name}`}
              onPointerDown={(e) => onPinDown(e, { partId: part.id, pin: pin.name })}
            />
          )}
        </g>
      ))}
    </g>
  );
});
