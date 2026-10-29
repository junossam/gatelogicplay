// 엔진 테스트는 UI 없이 compile → setInput → tick → read 만으로 작성한다 (SPEC 14장).
import { describe, expect, it } from 'vitest';
import { CircuitBuilder, halfAdder, notRing, srLatch } from '../../tests/fixtures/circuits';
import { compile } from './compile';
import { Engine } from './engine';

const led = (e: Engine, id: string) => e.readPin(`${id}.a`);

describe('게이트 평가', () => {
  it.each([
    ['AND', [0, 0, 0, 1]],
    ['OR', [0, 1, 1, 1]],
    ['XOR', [0, 1, 1, 0]],
    ['NAND', [1, 1, 1, 0]],
    ['NOR', [1, 0, 0, 0]],
    ['XNOR', [1, 0, 0, 1]],
  ] as const)('%s 진리표', (kind, expected) => {
    const c = new CircuitBuilder()
      .add('SWITCH', 'a')
      .add('SWITCH', 'b')
      .add(kind, 'g')
      .add('LED', 'y')
      .wire('a.y', 'g.a')
      .wire('b.y', 'g.b')
      .wire('g.y', 'y.a')
      .build();
    const e = new Engine(compile(c));
    const got = [0, 1, 2, 3].map((i) => {
      e.setInput('a', ((i >> 1) & 1) as 0 | 1);
      e.setInput('b', (i & 1) as 0 | 1);
      e.settle();
      return led(e, 'y');
    });
    expect(got).toEqual(expected);
  });

  it('연결 안 된 입력은 0: NOT은 1, AND는 0', () => {
    const c = new CircuitBuilder().add('NOT', 'n').add('AND', 'g').add('LED', 'y1').add('LED', 'y2').wire('n.y', 'y1.a').wire('g.y', 'y2.a').build();
    const e = new Engine(compile(c));
    e.settle();
    expect(led(e, 'y1')).toBe(1);
    expect(led(e, 'y2')).toBe(0);
  });
});

describe('단위 지연', () => {
  it('모든 Net은 0에서 시작하고, 게이트는 입력이 바뀐 다음 틱에 출력한다', () => {
    const c = new CircuitBuilder()
      .add('SWITCH', 'a')
      .add('NOT', 'n1')
      .add('NOT', 'n2')
      .wire('a.y', 'n1.a')
      .wire('n1.y', 'n2.a')
      .build();
    const e = new Engine(compile(c));
    expect([e.read('a'), e.read('n1'), e.read('n2')]).toEqual([0, 0, 0]);
    e.tick(); // 첫 틱: 모든 게이트가 0 입력을 보고 1을 낸다
    expect([e.read('n1'), e.read('n2')]).toEqual([1, 1]);
    e.tick(); // n2가 n1=1을 보고 한 틱 늦게 0
    expect([e.read('n1'), e.read('n2')]).toEqual([1, 0]);

    e.setInput('a', 1);
    const r = e.tick(); // 입력은 틱 시작에 바로 반영, n1은 이 틱 끝에 0
    expect(r.changed).toEqual(expect.arrayContaining(['a', 'n1']));
    expect(e.read('n1')).toBe(0);
    expect(e.read('n2')).toBe(0);
    e.tick();
    expect(e.read('n2')).toBe(1);
  });

  it('tick(n)은 n틱을 진행하고 틱 수를 돌려준다', () => {
    const e = new Engine(compile(halfAdder()));
    expect(e.tick(5).tick).toBe(5);
    e.reset();
    expect(e.tickCount).toBe(0);
  });
});

describe('반가산기 (XOR + AND)', () => {
  it('S = A⊕B, C = A·B', () => {
    const e = new Engine(compile(halfAdder()));
    for (const [a, b] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const) {
      e.setInput('a', a);
      e.setInput('b', b);
      expect(e.settle()).toBe(true);
      expect([led(e, 's'), led(e, 'c')]).toEqual([a ^ b, a & b]);
    }
  });
});

describe('SR 래치 (OR 2 + NOT 2) — 2단계 완료 기준', () => {
  const press = (e: Engine, id: string) => {
    e.setInput(id, 1);
    e.tick(10);
    e.setInput(id, 0);
    e.tick(10);
  };

  it('S로 셋, R로 리셋하고 버튼을 놓아도 유지된다', () => {
    const e = new Engine(compile(srLatch()));
    expect(e.hasFeedback).toBe(true);

    press(e, 's');
    expect([led(e, 'q'), led(e, 'qn')]).toEqual([1, 0]);
    e.tick(50);
    expect([led(e, 'q'), led(e, 'qn')]).toEqual([1, 0]);
    expect(e.oscillating).toEqual([]);

    press(e, 'r');
    expect([led(e, 'q'), led(e, 'qn')]).toEqual([0, 1]);
    e.tick(50);
    expect([led(e, 'q'), led(e, 'qn')]).toEqual([0, 1]);
    expect(e.oscillating).toEqual([]);
  });

  it('S와 R을 함께 누르면 Q = Q̄ = 0 (금지 상태)', () => {
    const e = new Engine(compile(srLatch()));
    e.setInput('s', 1);
    e.setInput('r', 1);
    e.settle();
    expect([led(e, 'q'), led(e, 'qn')]).toEqual([0, 0]);
  });

  it('모든 Net이 0에서 시작하면 대칭이라 진동하고, 그 상태를 진동으로 표시한다', () => {
    const e = new Engine(compile(srLatch()));
    e.tick(40);
    expect(e.oscillating.length).toBeGreaterThan(0);
    // 셋을 누르면 안정
    press(e, 's');
    e.tick(40);
    expect(e.oscillating).toEqual([]);
  });
});

