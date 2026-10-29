import { describe, expect, it } from 'vitest';
import { bigCircuit, harness, nestedLibrary, register4Chip } from '../../../tests/fixtures/circuits';
import { layoutWires, ROUTE_WIRE_LIMIT } from './wireLayout';

describe('전선 배치', () => {
  it('칩 블록을 지나가는 전선이 없다', () => {
    const lib = nestedLibrary();
    const circuit = harness(register4Chip(), 'reg');
    const layout = layoutWires(circuit, lib);
    expect(layout.routed).toBe(true);
    const chip = circuit.parts.find((p) => p.id === 'reg')!;
    const def = lib['chip-reg4']!;
    const [x0, y0, x1, y1] = [chip.x, chip.y, chip.x + 6, chip.y + Math.max(def.inputs.length, def.outputs.length) * 2];
    for (const w of layout.wires) {
      // 끝점(핀)을 뺀 경로 위 점이 칩 내부에 없어야 한다
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i]!;
        const b = w.points[i + 1]!;
        const sx = Math.sign(b.x - a.x);
        const sy = Math.sign(b.y - a.y);
        for (let x = a.x + sx, y = a.y + sy; x !== b.x || y !== b.y; x += sx, y += sy) {
          expect(x > x0 && x < x1 && y > y0 && y < y1, `${w.id} (${x},${y})`).toBe(false);
        }
      }
    }
  });

  it('부품 수백 개 회로도 편집 한 번에 빠르게 다시 배치한다', () => {
    const circuit = bigCircuit(700);
    expect(circuit.wires.length).toBeLessThanOrEqual(ROUTE_WIRE_LIMIT);
    const t0 = performance.now();
    const layout = layoutWires(circuit, {});
    const ms = performance.now() - t0;
    console.log(`전선 ${circuit.wires.length}개 경로 찾기 ${ms.toFixed(0)}ms`);
    expect(layout.routed).toBe(true);
    expect(ms).toBeLessThan(1500);
  });
});
