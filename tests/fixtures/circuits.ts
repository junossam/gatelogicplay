// 테스트용 회로 빌더와 예제 회로 (SPEC 14장). 단위 테스트와 E2E가 함께 쓴다.
import type { ChipDef, Circuit, Part, PrimitiveKind } from '../../src/sim/types';

export class CircuitBuilder {
  parts: Part[] = [];
  wires: Circuit['wires'] = [];

  add(kind: PrimitiveKind, id: string, x = 0, y = 0, label?: string): this {
    const part: Part = { id, kind: { type: 'primitive', kind }, x, y };
    if (label) part.label = label;
    this.parts.push(part);
    return this;
  }

  /** 마지막에 넣은 부품의 비트 수 (8단계 버스) */
  bits(n: number): this {
    const last = this.parts[this.parts.length - 1]!;
    last.props = { ...last.props, bits: n };
    return this;
  }

  chip(chipId: string, id: string, x = 0, y = 0): this {
    this.parts.push({ id, kind: { type: 'chip', chipId }, x, y });
    return this;
  }

  /** 'or1.y' → 'not1.a' */
  wire(from: string, to: string): this {
    const [fp, fpin] = from.split('.') as [string, string];
    const [tp, tpin] = to.split('.') as [string, string];
    this.wires.push({ id: `w${this.wires.length + 1}`, from: { partId: fp, pin: fpin }, to: { partId: tp, pin: tpin } });
    return this;
  }

  build(): Circuit {
    return { parts: this.parts, wires: this.wires };
  }
}

/** OR 2개 + NOT 2개 SR 래치. R/S는 푸시 버튼, Q/Q̄는 LED. */
export function srLatch(): Circuit {
  return new CircuitBuilder()
    .add('PUSH', 'r', 0, 2, 'R')
    .add('PUSH', 's', 0, 10, 'S')
    .add('OR', 'or1', 6, 1)
    .add('NOT', 'not1', 13, 2)
    .add('OR', 'or2', 6, 9)
    .add('NOT', 'not2', 13, 10)
    .add('LED', 'q', 21, 2, 'Q')
    .add('LED', 'qn', 21, 10, 'Q̄')
    .wire('r.y', 'or1.a')
    .wire('not2.y', 'or1.b')
    .wire('or1.y', 'not1.a')
    .wire('not1.y', 'q.a')
    .wire('s.y', 'or2.a')
    .wire('not1.y', 'or2.b')
    .wire('or2.y', 'not2.a')
    .wire('not2.y', 'qn.a')
    .build();
}

export function notRing(n = 3): Circuit {
  const b = new CircuitBuilder();
  for (let i = 1; i <= n; i++) b.add('NOT', `not${i}`, i * 6, 2);
  for (let i = 1; i <= n; i++) b.wire(`not${i}.y`, `not${(i % n) + 1}.a`);
  b.add('LED', 'led1', 6 * n + 6, 2, 'Y');
  b.wire(`not${n}.y`, 'led1.a');
  return b.build();
}

export function halfAdder(): Circuit {
  return new CircuitBuilder()
    .add('SWITCH', 'a', 0, 0, 'A')
    .add('SWITCH', 'b', 0, 6, 'B')
    .add('XOR', 'xor1', 6, 0)
    .add('AND', 'and1', 6, 6)
    .add('LED', 's', 14, 1, 'S')
    .add('LED', 'c', 14, 7, 'C')
    .wire('a.y', 'xor1.a')
    .wire('b.y', 'xor1.b')
    .wire('a.y', 'and1.a')
    .wire('b.y', 'and1.b')
    .wire('xor1.y', 's.a')
    .wire('and1.y', 'c.a')
    .build();
}

const STAMP = '2026-01-01T00:00:00.000Z';

export function chipDef(id: string, name: string, circuit: Circuit, inputs: [string, string][], outputs: [string, string][]): ChipDef {
  return {
    id,
    name,
    color: 'chip-1',
    inputs: inputs.map(([pinName, partId]) => ({ name: pinName, partId })),
    outputs: outputs.map(([pinName, partId]) => ({ name: pinName, partId })),
    circuit,
    createdAt: STAMP,
    updatedAt: STAMP,
    revision: 1,
  };
}

