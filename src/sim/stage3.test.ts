import { describe, expect, it } from 'vitest';
import { CircuitBuilder, halfAdder, srLatch } from '../../tests/fixtures/circuits';
import { boundary, pinDisplayName } from './boundary';
import { compile } from './compile';
import { Engine } from './engine';
import { Recorder } from './recorder';
import { orderedIO, truthTable } from './truthTable';

describe('boundary (SPEC 8장)', () => {
  it('SR 래치 전체를 범위로 잡으면 R, S 입력과 Q, Q̄ 출력만 남는다', () => {
    const b = boundary(srLatch(), new Set(['or1', 'or2', 'not1', 'not2']));
    expect(b.inputs.map((p) => p.name)).toEqual(['R', 'S']);
    expect(b.outputs.map((p) => p.name)).toEqual(['Q', 'Q̄']);
  });

  it('같은 출처에서 갈라져 들어오는 입력은 하나로 합친다', () => {
    const b = boundary(halfAdder(), new Set(['xor1', 'and1']));
    expect(b.inputs.map((p) => p.name)).toEqual(['A', 'B']);
    expect(b.inputs[0]!.wires).toHaveLength(2);
    expect(b.outputs.map((p) => p.name)).toEqual(['S', 'C']);
  });

  it('라벨이 없으면 종류#번호.핀', () => {
    const c = new CircuitBuilder().add('AND', 'and3').add('NOT', 'not1').wire('and3.y', 'not1.a').build();
    expect(boundary(c, new Set(['not1'])).inputs[0]!.name).toBe('AND#3.y');
    expect(pinDisplayName(c.parts[1], 'y')).toBe('NOT#1.y');
  });

  it('범위 안쪽 전선은 경계가 아니다', () => {
    const b = boundary(srLatch(), new Set(srLatch().parts.map((p) => p.id)));
    expect(b.inputs).toEqual([]);
    expect(b.outputs).toEqual([]);
  });
});

describe('Recorder', () => {
  it('Net마다 링 버퍼에 틱별 값을 기록하고 창으로 읽는다', () => {
    const r = new Recorder();
    r.watch(['a', 'b']);
    for (let t = 0; t < 10; t++) r.push(t, new Map([['a', (t % 2) as 0 | 1], ['b', 1]]));
    expect(r.window('a', 6, 9)).toEqual([0, 1, 0, 1]);
    expect(r.window('b', 0, 2)).toEqual([1, 1, 1]);
  });

  it('512틱보다 오래된 값은 버린다', () => {
    const r = new Recorder();
    r.watch(['a']);
    for (let t = 0; t < 600; t++) r.push(t, new Map([['a', t < 300 ? 1 : 0]]));
    expect(r.firstTick).toBe(88);
    expect(r.window('a', 80, 90)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
  });

  it('watch를 바꿔도 계속 보는 Net의 과거는 유지, 새 Net은 지금부터', () => {
    const r = new Recorder();
    r.watch(['a']);
    for (let t = 0; t < 5; t++) r.push(t, new Map([['a', 1], ['b', 1]]));
    r.watch(['a', 'b']);
    r.push(5, new Map([['a', 1], ['b', 1]]));
    expect(r.window('a', 0, 5)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.window('b', 0, 5)).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('엔진 값 배열에서 바로 기록하고, 기록 지우기는 링 버퍼를 비운다', () => {
    const e = new Engine(compile(halfAdder()));
    const r = new Recorder();
    r.watch(e.netlist.netIds);
    r.bind((id) => e.netlist.netIds.indexOf(id));
    e.setInput('a', 1);
    for (let i = 0; i < 4; i++) {
      e.tick();
      r.pushValues(e.tickCount, e.values);
    }
    expect(r.window('xor1', 0, 4)).toEqual([0, 1, 1, 1, 1]);
    r.clear();
    expect(r.window('xor1', 1, 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('진리표 (SPEC 7장)', () => {
  it('반가산기: 4개 조합, S = A⊕B, C = A·B', () => {
    const t = truthTable(halfAdder());
    expect(t.sequential).toBe(false);
    expect(t.inputs).toEqual(['A', 'B']);
    expect(t.outputs).toEqual(['S', 'C']);
    expect(t.rows.map((r) => [...r.inputs, ...r.outputs])).toEqual([
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [1, 0, 1, 0],
      [1, 1, 0, 1],
    ]);
  });

  it('SR 래치: 셋, 리셋, 유지, 금지 상태', () => {
    const t = truthTable(srLatch());
    expect(t.sequential).toBe(true);
    expect(t.inputs).toEqual(['R', 'S']);
    expect(t.outputs).toEqual(['Q', 'Q̄']);
    const row = (r: number, s: number) => t.rows.find((x) => x.inputs[0] === r && x.inputs[1] === s)!;
    expect(row(0, 0).outputs).toEqual(['hold', 'hold']);
    expect(row(0, 1).outputs).toEqual([1, 0]);
    expect(row(1, 0).outputs).toEqual([0, 1]);
    expect(row(1, 1).forbidden).toBe(true);
  });

  it('입출력 순서는 지정한 순서가 먼저, 나머지는 위→아래', () => {
    const io = orderedIO(srLatch(), { inputs: ['s'] });
    expect(io.inputs.map((p) => p.id)).toEqual(['s', 'r']);
    expect(io.outputs.map((p) => p.id)).toEqual(['q', 'qn']);
  });
});