describe('NOT 3개 루프', () => {
  it('사슬을 닫아 루프를 만들면 진동을 감지하고 주기는 6틱', () => {
    // 편집기에서처럼 NOT 사슬이 안정된 뒤 마지막 전선으로 루프를 닫는다
    const ring = notRing(3);
    const open = { ...ring, wires: ring.wires.filter((w) => !(w.from.partId === 'not3' && w.to.partId === 'not1')) };
    const chain = new Engine(compile(open));
    chain.settle();
    const e = new Engine();
    e.load(compile(ring), chain.snapshot());
    const trace: number[] = [];
    for (let i = 0; i < 60; i++) {
      e.tick();
      trace.push(e.read('not1'));
    }
    expect(e.oscillating).toEqual(expect.arrayContaining(['not1', 'not2', 'not3']));
    // 처음 몇 틱을 건너뛴 뒤 주기 측정
    const tail = trace.slice(12);
    const period = [1, 2, 3, 4, 5, 6, 7, 8].find((p) => tail.slice(p).every((v, i) => v === tail[i]));
    expect(period).toBe(6);
  });

  it('모든 Net이 0인 대칭 상태에서 시작해도 진동으로 표시한다', () => {
    const e = new Engine(compile(notRing(3)));
    e.tick(40);
    expect(e.oscillating).toEqual(expect.arrayContaining(['not1', 'not2', 'not3']));
  });

  it('진동은 시뮬레이션을 멈추지 않는다 (클럭으로 쓸 수 있음)', () => {
    const e = new Engine(compile(notRing(3)));
    e.tick(100);
    const before = e.read('not1');
    e.tick(3);
    expect(e.read('not1')).toBe(1 - before);
  });

  it('NOT 하나의 자기 루프는 매 틱 바뀌어 규칙 4(32틱 중 16회 초과)에 걸린다', () => {
    const c = new CircuitBuilder().add('NOT', 'n').wire('n.y', 'n.a').build();
    const e = new Engine(compile(c));
    e.tick(40);
    expect(e.oscillating).toEqual(['n']);
  });
});