/** SR 래치 칩: 입력 R, S / 출력 Q, Q̄ */
export function srLatchChip(id = 'chip-sr'): ChipDef {
  return chipDef(id, 'SR 래치', srLatch(), [['R', 'r'], ['S', 's']], [['Q', 'q'], ['Q̄', 'qn']]);
}

/** D 래치 = SR 래치 칩 + AND 2 + NOT. CLK=1이면 Q가 D를 따름. */
export function dLatchChip(srId = 'chip-sr', id = 'chip-dlatch'): ChipDef {
  const c = new CircuitBuilder()
    .add('SWITCH', 'd', 0, 2, 'D')
    .add('SWITCH', 'clk', 0, 8, 'CLK')
    .add('NOT', 'notd', 5, 0)
    .add('AND', 'andr', 11, 0)
    .add('AND', 'ands', 11, 6)
    .chip(srId, 'latch', 18, 2)
    .add('LED', 'q', 26, 2, 'Q')
    .add('LED', 'qn', 26, 6, 'Q̄')
    .wire('d.y', 'notd.a')
    .wire('notd.y', 'andr.a')
    .wire('clk.y', 'andr.b')
    .wire('d.y', 'ands.a')
    .wire('clk.y', 'ands.b')
    .wire('andr.y', 'latch.R')
    .wire('ands.y', 'latch.S')
    .wire('latch.Q', 'q.a')
    .wire('latch.Q̄', 'qn.a')
    .build();
  return chipDef(id, 'D 래치', c, [['D', 'd'], ['CLK', 'clk']], [['Q', 'q'], ['Q̄', 'qn']]);
}

/** 마스터-슬레이브 D 플립플롭: 상승 에지에서 저장 */
export function dffChip(dLatchId = 'chip-dlatch', id = 'chip-dff'): ChipDef {
  const c = new CircuitBuilder()
    .add('SWITCH', 'd', 0, 2, 'D')
    .add('SWITCH', 'clk', 0, 8, 'CLK')
    .add('NOT', 'nclk', 5, 8)
    .chip(dLatchId, 'master', 11, 2)
    .chip(dLatchId, 'slave', 19, 2)
    .add('LED', 'q', 27, 2, 'Q')
    .wire('d.y', 'master.D')
    .wire('nclk.y', 'master.CLK')
    .wire('clk.y', 'nclk.a')
    .wire('master.Q', 'slave.D')
    .wire('clk.y', 'slave.CLK')
    .wire('slave.Q', 'q.a')
    .build();
  return chipDef(id, 'D 플립플롭', c, [['D', 'd'], ['CLK', 'clk']], [['Q', 'q']]);
}

/** 4비트 레지스터 = D 플립플롭 4개, 공통 CLK */
export function register4Chip(dffId = 'chip-dff', id = 'chip-reg4'): ChipDef {
  const b = new CircuitBuilder().add('SWITCH', 'clk', 0, 20, 'CLK');
  for (let i = 0; i < 4; i++) {
    b.add('SWITCH', `d${i}`, 0, i * 4, `D${i}`)
      .chip(dffId, `dff${i}`, 8, i * 5)
      .add('LED', `q${i}`, 18, i * 5, `Q${i}`)
      .wire(`d${i}.y`, `dff${i}.D`)
      .wire('clk.y', `dff${i}.CLK`)
      .wire(`dff${i}.Q`, `q${i}.a`);
  }
  return chipDef(
    id,
    '4비트 레지스터',
    b.build(),
    [['D0', 'd0'], ['D1', 'd1'], ['D2', 'd2'], ['D3', 'd3'], ['CLK', 'clk']],
    [['Q0', 'q0'], ['Q1', 'q1'], ['Q2', 'q2'], ['Q3', 'q3']],
  );
}

