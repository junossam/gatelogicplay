import { memo, type PointerEvent } from 'react';
import type { Part, PinRef } from '../../sim/types';
import { PartShape } from '../Palette/PartIcons';
import { partPins, partRect } from './geometry';

/** 핀의 보이는 원보다 넓게 잡는 히트 영역 반지름 (SPEC 12장) */
const PIN_HIT_R = 14;
/** 부품 히트 영역 여백 — 작은 부품도 44px 이상 */
const HIT_PAD = 4;

interface Props {
  part: Part;
  selected: boolean;
  onPartDown(e: PointerEvent, partId: string): void;
  onPinDown(e: PointerEvent, ref: PinRef): void;
}

export const PartView = memo(function PartView({ part, selected, onPartDown, onPinDown }: Props) {
  const r = partRect(part);
  const showLabel = part.label && part.kind.type === 'primitive';
  return (
    <g transform={`translate(${r.x} ${r.y})`} data-testid={`part-${part.id}`} data-part-id={part.id} className="part">
      <rect
        x={-HIT_PAD}
        y={-HIT_PAD}
        width={r.w + HIT_PAD * 2}
        height={r.h + HIT_PAD * 2}
        rx={6}
        className={`part-hit${selected ? ' selected' : ''}`}
        onPointerDown={(e) => onPartDown(e, part.id)}
      />
      <g pointerEvents="none">{part.kind.type === 'primitive' && <PartShape kind={part.kind.kind} />}</g>
      {showLabel && (
        <text x={r.w / 2} y={-8} className="part-label" textAnchor="middle" pointerEvents="none">
          {part.label}
        </text>
      )}
      {partPins(part).map((pin) => (
        <g key={pin.name} className={`pin pin-${pin.dir}`}>
          <circle cx={pin.dx} cy={pin.dy} r={4} className="pin-dot" pointerEvents="none" />
          <circle
            cx={pin.dx}
            cy={pin.dy}
            r={PIN_HIT_R}
            className="pin-hit"
            data-pin={`${part.id}:${pin.name}`}
            aria-label={`${part.id} ${pin.dir === 'in' ? '입력' : '출력'} 핀 ${pin.name}`}
            onPointerDown={(e) => onPinDown(e, { partId: part.id, pin: pin.name })}
          />
        </g>
      ))}
    </g>
  );
});
