// 8단계: 다중 비트 버스 — UI 없이 compile → setInput → tick → read
import { describe, expect, it } from 'vitest';
import { busAdderWorkspace, busLibrary, CircuitBuilder } from '../../tests/fixtures/circuits';
import { rangeToChip } from '../model/library';
import { compile } from './compile';
import { Engine } from './engine';
import { bitKey, partPinSpecs } from './pins';
import { truthTable } from './truthTable';
import type { Bit } from './types';

function setNumber(e: Engine, path: string, value: number, bits: number) {
  for (let k = 0; k < bits; k++) e.setInput(bitKey(path, k), ((value >> k) & 1) as Bit);
}
function readNumber(e: Engine, key: string, bits: number) {
  let v = 0;
  for (let k = 0; k < bits; k++) v |= e.readPin(bitKey(key, k)) << k;
  return v;
}

describe('다중 비트 버스', () => {
  it('N비트 게이트는 비트마다 따로 계산한다 (비트 연산)', () => {
    const c = new CircuitBuilder()
      .add('SWITCH', 'a').bits(4)
      .add('SWITCH', 'b').bits(4)
      .add('AND', 'g').bits(4)
      .add('XOR', 'x').bits(4)
      .add('LED', 'y').bits(4)
      .add('LED', 'z').bits(4)
      .wire('a.y', 'g.a').wire('b.y', 'g.b').wire('g.y', 'y.a')
      .wire('a.y', 'x.a').wire('b.y', 'x.b').wire('x.y', 'z.a')
      .build();
    const nl = compile(c);
    // 0번 비트 id는 그대로, k번 비트는 [k]
    expect(nl.nodes.map((n) => n.path)).toEqual(expect.arrayContaining(['g', 'g[1]', 'g[2]', 'g[3]']));
    const e = new Engine(nl);
    for (const [a, b] of [[0b1100, 0b1010], [15, 0], [5, 7]]) {
      setNumber(e, 'a', a!, 4);
      setNumber(e, 'b', b!, 4);
      e.settle();
      expect(readNumber(e, 'y.a', 4)).toBe(a! & b!);
      expect(readNumber(e, 'z.a', 4)).toBe(a! ^ b!);
    }
  });

  it('나누기 → 묶기를 거쳐도 값이 같다 (지연 없는 배선)', () => {
    const c = new CircuitBuilder()
      .add('SWITCH', 'a').bits(4)
      .add('SPLIT', 's').bits(4)
      .add('MERGE', 'm').bits(4)
      .add('LED', 'y').bits(4)
      .add('LED', 'b2')
      .wire('a.y', 's.a')
      .wire('s.y0', 'm.a0').wire('s.y1', 'm.a1').wire('s.y2', 'm.a2').wire('s.y3', 'm.a3')
      .wire('m.y', 'y.a')
      .wire('s.y2', 'b2.a')
      .build();
    const e = new Engine(compile(c));
    for (let v = 0; v < 16; v++) {
      setNumber(e, 'a', v, 4);
      e.tick(1); // 배선만이라 입력을 넣은 그 틱에 바로 보인다
      expect(readNumber(e, 'y.a', 4)).toBe(v);
      expect(e.readPin('b2.a')).toBe((v >> 2) & 1);
    }
  });

  it('8단계 완료 기준: 4비트 스위치 두 개를 버스 핀 가산기 칩에 연결하면 합이 숫자 LED에 나온다 (256개 조합)', () => {
    const lib = busLibrary();
    const ws = busAdderWorkspace();
    const add = ws.parts.find((p) => p.id === 'add')!;
    expect(partPinSpecs(add, lib).map((p) => [p.name, p.width])).toEqual([
      ['A', 4],
      ['B', 4],
      ['S', 4],
      ['Cout', 1],
    ]);
    const e = new Engine(compile(ws, lib));
    for (let a = 0; a < 16; a++) {
      for (let b = 0; b < 16; b++) {
        setNumber(e, 'ina', a, 4);
        setNumber(e, 'inb', b, 4);
        e.settle();
        expect(readNumber(e, 'sum.a', 4) + 16 * e.readPin('carry.a')).toBe(a + b);
      }
    }
  });

  it('진리표는 비트마다 열을 만든다', () => {
    const c = new CircuitBuilder().add('SWITCH', 'a', 0, 0, 'A').bits(2).add('NOT', 'n').bits(2).add('LED', 'y', 0, 0, 'Y').bits(2).wire('a.y', 'n.a').wire('n.y', 'y.a').build();
    const t = truthTable(c);
    expect(t.inputs).toEqual(['A[0]', 'A[1]']);
    expect(t.outputs).toEqual(['Y[0]', 'Y[1]']);
    expect(t.rows).toHaveLength(4);
    for (const r of t.rows) expect(r.outputs).toEqual(r.inputs.map((b) => 1 - b));
  });

  it('범위를 칩으로 만들 때 경계 신호의 비트 수를 유지한다', () => {
    const c = new CircuitBuilder()
      .add('SWITCH', 'a', 0, 0, 'A').bits(4)
      .add('NOT', 'n', 6, 0).bits(4)
      .add('LED', 'y', 12, 0, 'Y').bits(4)
      .wire('a.y', 'n.a').wire('n.y', 'y.a')
      .build();
    const { chip, circuit } = rangeToChip(c, ['n'], {}, { id: 'c', name: 'NOT4', color: 'chip-1', now: '' });
    const lib = { c: chip };
    const inst = circuit.parts.find((p) => p.kind.type === 'chip')!;
    expect(partPinSpecs(inst, lib).map((p) => p.width)).toEqual([4, 4]);
    const e = new Engine(compile(circuit, lib));
    setNumber(e, 'a', 0b0101, 4);
    e.settle();
    expect(readNumber(e, 'y.a', 4)).toBe(0b1010);
  });
});