export function nestedLibrary(): Record<string, ChipDef> {
  const defs = [srLatchChip(), dLatchChip(), dffChip(), register4Chip()];
  return Object.fromEntries(defs.map((d) => [d.id, d]));
}

/**
 * 게이트 n개짜리 성능 측정용 회로: NOT/XOR 사슬이 여러 줄, 줄 머리는 입력 하나가 구동.
 * XOR의 두 번째 입력은 바로 위 줄 게이트 — 실제 회로처럼 연결이 대부분 가깝다.
 * fanout: 'local'(기본) 또는 'input'(입력 하나가 모든 XOR을 구동하는 극단적인 경우)
 */
export function bigCircuit(gates: number, cols = 50, fanout: 'local' | 'input' = 'local'): Circuit {
  const b = new CircuitBuilder().add('SWITCH', 'in', 0, 0, 'A');
  const rows = Math.ceil(gates / cols);
  let count = 0;
  for (let r = 0; r < rows && count < gates; r++) {
    for (let c = 0; c < cols && count < gates; c++, count++) {
      const id = `g${r}_${c}`;
      b.add(c % 2 ? 'XOR' : 'NOT', id, 4 + c * 5, r * 5);
      if (c === 0) b.wire('in.y', `${id}.a`);
      else {
        b.wire(`g${r}_${c - 1}.y`, `${id}.a`);
        if (c % 2) b.wire(fanout === 'input' || r === 0 ? 'in.y' : `g${r - 1}_${c}.y`, `${id}.b`);
      }
    }
  }
  return b.build();
}

export function halfAdderChip(id = 'chip-ha'): ChipDef {
  return chipDef(id, '반가산기', halfAdder(), [['A', 'a'], ['B', 'b']], [['S', 's'], ['C', 'c']]);
}

/** 전가산기 = 반가산기 칩 2개 + OR */
export function fullAdderChip(haId = 'chip-ha', id = 'chip-fa'): ChipDef {
  const c = new CircuitBuilder()
    .add('SWITCH', 'a', 0, 0, 'A')
    .add('SWITCH', 'b', 0, 4, 'B')
    .add('SWITCH', 'cin', 0, 8, 'Cin')
    .chip(haId, 'ha1', 5, 0)
    .chip(haId, 'ha2', 13, 4)
    .add('OR', 'or1', 21, 6)
    .add('LED', 's', 28, 0, 'S')
    .add('LED', 'cout', 28, 6, 'Cout')
    .wire('a.y', 'ha1.A')
    .wire('b.y', 'ha1.B')
    .wire('ha1.S', 'ha2.A')
    .wire('cin.y', 'ha2.B')
    .wire('ha2.S', 's.a')
    .wire('ha1.C', 'or1.a')
    .wire('ha2.C', 'or1.b')
    .wire('or1.y', 'cout.a')
    .build();
  return chipDef(id, '전가산기', c, [['A', 'a'], ['B', 'b'], ['Cin', 'cin']], [['S', 's'], ['Cout', 'cout']]);
}

/** 4비트 리플 캐리 가산기 = 전가산기 칩 4개 (Cin은 연결 안 함 = 0) */
export function adder4Chip(faId = 'chip-fa', id = 'chip-add4'): ChipDef {
  const b = new CircuitBuilder();
  for (let i = 0; i < 4; i++) {
    b.add('SWITCH', `a${i}`, 0, i * 8, `A${i}`)
      .add('SWITCH', `b${i}`, 0, i * 8 + 3, `B${i}`)
      .chip(faId, `fa${i}`, 6, i * 8)
      .add('LED', `s${i}`, 16, i * 8, `S${i}`)
      .wire(`a${i}.y`, `fa${i}.A`)
      .wire(`b${i}.y`, `fa${i}.B`)
      .wire(`fa${i}.S`, `s${i}.a`);
    if (i > 0) b.wire(`fa${i - 1}.Cout`, `fa${i}.Cin`);
  }
  b.add('LED', 'cout', 16, 32, 'Cout').wire('fa3.Cout', 'cout.a');
  return chipDef(
    id,
    '4비트 가산기',
    b.build(),
    [0, 1, 2, 3].flatMap((i) => [[`A${i}`, `a${i}`] as [string, string], [`B${i}`, `b${i}`] as [string, string]]),
    [...[0, 1, 2, 3].map((i) => [`S${i}`, `s${i}`] as [string, string]), ['Cout', 'cout']],
  );
}

