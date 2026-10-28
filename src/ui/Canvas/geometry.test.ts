import { describe, expect, it } from 'vitest';
import type { Part } from '../../sim/types';
import { GRID, kindPins, partRect, pinPoint, rectContains, wirePath } from './geometry';

const and: Part = { id: 'and1', kind: { type: 'primitive', kind: 'AND' }, x: 2, y: 3 };

describe('부품 기하', () => {
  it('모든 핀은 격자점 위에 놓인다', () => {
    for (const kind of ['AND', 'OR', 'XOR', 'NOT', 'SWITCH', 'PUSH', 'LED', 'CLOCK'] as const) {
      for (const pin of kindPins(kind)) {
        expect(pin.dx % GRID, `${kind}.${pin.name}`).toBe(0);
        expect(pin.dy % GRID, `${kind}.${pin.name}`).toBe(0);
      }
    }
  });

  it('입력은 왼쪽, 출력은 오른쪽 변', () => {
    expect(kindPins('AND')).toEqual([
      { name: 'a', dir: 'in', dx: 0, dy: 20 },
      { name: 'b', dir: 'in', dx: 0, dy: 60 },
      { name: 'y', dir: 'out', dx: 80, dy: 40 },
    ]);
  });

  it('핀 위치는 부품 격자 좌표에 오프셋을 더한 값', () => {
    expect(partRect(and)).toEqual({ x: 40, y: 60, w: 80, h: 80 });
    expect(pinPoint(and, 'y')).toEqual({ x: 120, y: 100 });
    expect(pinPoint(and, 'nope')).toBeUndefined();
  });

  it('전선은 직교 경로', () => {
    expect(wirePath({ x: 0, y: 0 }, { x: 100, y: 40 })).toBe('M0 0 H50 V40 H100');
  });

  it('범위 선택은 완전히 들어온 부품만', () => {
    expect(rectContains({ x: 0, y: 0, w: 200, h: 200 }, partRect(and))).toBe(true);
    expect(rectContains({ x: 50, y: 0, w: 200, h: 200 }, partRect(and))).toBe(false);
  });
});
