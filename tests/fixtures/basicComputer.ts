// 기본 컴퓨터(Mano, 그림 5-4)의 공통 버스 구조와 명령어 인출(fetch) 예제.
// 레지스터·버스·메모리·제어를 칩으로 만들고 작업 공간에 그림처럼 배치한다.
// 메모리 4096×16은 게이트로 만들 수 없어 진리표 부품(입력 8 → 출력 16)으로 256워드 ROM을 만든다 (주소 = AR 아래 8비트).
import { withDependencies } from '../../src/model/library';
import type { ChipDef, Circuit, Library } from '../../src/sim/types';
import { CircuitBuilder } from './circuits';
import { chipAt, gate, led, makeChip, merge, split, sw } from './teaching';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** ROM에 넣을 프로그램 (Mano 예제: LDA·ADD·STA·HLT와 데이터, 간접 주소 명령 하나) */
export const PROGRAM: Record<number, number> = {
  0x000: 0x2004, // LDA 004
  0x001: 0x1005, // ADD 005
  0x002: 0x3006, // STA 006
  0x003: 0x7001, // HLT
  0x004: 0x0053,
  0x005: 0xffe9,
  0x006: 0x0000,
  0x007: 0x9004, // ADD I 004 (I = 1)
};

export function basicComputer(ff: Library): { circuit: Circuit; library: Library } {
  const setCat = (...defs: ChipDef[]) => defs.forEach((d) => ((d.category = '기본 컴퓨터'), (d.color = 'chip-1')));

  /** 레지스터 1비트: CLR > LD > INR 순. INR이면 CIN을 더하고 COUT으로 자리올림을 넘긴다 (CLK 상승 에지) */
  const bit = makeChip('bc-bit', '레지스터 비트', (b) => {
    for (const [id, label] of [['d', 'D'], ['ld', 'LD'], ['inr', 'INR'], ['clr', 'CLR'], ['cin', 'CIN'], ['clk', 'CLK']]) sw(b, id!, label!);
    gate(b, 'XOR', 'inc', ['f.Q', 'cin.y']);
    gate(b, 'AND', 'cout', ['f.Q', 'cin.y']);
    gate(b, 'NOT', 'nld', ['ld.y']);
    gate(b, 'NOT', 'ninr', ['inr.y']);
    gate(b, 'NOT', 'nclr', ['clr.y']);
    gate(b, 'AND', 'tld', ['ld.y', 'd.y']);
    gate(b, 'AND', 'tinr', ['nld.y', 'inr.y', 'inc.y']);
    gate(b, 'AND', 'thold', ['nld.y', 'ninr.y', 'f.Q']);
    gate(b, 'OR', 'pre', ['tld.y', 'tinr.y', 'thold.y']);
    gate(b, 'AND', 'next', ['pre.y', 'nclr.y']);
    chipAt(b, 'ff-d', 'f', { D: 'next.y', CLK: 'clk.y' });
    led(b, 'q', 'Q', 'f.Q');
    led(b, 'co', 'COUT', 'cout.y');
  }, [['D', 'd'], ['LD', 'ld'], ['INR', 'inr'], ['CLR', 'clr'], ['CIN', 'cin'], ['CLK', 'clk']], [['Q', 'q'], ['COUT', 'co']], ff);

  /** I·E 플립플롭: LD=1이면 CLK 상승에 D를 저장, CLR이면 0 */
  const ff1 = makeChip('bc-ff1', '플립플롭 (LD·CLR)', (b) => {
    for (const [id, label] of [['d', 'D'], ['ld', 'LD'], ['clr', 'CLR'], ['clk', 'CLK']]) sw(b, id!, label!);
    gate(b, 'NOT', 'nld', ['ld.y']);
    gate(b, 'NOT', 'nclr', ['clr.y']);
    gate(b, 'AND', 'take', ['d.y', 'ld.y']);
    gate(b, 'AND', 'keep', ['f.Q', 'nld.y']);
    gate(b, 'OR', 'pre', ['take.y', 'keep.y']);
    gate(b, 'AND', 'next', ['pre.y', 'nclr.y']);
    chipAt(b, 'ff-d', 'f', { D: 'next.y', CLK: 'clk.y' });
    led(b, 'q', 'Q', 'f.Q');
  }, [['D', 'd'], ['LD', 'ld'], ['CLR', 'clr'], ['CLK', 'clk']], [['Q', 'q']], ff);

  const reg4 = makeChip('bc-reg4', '4비트 레지스터 (LD·INR·CLR)', (b) => {
    sw(b, 'd', 'D', 4);
    for (const [id, label] of [['ld', 'LD'], ['inr', 'INR'], ['clr', 'CLR'], ['cin', 'CIN'], ['clk', 'CLK']]) sw(b, id!, label!);
    split(b, 'sd', 'd.y', 4);
    for (const i of range(4)) {
      chipAt(b, bit.id, `b${i}`, { D: `sd.y${i}`, LD: 'ld.y', INR: 'inr.y', CLR: 'clr.y', CIN: i ? `b${i - 1}.COUT` : 'cin.y', CLK: 'clk.y' });
    }
    merge(b, 'mq', range(4).map((i) => `b${i}.Q`));
    led(b, 'q', 'Q', 'mq.y', 4);
    led(b, 'co', 'COUT', 'b3.COUT');
  }, [['D', 'd'], ['LD', 'ld'], ['INR', 'inr'], ['CLR', 'clr'], ['CIN', 'cin'], ['CLK', 'clk']], [['Q', 'q'], ['COUT', 'co']], { ...ff, [bit.id]: bit });

  /** n비트 레지스터 = 4비트 레지스터 n/4개 (자리올림을 이어 INR이면 1 증가) */
  const regN = (n: number) =>
    makeChip(`bc-reg${n}`, `${n}비트 레지스터 (LD·INR·CLR)`, (b) => {
      sw(b, 'd', 'D', n);
      for (const [id, label] of [['ld', 'LD'], ['inr', 'INR'], ['clr', 'CLR'], ['clk', 'CLK']]) sw(b, id!, label!);
      b.add('VCC', 'one');
      split(b, 'sd', 'd.y', n);
      const groups = n / 4;
      for (const g of range(groups)) {
        merge(b, `in${g}`, range(4).map((k) => `sd.y${g * 4 + k}`));
        chipAt(b, reg4.id, `r${g}`, { D: `in${g}.y`, LD: 'ld.y', INR: 'inr.y', CLR: 'clr.y', CIN: g ? `r${g - 1}.COUT` : 'one.y', CLK: 'clk.y' });
        split(b, `out${g}`, `r${g}.Q`, 4);
      }
      merge(b, 'mq', range(n).map((k) => `out${Math.floor(k / 4)}.y${k % 4}`));
      led(b, 'q', 'Q', 'mq.y', n);
    }, [['D', 'd'], ['LD', 'ld'], ['INR', 'inr'], ['CLR', 'clr'], ['CLK', 'clk']], [['Q', 'q']], { ...ff, [bit.id]: bit, [reg4.id]: reg4 });
  const reg8 = regN(8);
  const reg12 = regN(12);
  const reg16 = regN(16);

  /**
   * 공통 버스: S2 S1 S0이 고른 번호(1~7)의 입력을 버스로. 0이면 버스는 0.
   * 1(AR)·2(PC)는 12비트라 위 4비트를 0으로 채우고, 받는 쪽에 맞춰 버스의 아래 12비트·8비트·15번 비트도 따로 낸다.
   */
  const bus = makeChip('bc-bus', '공통 버스 (16비트)', (b) => {
    sw(b, 's', 'S', 3);
    for (const i of range(7)) sw(b, `x${i + 1}`, `${i + 1}`, i < 2 ? 12 : 16);
    b.add('GND', 'zero');
    for (const v of [1, 2]) {
      split(b, `z${v}`, `x${v}.y`, 12);
      merge(b, `e${v}`, [...range(12).map((k) => `z${v}.y${k}`), 'zero.y', 'zero.y', 'zero.y', 'zero.y']);
    }
    split(b, 'ss', 's.y', 3);
    for (const k of range(3)) gate(b, 'NOT', `n${k}`, [`ss.y${k}`]);
    for (let v = 1; v <= 7; v++) {
      gate(b, 'AND', `sel${v}`, range(3).map((k) => ((v >> k) & 1 ? `ss.y${k}` : `n${k}.y`)));
      // 선택 신호를 16비트로 넓혀 입력과 AND
      merge(b, `w${v}`, range(16).map(() => `sel${v}.y`));
      gate(b, 'AND', `a${v}`, [v <= 2 ? `e${v}.y` : `x${v}.y`, `w${v}.y`], 16);
    }
    gate(b, 'OR', 'o', range(7).map((i) => `a${i + 1}.y`), 16);
    split(b, 'bs', 'o.y', 16);
    merge(b, 'b12', range(12).map((k) => `bs.y${k}`));
    merge(b, 'b8', range(8).map((k) => `bs.y${k}`));
    led(b, 'bus', 'BUS', 'o.y', 16);
    led(b, 'bus12', 'BUS 0~11', 'b12.y', 12);
    led(b, 'bus8', 'BUS 0~7', 'b8.y', 8);
    led(b, 'bus15', 'BUS 15', 'bs.y15');
  }, [['S', 's'], ...range(7).map((i) => [`${i + 1}`, `x${i + 1}`] as [string, string])], [
    ['BUS', 'bus'], ['BUS 0~11', 'bus12'], ['BUS 0~7', 'bus8'], ['BUS 15', 'bus15'],
  ]);

  /** 메모리: 진리표 부품으로 만든 256×16 ROM. 주소는 12비트를 받지만 아래 8비트만 쓴다 */
  const table = range(256).map((a) => PROGRAM[a] ?? 0);
  const mem = makeChip('bc-mem', '메모리 (256×16 ROM)', (b) => {
    sw(b, 'addr', 'Address', 12);
    split(b, 'sa', 'addr.y', 12);
    b.add('LUT', 'rom', 0, 0, 'ROM 256×16');
    b.parts[b.parts.length - 1]!.props = {
      inputs: 8,
      outputs: 16,
      table,
      inNames: range(8).map((k) => `A${7 - k}`),
      outNames: range(16).map((j) => `D${j}`),
    };
    // 진리표 부품은 A가 가장 높은 자리: a ← 주소 7번 비트, …, h ← 0번 비트
    for (const k of range(8)) b.wire(`sa.y${7 - k}`, `rom.${'abcdefgh'[k]}`);
    merge(b, 'md', range(16).map((j) => `rom.y${j}`));
    led(b, 'data', 'Data', 'md.y', 16);
  }, [['Address', 'addr']], [['Data', 'data']]);

  const ha = makeChip('bc-ha', '반가산기', (b) => {
    sw(b, 'a', 'A');
    sw(b, 'b', 'B');
    gate(b, 'XOR', 'x', ['a.y', 'b.y']);
    gate(b, 'AND', 'c', ['a.y', 'b.y']);
    led(b, 's', 'S', 'x.y');
    led(b, 'oc', 'C', 'c.y');
  }, [['A', 'a'], ['B', 'b']], [['S', 's'], ['C', 'oc']]);
  const fa = makeChip('bc-fa', '전가산기', (b) => {
    sw(b, 'a', 'A');
    sw(b, 'b', 'B');
    sw(b, 'cin', 'Cin');
    chipAt(b, ha.id, 'h1', { A: 'a.y', B: 'b.y' });
    chipAt(b, ha.id, 'h2', { A: 'h1.S', B: 'cin.y' });
    gate(b, 'OR', 'o', ['h1.C', 'h2.C']);
    led(b, 's', 'S', 'h2.S');
    led(b, 'cout', 'Cout', 'o.y');
  }, [['A', 'a'], ['B', 'b'], ['Cin', 'cin']], [['S', 's'], ['Cout', 'cout']], { [ha.id]: ha });
  /** 덧셈·논리 회로: AC + DR (자리올림은 E로). 이 예제의 인출 단계에서는 쓰지 않는다 */
  const alu = makeChip('bc-alu', '덧셈·논리 회로', (b) => {
    sw(b, 'ac', 'AC', 16);
    sw(b, 'dr', 'DR', 16);
    b.add('GND', 'zero');
    split(b, 'sac', 'ac.y', 16);
    split(b, 'sdr', 'dr.y', 16);
    for (const i of range(16)) chipAt(b, fa.id, `fa${i}`, { A: `sac.y${i}`, B: `sdr.y${i}`, Cin: i ? `fa${i - 1}.Cout` : 'zero.y' });
    merge(b, 'ms', range(16).map((i) => `fa${i}.S`));
    led(b, 'sum', '합', 'ms.y', 16);
    led(b, 'e', 'E', 'fa15.Cout');
  }, [['AC', 'ac'], ['DR', 'dr']], [['합', 'sum'], ['E', 'e']], { [fa.id]: fa, [ha.id]: ha });

  /**
   * 인출 제어: 순서 카운터(SC, 0~3)와 해독기. CLK마다 T0 → T1 → T2 → T3 → T0 …
   * T0: AR ← PC (S=2) · T1: DR ← M[AR] (S=7), PC ← PC+1 · T2: IR ← DR (S=3) · T3: I ← IR(15), AR ← IR(0~11) (S=5)
   */
  const ctrl = makeChip('bc-ctrl', '인출 제어 (SC·해독기)', (b) => {
    sw(b, 'clk', 'CLK');
    sw(b, 'clr', 'CLR');
    gate(b, 'NOT', 'nclr', ['clr.y']);
    gate(b, 'AND', 'd0', ['q0.Q̄', 'nclr.y']);
    gate(b, 'XOR', 'x1', ['q1.Q', 'q0.Q']);
    gate(b, 'AND', 'd1', ['x1.y', 'nclr.y']);
    chipAt(b, 'ff-d', 'q0', { D: 'd0.y', CLK: 'clk.y' });
    chipAt(b, 'ff-d', 'q1', { D: 'd1.y', CLK: 'clk.y' });
    const t = [['q1.Q̄', 'q0.Q̄'], ['q1.Q̄', 'q0.Q'], ['q1.Q', 'q0.Q̄'], ['q1.Q', 'q0.Q']];
    t.forEach(([a, c], i) => gate(b, 'AND', `t${i}`, [a!, c!]));
    gate(b, 'OR', 's2', ['t1.y', 't3.y']);
    gate(b, 'OR', 's1', ['t0.y', 't1.y', 't2.y']);
    gate(b, 'OR', 's0', ['t1.y', 't2.y', 't3.y']);
    gate(b, 'OR', 'ldar', ['t0.y', 't3.y']);
    merge(b, 'ms', ['s0.y', 's1.y', 's2.y']);
    for (const i of range(4)) led(b, `ot${i}`, `T${i}`, `t${i}.y`);
    led(b, 'os', 'S', 'ms.y', 3);
    led(b, 'oldar', 'LD(AR)', 'ldar.y');
    led(b, 'olddr', 'LD(DR)', 't1.y');
    led(b, 'oinrpc', 'INR(PC)', 't1.y');
    led(b, 'oldir', 'LD(IR)', 't2.y');
    led(b, 'oldi', 'LD(I)', 't3.y');
  }, [['CLK', 'clk'], ['CLR', 'clr']], [
    ['T0', 'ot0'], ['T1', 'ot1'], ['T2', 'ot2'], ['T3', 'ot3'], ['S', 'os'],
    ['LD(AR)', 'oldar'], ['LD(DR)', 'olddr'], ['INR(PC)', 'oinrpc'], ['LD(IR)', 'oldir'], ['LD(I)', 'oldi'],
  ], ff);

  setCat(bit, ff1, reg4, reg8, reg12, reg16, bus, mem, ha, fa, alu, ctrl);
  const all = [bit, ff1, reg4, reg8, reg12, reg16, bus, mem, ha, fa, alu, ctrl];
  const full: Library = { ...ff, ...Object.fromEntries(all.map((d) => [d.id, d])) };
  const library = withDependencies(all.map((d) => d.id), full);

  // ---------------------------------------------------------------- 작업 공간 (그림 5-4처럼)
  // 가운데 세로로 메모리 → AR → PC → DR → AC → IR → TR → OUTR. 왼쪽 세로줄이 공통 버스(버스 출력이 위를 돌아 내려온다),
  // 오른쪽 위 버스 선택기는 270° 돌려 1~7번 입력이 아래를 향하고, 레지스터 출력이 오른쪽 세로줄로 올라가 꽂힌다.
  const b = new CircuitBuilder();
  const at = (x: number, y: number, rotation?: 0 | 90 | 180 | 270) => {
    const p = b.parts[b.parts.length - 1]!;
    p.x = x;
    p.y = y;
    if (rotation) p.rotation = rotation;
  };
  const named = (label: string) => (b.parts[b.parts.length - 1]!.label = label);
  const hexLed = (id: string, label: string, src: string, bits: number, x: number, y: number) => {
    led(b, id, label, src, bits);
    at(x, y);
    b.parts[b.parts.length - 1]!.props = { ...b.parts[b.parts.length - 1]!.props, hex: true };
  };

  /** 격자 좌표 */
  const COL = 14; // 레지스터 열 왼쪽 (칩 폭 6 → 출력 핀 x = 20)
  const BAR = 2; // 공통 버스 세로줄
  const TOP = -13; // 공통 버스 가로줄 (버스 선택기 위)
  const BUSX = 31; // 버스 선택기 왼쪽 (270° 회전: 입력 S·1~7이 아래, 출력이 위)
  const BUSY = -10;
  const lane = (n: number) => BUSX + 1 + 2 * n; // n번 입력 핀의 x (S = 0)
  const outX = (j: number) => BUSX + 1 + 2 * j; // j번 출력 핀의 x (BUS = 0, BUS 0~11 = 1, BUS 0~7 = 2, BUS 15 = 3)
  const ROW = { mem: 2, ar: 8, pc: 21, dr: 34, ac: 47, ir: 69, tr: 82, outr: 95 };

  // 왼쪽: 클럭·리셋, 인출 제어, 손으로 넣는 신호
  b.add('PUSH', 'clk', -32, 9, 'CLK');
  b.add('SWITCH', 'reset', -32, 14, 'RESET');
  b.add('GND', 'gnd', -32, 19);
  chipAt(b, ctrl.id, 'ctrl', { CLK: 'clk.y', CLR: 'reset.y' });
  at(-22, 8);
  named('인출 제어');
  for (const i of range(4)) {
    led(b, `t${i}`, `T${i}`, `ctrl.T${i}`);
    at(-32 + i * 4, 2);
  }
  led(b, 'sel', 'S', 'ctrl.S', 3);
  at(-15, 2);
  const manual: [string, string, number][] = [['ldac', 'LD(AC)', ROW.ac + 2], ['inrac', 'INR(AC)', ROW.ac + 6], ['ldtr', 'LD(TR)', ROW.tr + 2], ['inrtr', 'INR(TR)', ROW.tr + 6], ['ldout', 'LD(OUTR)', ROW.outr + 2]];
  for (const [id, label, y] of manual) b.add('SWITCH', id, -32, y, label);

  // 가운데 열
  chipAt(b, mem.id, 'mem', { Address: 'ar.Q' });
  at(COL, ROW.mem);
  named('메모리 256×16');
  const regs: [keyof typeof ROW, ChipDef, Record<string, string>][] = [
    ['ar', reg12, { D: 'bus.BUS 0~11', LD: 'ctrl.LD(AR)', INR: 'gnd.y', CLR: 'reset.y', CLK: 'clk.y' }],
    ['pc', reg12, { D: 'bus.BUS 0~11', LD: 'gnd.y', INR: 'ctrl.INR(PC)', CLR: 'reset.y', CLK: 'clk.y' }],
    ['dr', reg16, { D: 'bus.BUS', LD: 'ctrl.LD(DR)', INR: 'gnd.y', CLR: 'reset.y', CLK: 'clk.y' }],
    ['ac', reg16, { D: 'alu.합', LD: 'ldac.y', INR: 'inrac.y', CLR: 'reset.y', CLK: 'clk.y' }],
    ['ir', reg16, { D: 'bus.BUS', LD: 'ctrl.LD(IR)', INR: 'gnd.y', CLR: 'reset.y', CLK: 'clk.y' }],
    ['tr', reg16, { D: 'bus.BUS', LD: 'ldtr.y', INR: 'inrtr.y', CLR: 'reset.y', CLK: 'clk.y' }],
    ['outr', reg8, { D: 'bus.BUS 0~7', LD: 'ldout.y', INR: 'gnd.y', CLR: 'reset.y', CLK: 'clk.y' }],
  ];
  for (const [id, def, pins] of regs) {
    chipAt(b, def.id, id, pins);
    at(COL, ROW[id]);
    named(id.toUpperCase());
  }
  // AC 왼쪽: 덧셈·논리 회로와 E, 그 아래 INPR
  chipAt(b, alu.id, 'alu', { AC: 'ac.Q', DR: 'dr.Q' });
  at(6, ROW.ac);
  named('덧셈·논리');
  chipAt(b, ff1.id, 'eff', { D: 'alu.E', LD: 'ldac.y', CLR: 'reset.y', CLK: 'clk.y' });
  at(6, ROW.ac + 6);
  named('E');
  b.add('SWITCH', 'inpr', 6, ROW.ac + 16, 'INPR');
  b.parts[b.parts.length - 1]!.props = { bits: 8, hex: true };
  // IR 위: I 플립플롭
  chipAt(b, ff1.id, 'iff', { D: 'bus.BUS 15', LD: 'ctrl.LD(I)', CLR: 'reset.y', CLK: 'clk.y' });
  at(22, ROW.ir - 9);
  named('I');

  // 오른쪽 위: 버스 선택기 (270°)
  chipAt(b, bus.id, 'bus', { S: 'ctrl.S', '1': 'ar.Q', '2': 'pc.Q', '3': 'dr.Q', '4': 'ac.Q', '5': 'ir.Q', '6': 'tr.Q', '7': 'mem.Data' });
  at(BUSX, BUSY, 270);
  named('Bus');
  hexLed('v_bus', 'BUS', 'bus.BUS', 16, 50, -9);

  // 값 보기 LED (레지스터 오른쪽 아래, 16진수)
  hexLed('m_out', 'M[AR]', 'mem.Data', 16, 22, ROW.mem + 3);
  for (const [id, , ] of regs) hexLed(`v_${id}`, id.toUpperCase(), `${id}.Q`, id === 'ar' || id === 'pc' ? 12 : id === 'outr' ? 8 : 16, 22, ROW[id] + 4);
  led(b, 'v_i', 'I', 'iff.Q');
  at(30, ROW.ir - 8);
  led(b, 'v_e', 'E', 'eff.Q');
  at(6, ROW.ac + 20);

  const circuit = b.build();
  // 전선 경로를 그림처럼 직접 꺾는다
  const route = (from: string, to: string, points: [number, number][]) => {
    const [fp, fpin] = from.split('.') as [string, string];
    const [tp, tpin] = to.split('.') as [string, string];
    const w = circuit.wires.find((x) => x.from.partId === fp && x.from.pin === fpin && x.to.partId === tp && x.to.pin === tpin);
    if (!w) throw new Error(`전선 없음: ${from} → ${to}`);
    w.points = points.map(([x, y]) => ({ x, y }));
  };
  // 공통 버스: 버스 출력 → 위 → 왼쪽 세로줄 → 각 레지스터 D
  const busIn: [string, number, string][] = [
    ['ar.D', 1, 'bus.BUS 0~11'], ['pc.D', 1, 'bus.BUS 0~11'], ['dr.D', 0, 'bus.BUS'], ['ir.D', 0, 'bus.BUS'], ['tr.D', 0, 'bus.BUS'], ['outr.D', 2, 'bus.BUS 0~7'],
  ];
  for (const [to, j, from] of busIn) {
    const y = ROW[to.split('.')[0] as keyof typeof ROW] + 1;
    route(from, to, [[outX(j), TOP], [BAR, TOP], [BAR, y]]);
  }
  route('bus.BUS 15', 'iff.D', [[outX(3), TOP], [BAR, TOP], [BAR, ROW.ir - 8], [20, ROW.ir - 8]]);
  // 레지스터 출력 → 오른쪽 세로줄 → 버스 선택기 n번 입력
  const busOut: [string, number][] = [['ar.Q', 1], ['pc.Q', 2], ['dr.Q', 3], ['ac.Q', 4], ['ir.Q', 5], ['tr.Q', 6]];
  for (const [from, n] of busOut) route(from, `bus.${n}`, [[lane(n), ROW[from.split('.')[0] as keyof typeof ROW] + 1]]);
  route('mem.Data', 'bus.7', [[lane(7), ROW.mem + 1]]);
  // AR → 메모리 주소 (오른쪽으로 나가 위로 올라가 메모리 왼쪽으로)
  route('ar.Q', 'mem.Address', [[28, ROW.ar + 1], [28, ROW.mem - 2], [12, ROW.mem - 2], [12, ROW.mem + 1]]);
  circuit.notes = [
    {
      id: 'note1',
      x: -34,
      y: -24,
      text: [
        '기본 컴퓨터 명령어 인출 (MAR = AR, MBR = DR)',
        '① RESET을 켜고 CLK를 한 번 누른 뒤 RESET을 끄세요 (모두 0, T0)',
        '② CLK를 누를 때마다 한 단계씩:',
        '   T0: AR ← PC',
        '   T1: DR ← M[AR], PC ← PC + 1',
        '   T2: IR ← DR',
        '   T3: I ← IR(15), AR ← IR(0~11)',
        '메모리는 진리표 부품으로 만든 256워드 ROM (주소 = AR 아래 8비트). 메모리 칩 안 ROM을 두 번 누르면 프로그램이 보입니다.',
        '값은 16진수. 칩을 두 번 누르거나 인스펙터의 "칩 내부: 1단계"로 안을 볼 수 있습니다.',
      ].join('\n'),
    },
  ];
  return { circuit, library };
}