export function adderLibrary(): Record<string, ChipDef> {
  const defs = [halfAdderChip(), fullAdderChip(), adder4Chip()];
  return Object.fromEntries(defs.map((d) => [d.id, d]));
}

/** 칩 하나를 쓰고 입력마다 SWITCH, 출력마다 LED를 붙인 최상위 회로 */
export function harness(def: ChipDef, instanceId = 'u1'): Circuit {
  const b = new CircuitBuilder().chip(def.id, instanceId, 8, 0);
  def.inputs.forEach((p, i) => b.add('SWITCH', `in_${p.name}`, 0, i * 3, p.name).wire(`in_${p.name}.y`, `${instanceId}.${p.name}`));
  def.outputs.forEach((p, i) => b.add('LED', `out_${p.name}`, 20, i * 3, p.name).wire(`${instanceId}.${p.name}`, `out_${p.name}.a`));
  return b.build();
}

/** 4비트 가산기(버스 핀): A[4], B[4] → S[4], Cout. 안에서 나누기 → 전가산기 4개 → 묶기 */
export function busAdderChip(faId = 'chip-fa', id = 'chip-add4bus'): ChipDef {
  const b = new CircuitBuilder()
    .add('SWITCH', 'a', 0, 4, 'A')
    .bits(4)
    .add('SWITCH', 'b', 0, 20, 'B')
    .bits(4)
    .add('SPLIT', 'sa', 6, 1)
    .bits(4)
    .add('SPLIT', 'sb', 6, 17)
    .bits(4)
    .add('MERGE', 'ms', 30, 1)
    .bits(4)
    .add('LED', 's', 36, 4, 'S')
    .bits(4)
    .add('LED', 'cout', 36, 20, 'Cout')
    .wire('a.y', 'sa.a')
    .wire('b.y', 'sb.a')
    .wire('ms.y', 's.a');
  for (let i = 0; i < 4; i++) {
    b.chip(faId, `fa${i}`, 14, i * 7)
      .wire(`sa.y${i}`, `fa${i}.A`)
      .wire(`sb.y${i}`, `fa${i}.B`)
      .wire(`fa${i}.S`, `ms.a${i}`);
    if (i > 0) b.wire(`fa${i - 1}.Cout`, `fa${i}.Cin`);
  }
  b.wire('fa3.Cout', 'cout.a');
  return chipDef(id, '4비트 가산기(버스)', b.build(), [['A', 'a'], ['B', 'b']], [['S', 's'], ['Cout', 'cout']]);
}

/** 버스 가산기 데모: 4비트 스위치 A, B → 칩 → 숫자 LED S, LED Cout */
export function busAdderWorkspace(chipId = 'chip-add4bus'): Circuit {
  return new CircuitBuilder()
    .add('SWITCH', 'ina', 0, 2, 'A')
    .bits(4)
    .add('SWITCH', 'inb', 0, 8, 'B')
    .bits(4)
    .chip(chipId, 'add', 8, 3)
    .add('LED', 'sum', 20, 2, 'S')
    .bits(4)
    .add('LED', 'carry', 20, 8, 'Cout')
    .wire('ina.y', 'add.A')
    .wire('inb.y', 'add.B')
    .wire('add.S', 'sum.a')
    .wire('add.Cout', 'carry.a')
    .build();
}

export function busLibrary(): Record<string, ChipDef> {
  const defs = [halfAdderChip(), fullAdderChip(), busAdderChip()];
  return Object.fromEntries(defs.map((d) => [d.id, d]));
}