describe('클럭', () => {
  it('반주기마다 반전한다', () => {
    const c = new CircuitBuilder().add('CLOCK', 'clk').add('LED', 'y').wire('clk.y', 'y.a').build();
    c.parts[0]!.props = { hz: 1 };
    const e = new Engine(compile(c));
    e.setTicksPerSecond(8); // 반주기 4틱
    const trace: number[] = [];
    for (let i = 0; i < 16; i++) {
      e.tick();
      trace.push(e.read('clk'));
    }
    expect(trace).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('클럭으로 구동되는 래치는 진동으로 보지 않는다', () => {
    const c = srLatch();
    c.parts = c.parts.map((p) => (p.id === 's' ? { ...p, kind: { type: 'primitive', kind: 'CLOCK' }, props: { hz: 1 } } : p));
    const e = new Engine(compile(c));
    e.setTicksPerSecond(40);
    e.tick(200);
    expect(e.oscillating).toEqual([]);
  });
});

describe('재컴파일', () => {
  it('carry로 같은 id의 Net 값을 이어받는다', () => {
    const e1 = new Engine(compile(srLatch()));
    e1.setInput('s', 1);
    e1.tick(10);
    e1.setInput('s', 0);
    e1.tick(10);
    const e2 = new Engine();
    e2.load(compile(srLatch()), e1.snapshot());
    e2.tick(20);
    expect(led(e2, 'q')).toBe(1);
  });
});

describe('입력 2~8개 게이트', () => {
  const gate = (kind: 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR', n: number) => {
    const b = new CircuitBuilder().add(kind, 'g').add('LED', 'y').wire('g.y', 'y.a');
    b.parts[0]!.props = { inputs: n };
    const names = 'abcdefgh'.slice(0, n).split('');
    names.forEach((p) => b.add('SWITCH', `s${p}`).wire(`s${p}.y`, `g.${p}`));
    return { e: new Engine(compile(b.build())), names };
  };
  const expected = {
    AND: (ones: number, n: number) => (ones === n ? 1 : 0),
    OR: (ones: number) => (ones > 0 ? 1 : 0),
    XOR: (ones: number) => ones & 1,
    NAND: (ones: number, n: number) => (ones === n ? 0 : 1),
    NOR: (ones: number) => (ones > 0 ? 0 : 1),
    XNOR: (ones: number) => 1 - (ones & 1),
  } as const;

  it.each(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR'] as const)('%s 3입력 진리표 (XOR는 1이 홀수 개일 때 1)', (kind) => {
    const { e, names } = gate(kind, 3);
    for (let i = 0; i < 8; i++) {
      names.forEach((p, k) => e.setInput(`s${p}`, ((i >> k) & 1) as 0 | 1));
      e.settle();
      const ones = [0, 1, 2].filter((k) => (i >> k) & 1).length;
      expect(e.readPin('y.a'), `${kind} ${i.toString(2)}`).toBe(expected[kind](ones, 3));
    }
  });

  it('8입력 AND도 한 게이트 = 1틱 지연', () => {
    const { e, names } = gate('AND', 8);
    e.settle();
    names.forEach((p) => e.setInput(`s${p}`, 1));
    e.tick(); // 입력은 이 틱 시작에 반영되고 게이트 출력은 이 틱 끝에
    expect(e.read('g')).toBe(1);
    e.setInput('sh', 0);
    e.tick();
    expect(e.read('g')).toBe(0);
    expect(e.netlist.nodes.filter((n) => n.kind === 'AND')).toHaveLength(1);
  });

  it('연결 안 된 입력은 0: 3입력 AND는 두 개만 1이면 0', () => {
    const b = new CircuitBuilder().add('AND', 'g').add('SWITCH', 'a').add('SWITCH', 'b').add('LED', 'y').wire('a.y', 'g.a').wire('b.y', 'g.b').wire('g.y', 'y.a');
    b.parts[0]!.props = { inputs: 3 };
    const e = new Engine(compile(b.build()));
    e.setInput('a', 1);
    e.setInput('b', 1);
    e.settle();
    expect(e.readPin('y.a')).toBe(0);
  });
});

describe('8세그먼트 표시기', () => {
  it('핀 a~g·dp는 각각 연결된 신호를 그대로 읽고, 연결 안 된 세그먼트는 0', () => {
    const c = new CircuitBuilder()
      .add('SWITCH', 's1', 0, 0, 'A')
      .add('SWITCH', 's2', 0, 4, 'B')
      .add('NOT', 'n', 4, 4)
      .add('SEG8', 'seg', 12, 0)
      .wire('s1.y', 'seg.a')
      .wire('s1.y', 'seg.d')
      .wire('s2.y', 'n.a')
      .wire('n.y', 'seg.dp')
      .build();
    const e = new Engine(compile(c));
    e.setInput('s1', 1);
    e.tick(3);
    expect(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].map((p) => e.readPin(`seg.${p}`))).toEqual([1, 0, 0, 1, 0, 0, 0, 1]);
    e.setInput('s2', 1);
    e.tick(3);
    expect(e.readPin('seg.dp')).toBe(0);
  });
});

describe('상수 VCC·GND', () => {
  it('VCC는 첫 틱 뒤 1, GND는 늘 0이고 게이트 입력으로 쓸 수 있다', () => {
    const c = new CircuitBuilder()
      .add('VCC', 'v', 0, 0)
      .add('GND', 'g', 0, 4)
      .add('AND', 'and1', 6, 0)
      .add('OR', 'or1', 6, 6)
      .add('LED', 'y1', 14, 0, 'Y1')
      .add('LED', 'y2', 14, 6, 'Y2')
      .wire('v.y', 'and1.a')
      .wire('v.y', 'and1.b')
      .wire('g.y', 'or1.a')
      .wire('g.y', 'or1.b')
      .wire('and1.y', 'y1.a')
      .wire('or1.y', 'y2.a')
      .build();
    const e = new Engine(compile(c));
    expect(e.readPin('v.y')).toBe(0);
    e.tick(1);
    expect(e.readPin('v.y')).toBe(1);
    e.tick(2);
    expect([led(e, 'y1'), led(e, 'y2'), e.readPin('g.y')]).toEqual([1, 0, 0]);
    // 초기화하면 다시 0에서 시작해 첫 틱 뒤 1
    e.reset();
    expect(e.readPin('v.y')).toBe(0);
    e.tick(1);
    expect(e.readPin('v.y')).toBe(1);
  });

  it('여러 비트 VCC는 모든 비트가 1', () => {
    const c = new CircuitBuilder().add('VCC', 'v', 0, 0).bits(4).add('LED', 'y', 6, 0, 'Y').bits(4).wire('v.y', 'y.a').build();
    const e = new Engine(compile(c));
    e.tick(1);
    expect([0, 1, 2, 3].map((k) => e.readPin(k ? `y.a[${k}]` : 'y.a'))).toEqual([1, 1, 1, 1]);
  });
});
