// 수업용 예제 회로 (samples/의 선택·연산·기억 소자·표시·기타 예제).
// 블록(MUX, 비교기, D 플립플롭 …)을 칩으로 조립한 뒤 펼쳐서 기본 게이트만 남기고, 블록마다 점선 그룹을 붙인다.
// 예제 파일은 이 코드로 만들고, tests/unit/teaching.test.ts가 저장된 파일을 엔진으로 검증한다.
import { expandCircuit } from '../../src/ui/Canvas/expand';
import { baseSize } from '../../src/ui/Canvas/geometry';
import type { ChipDef, Circuit, Library, Note, PrimitiveKind } from '../../src/sim/types';
import { chipDef, CircuitBuilder, HEX_SEGMENTS } from './circuits';

const PIN = 'abcdefgh';

/** 게이트 하나: 입력 신호들을 a, b, c… 에 잇는다 */
function gate(b: CircuitBuilder, kind: PrimitiveKind, id: string, srcs: string[], bits = 1): void {
  b.add(kind, id);
  if (bits > 1) b.bits(bits);
  if (kind !== 'NOT' && srcs.length !== 2) b.inputs(srcs.length);
  srcs.forEach((s, k) => b.wire(s, `${id}.${PIN[k]}`));
}

const sw = (b: CircuitBuilder, id: string, label: string, bits = 1) => {
  b.add('SWITCH', id, 0, 0, label);
  if (bits > 1) b.bits(bits);
};
const led = (b: CircuitBuilder, id: string, label: string, src: string, bits = 1) => {
  b.add('LED', id, 0, 0, label);
  if (bits > 1) b.bits(bits);
  b.wire(src, `${id}.a`);
};
const split = (b: CircuitBuilder, id: string, src: string, bits: number) => {
  b.add('SPLIT', id).bits(bits);
  b.wire(src, `${id}.a`);
};
const merge = (b: CircuitBuilder, id: string, srcs: string[]) => {
  b.add('MERGE', id).bits(srcs.length);
  srcs.forEach((s, k) => b.wire(s, `${id}.a${k}`));
};
const use = (b: CircuitBuilder, chipId: string, id: string, pins: Record<string, string>) => {
  b.chip(chipId, id);
  for (const [pin, src] of Object.entries(pins)) b.wire(src, `${id}.${pin}`);
};

/**
 * 논리 단계별로 열을 나눠 배치한다: 입력(전선을 받지 않는 부품) → 단계마다 오른쪽으로 → 출력 LED는 맨 오른쪽.
 * 같은 열 안에서는 앞 단계 신호의 평균 높이 순으로 쌓아 전선이 덜 엇갈리게 한다.
 */
export function autoLayout(c: Circuit, library: Library = {}, top = 0): Circuit {
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const drivers = new Map<string, string[]>(c.parts.map((p) => [p.id, []]));
  for (const w of c.wires) drivers.get(w.to.partId)?.push(w.from.partId);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const dfs = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // 피드백(플립플롭 둘레)은 끊어서 센다
    visiting.add(id);
    const ds = drivers.get(id)!;
    const d = ds.length ? 1 + Math.max(...ds.map(dfs)) : 0;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  c.parts.forEach((p) => dfs(p.id));
  const isOut = (id: string) => {
    const p = byId.get(id)!;
    return p.kind.type === 'primitive' && (p.kind.kind === 'LED' || p.kind.kind === 'SEG8');
  };
  const maxD = Math.max(0, ...c.parts.filter((p) => !isOut(p.id)).map((p) => depth.get(p.id)!));
  for (const p of c.parts) if (isOut(p.id)) depth.set(p.id, maxD + 1);
  const cols: string[][] = [];
  for (const p of c.parts) (cols[depth.get(p.id)!] ??= []).push(p.id);
  const centerY = new Map<string, number>();
  let x = 0;
  for (const col of cols) {
    if (!col) continue;
    const target = (id: string) => {
      const ys = drivers.get(id)!.map((d) => centerY.get(d)).filter((v): v is number => v !== undefined);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    };
    // 입력 열은 넣은 순서대로, 나머지는 앞 신호 높이 순
    if (col !== cols[0]) col.sort((a, b) => target(a) - target(b));
    let y = top;
    let width = 0;
    for (const id of col) {
      const p = byId.get(id)!;
      const s = baseSize(p, library);
      const want = col === cols[0] ? y : Math.round(target(id) - s.h / 2);
      p.x = x;
      p.y = Math.max(y, want);
      centerY.set(id, p.y + s.h / 2);
      y = p.y + s.h + 2;
      width = Math.max(width, s.w);
    }
    x += width + 5;
  }
  return c;
}

function makeChip(id: string, name: string, build: (b: CircuitBuilder) => void, ins: [string, string][], outs: [string, string][], library: Library = {}): ChipDef {
  const b = new CircuitBuilder();
  build(b);
  const def = chipDef(id, name, autoLayout(b.build(), library), ins, outs);
  def.color = 'chip-2';
  return def;
}

// ---------------------------------------------------------------- 블록 (칩으로 조립했다가 펼친다)

const nandNot = makeChip('t-nand-not', 'NOT (NAND)', (b) => {
  sw(b, 'a', 'A');
  gate(b, 'NAND', 'n1', ['a.y', 'a.y']);
  led(b, 'y', 'Y', 'n1.y');
}, [['A', 'a']], [['Y', 'y']]);

const nandAnd = makeChip('t-nand-and', 'AND (NAND)', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  gate(b, 'NAND', 'n1', ['a.y', 'b.y']);
  gate(b, 'NAND', 'n2', ['n1.y', 'n1.y']);
  led(b, 'y', 'Y', 'n2.y');
}, [['A', 'a'], ['B', 'b']], [['Y', 'y']]);

const nandOr = makeChip('t-nand-or', 'OR (NAND)', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  gate(b, 'NAND', 'na', ['a.y', 'a.y']);
  gate(b, 'NAND', 'nb', ['b.y', 'b.y']);
  gate(b, 'NAND', 'n3', ['na.y', 'nb.y']);
  led(b, 'y', 'Y', 'n3.y');
}, [['A', 'a'], ['B', 'b']], [['Y', 'y']]);

const nandXor = makeChip('t-nand-xor', 'XOR (NAND)', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  gate(b, 'NAND', 'n1', ['a.y', 'b.y']);
  gate(b, 'NAND', 'n2', ['a.y', 'n1.y']);
  gate(b, 'NAND', 'n3', ['b.y', 'n1.y']);
  gate(b, 'NAND', 'n4', ['n2.y', 'n3.y']);
  led(b, 'y', 'Y', 'n4.y');
}, [['A', 'a'], ['B', 'b']], [['Y', 'y']]);

const mux2 = makeChip('t-mux2', '2:1 MUX', (b) => {
  sw(b, 'd0', 'D0');
  sw(b, 'd1', 'D1');
  sw(b, 's', 'S');
  gate(b, 'NOT', 'ns', ['s.y']);
  gate(b, 'AND', 'a0', ['d0.y', 'ns.y']);
  gate(b, 'AND', 'a1', ['d1.y', 's.y']);
  gate(b, 'OR', 'o', ['a0.y', 'a1.y']);
  led(b, 'y', 'Y', 'o.y');
}, [['D0', 'd0'], ['D1', 'd1'], ['S', 's']], [['Y', 'y']]);

const mux4 = makeChip('t-mux4', '4:1 MUX', (b) => {
  for (let i = 0; i < 4; i++) sw(b, `d${i}`, `D${i}`);
  sw(b, 's0', 'S0');
  sw(b, 's1', 'S1');
  use(b, mux2.id, 'm01', { D0: 'd0.y', D1: 'd1.y', S: 's0.y' });
  use(b, mux2.id, 'm23', { D0: 'd2.y', D1: 'd3.y', S: 's0.y' });
  use(b, mux2.id, 'mf', { D0: 'm01.Y', D1: 'm23.Y', S: 's1.y' });
  led(b, 'y', 'Y', 'mf.Y');
}, [['D0', 'd0'], ['D1', 'd1'], ['D2', 'd2'], ['D3', 'd3'], ['S0', 's0'], ['S1', 's1']], [['Y', 'y']], { [mux2.id]: mux2 });

const demux4 = makeChip('t-demux4', '1:4 DEMUX', (b) => {
  sw(b, 'd', 'D');
  sw(b, 's0', 'S0');
  sw(b, 's1', 'S1');
  gate(b, 'NOT', 'n0', ['s0.y']);
  gate(b, 'NOT', 'n1', ['s1.y']);
  const sel = [['n1.y', 'n0.y'], ['n1.y', 's0.y'], ['s1.y', 'n0.y'], ['s1.y', 's0.y']];
  sel.forEach(([hi, lo], i) => {
    gate(b, 'AND', `g${i}`, ['d.y', hi!, lo!]);
    led(b, `y${i}`, `Y${i}`, `g${i}.y`);
  });
}, [['D', 'd'], ['S0', 's0'], ['S1', 's1']], [0, 1, 2, 3].map((i) => [`Y${i}`, `y${i}`] as [string, string]));

const dec24 = makeChip('t-dec24', '2→4 디코더', (b) => {
  sw(b, 'a0', 'A0');
  sw(b, 'a1', 'A1');
  sw(b, 'en', 'EN');
  gate(b, 'NOT', 'n0', ['a0.y']);
  gate(b, 'NOT', 'n1', ['a1.y']);
  const sel = [['n1.y', 'n0.y'], ['n1.y', 'a0.y'], ['a1.y', 'n0.y'], ['a1.y', 'a0.y']];
  sel.forEach(([hi, lo], i) => {
    gate(b, 'AND', `g${i}`, ['en.y', hi!, lo!]);
    led(b, `y${i}`, `Y${i}`, `g${i}.y`);
  });
}, [['A0', 'a0'], ['A1', 'a1'], ['EN', 'en']], [0, 1, 2, 3].map((i) => [`Y${i}`, `y${i}`] as [string, string]));

const dec38 = makeChip('t-dec38', '3→8 디코더', (b) => {
  sw(b, 'a0', 'A0');
  sw(b, 'a1', 'A1');
  sw(b, 'a2', 'A2');
  gate(b, 'NOT', 'na2', ['a2.y']);
  use(b, dec24.id, 'lo', { A0: 'a0.y', A1: 'a1.y', EN: 'na2.y' });
  use(b, dec24.id, 'hi', { A0: 'a0.y', A1: 'a1.y', EN: 'a2.y' });
  for (let i = 0; i < 8; i++) led(b, `y${i}`, `Y${i}`, `${i < 4 ? 'lo' : 'hi'}.Y${i % 4}`);
}, [['A0', 'a0'], ['A1', 'a1'], ['A2', 'a2']], [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`Y${i}`, `y${i}`] as [string, string]), { [dec24.id]: dec24 });

const prio4 = makeChip('t-prio4', '4→2 우선순위 인코더', (b) => {
  for (let i = 0; i < 4; i++) sw(b, `i${i}`, `I${i}`);
  gate(b, 'NOT', 'ni2', ['i2.y']);
  gate(b, 'AND', 't', ['ni2.y', 'i1.y']);
  gate(b, 'OR', 'o1', ['i3.y', 'i2.y']);
  gate(b, 'OR', 'o0', ['i3.y', 't.y']);
  gate(b, 'OR', 'ov', ['i0.y', 'i1.y', 'i2.y', 'i3.y']);
  led(b, 'y1', 'Y1', 'o1.y');
  led(b, 'y0', 'Y0', 'o0.y');
  led(b, 'v', 'V', 'ov.y');
}, [['I0', 'i0'], ['I1', 'i1'], ['I2', 'i2'], ['I3', 'i3']], [['Y1', 'y1'], ['Y0', 'y0'], ['V', 'v']]);

const cmp1 = makeChip('t-cmp1', '1비트 비교기', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  gate(b, 'NOT', 'na', ['a.y']);
  gate(b, 'NOT', 'nb', ['b.y']);
  gate(b, 'AND', 'gt', ['a.y', 'nb.y']);
  gate(b, 'XNOR', 'eq', ['a.y', 'b.y']);
  gate(b, 'AND', 'lt', ['na.y', 'b.y']);
  led(b, 'ogt', 'A>B', 'gt.y');
  led(b, 'oeq', 'A=B', 'eq.y');
  led(b, 'olt', 'A<B', 'lt.y');
}, [['A', 'a'], ['B', 'b']], [['A>B', 'ogt'], ['A=B', 'oeq'], ['A<B', 'olt']]);

const cmp4 = makeChip('t-cmp4', '4비트 비교기', (b) => {
  sw(b, 'a', 'A', 4);
  sw(b, 'b', 'B', 4);
  split(b, 'sa', 'a.y', 4);
  split(b, 'sb', 'b.y', 4);
  for (let i = 0; i < 4; i++) use(b, cmp1.id, `c${i}`, { A: `sa.y${i}`, B: `sb.y${i}` });
  const e = (i: number) => `c${i}.A=B`;
  gate(b, 'AND', 'eq', [e(3), e(2), e(1), e(0)]);
  for (const [k, pin] of [['gt', 'A>B'], ['lt', 'A<B']] as const) {
    gate(b, 'AND', `${k}2`, [e(3), `c2.${pin}`]);
    gate(b, 'AND', `${k}1`, [e(3), e(2), `c1.${pin}`]);
    gate(b, 'AND', `${k}0`, [e(3), e(2), e(1), `c0.${pin}`]);
    gate(b, 'OR', k, [`c3.${pin}`, `${k}2.y`, `${k}1.y`, `${k}0.y`]);
  }
  led(b, 'ogt', 'A>B', 'gt.y');
  led(b, 'oeq', 'A=B', 'eq.y');
  led(b, 'olt', 'A<B', 'lt.y');
}, [['A', 'a'], ['B', 'b']], [['A>B', 'ogt'], ['A=B', 'oeq'], ['A<B', 'olt']], { [cmp1.id]: cmp1 });

const halfSub = makeChip('t-hsub', '반감산기', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  gate(b, 'XOR', 'x', ['a.y', 'b.y']);
  gate(b, 'NOT', 'na', ['a.y']);
  gate(b, 'AND', 'bo', ['na.y', 'b.y']);
  led(b, 'd', 'D', 'x.y');
  led(b, 'obo', 'Bo', 'bo.y');
}, [['A', 'a'], ['B', 'b']], [['D', 'd'], ['Bo', 'obo']]);

const fullSub = makeChip('t-fsub', '전감산기', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  sw(b, 'bi', 'Bi');
  use(b, halfSub.id, 'h1', { A: 'a.y', B: 'b.y' });
  use(b, halfSub.id, 'h2', { A: 'h1.D', B: 'bi.y' });
  gate(b, 'OR', 'o', ['h1.Bo', 'h2.Bo']);
  led(b, 'd', 'D', 'h2.D');
  led(b, 'bo', 'Bo', 'o.y');
}, [['A', 'a'], ['B', 'b'], ['Bi', 'bi']], [['D', 'd'], ['Bo', 'bo']], { [halfSub.id]: halfSub });

const halfAdd = makeChip('t-hadd', '반가산기', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  gate(b, 'XOR', 'x', ['a.y', 'b.y']);
  gate(b, 'AND', 'c', ['a.y', 'b.y']);
  led(b, 's', 'S', 'x.y');
  led(b, 'oc', 'C', 'c.y');
}, [['A', 'a'], ['B', 'b']], [['S', 's'], ['C', 'oc']]);

const fullAdd = makeChip('t-fadd', '전가산기', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  sw(b, 'cin', 'Cin');
  use(b, halfAdd.id, 'h1', { A: 'a.y', B: 'b.y' });
  use(b, halfAdd.id, 'h2', { A: 'h1.S', B: 'cin.y' });
  gate(b, 'OR', 'o', ['h1.C', 'h2.C']);
  led(b, 's', 'S', 'h2.S');
  led(b, 'cout', 'Cout', 'o.y');
}, [['A', 'a'], ['B', 'b'], ['Cin', 'cin']], [['S', 's'], ['Cout', 'cout']], { [halfAdd.id]: halfAdd });

const addSub4 = makeChip('t-addsub4', '4비트 가감산기', (b) => {
  sw(b, 'a', 'A', 4);
  sw(b, 'b', 'B', 4);
  sw(b, 'sub', 'SUB');
  split(b, 'sa', 'a.y', 4);
  split(b, 'sb', 'b.y', 4);
  for (let i = 0; i < 4; i++) {
    // 뺄셈이면 B를 뒤집고 처음 자리올림을 1로: A + ~B + 1 = A - B
    gate(b, 'XOR', `x${i}`, [`sb.y${i}`, 'sub.y']);
    use(b, fullAdd.id, `fa${i}`, { A: `sa.y${i}`, B: `x${i}.y`, Cin: i ? `fa${i - 1}.Cout` : 'sub.y' });
  }
  merge(b, 'ms', [0, 1, 2, 3].map((i) => `fa${i}.S`));
  led(b, 's', 'S', 'ms.y', 4);
  led(b, 'c', 'C', 'fa3.Cout');
}, [['A', 'a'], ['B', 'b'], ['SUB', 'sub']], [['S', 's'], ['C', 'c']], { [fullAdd.id]: fullAdd, [halfAdd.id]: halfAdd });

const alu4 = makeChip('t-alu4', '4비트 ALU', (b) => {
  sw(b, 'a', 'A', 4);
  sw(b, 'b', 'B', 4);
  sw(b, 'op', 'OP', 2);
  split(b, 'sop', 'op.y', 2);
  gate(b, 'AND', 'and4', ['a.y', 'b.y'], 4);
  gate(b, 'OR', 'or4', ['a.y', 'b.y'], 4);
  use(b, addSub4.id, 'as', { A: 'a.y', B: 'b.y', SUB: 'sop.y0' });
  gate(b, 'NOT', 'nop0', ['sop.y0']);
  gate(b, 'NOT', 'nop1', ['sop.y1']);
  gate(b, 'AND', 'd0', ['nop1.y', 'nop0.y']);
  gate(b, 'AND', 'd1', ['nop1.y', 'sop.y0']);
  // 1비트 선택 신호를 4비트로 넓혀 결과와 AND
  merge(b, 'm0', ['d0.y', 'd0.y', 'd0.y', 'd0.y']);
  merge(b, 'm1', ['d1.y', 'd1.y', 'd1.y', 'd1.y']);
  merge(b, 'm2', ['sop.y1', 'sop.y1', 'sop.y1', 'sop.y1']);
  gate(b, 'AND', 't0', ['and4.y', 'm0.y'], 4);
  gate(b, 'AND', 't1', ['or4.y', 'm1.y'], 4);
  gate(b, 'AND', 't2', ['as.S', 'm2.y'], 4);
  gate(b, 'OR', 'res', ['t0.y', 't1.y', 't2.y'], 4);
  gate(b, 'AND', 'cy', ['as.C', 'sop.y1']);
  led(b, 'y', 'Y', 'res.y', 4);
  led(b, 'c', 'C', 'cy.y');
}, [['A', 'a'], ['B', 'b'], ['OP', 'op']], [['Y', 'y'], ['C', 'c']], { [addSub4.id]: addSub4, [fullAdd.id]: fullAdd, [halfAdd.id]: halfAdd });

const parityGen = makeChip('t-pgen', '짝수 패리티 생성', (b) => {
  for (let i = 0; i < 4; i++) sw(b, `d${i}`, `D${i}`);
  gate(b, 'XOR', 'x1', ['d0.y', 'd1.y']);
  gate(b, 'XOR', 'x2', ['d2.y', 'd3.y']);
  gate(b, 'XOR', 'x3', ['x1.y', 'x2.y']);
  led(b, 'p', 'P', 'x3.y');
}, [0, 1, 2, 3].map((i) => [`D${i}`, `d${i}`] as [string, string]), [['P', 'p']]);

const parityChk = makeChip('t-pchk', '패리티 검사', (b) => {
  for (let i = 0; i < 4; i++) sw(b, `d${i}`, `D${i}`);
  sw(b, 'p', 'P');
  gate(b, 'XOR', 'x1', ['d0.y', 'd1.y']);
  gate(b, 'XOR', 'x2', ['d2.y', 'd3.y']);
  gate(b, 'XOR', 'x3', ['x1.y', 'x2.y']);
  gate(b, 'XOR', 'x4', ['x3.y', 'p.y']);
  led(b, 'err', 'ERR', 'x4.y');
}, [...[0, 1, 2, 3].map((i) => [`D${i}`, `d${i}`] as [string, string]), ['P', 'p']], [['ERR', 'err']]);

const bin2gray = makeChip('t-b2g', '2진 → 그레이', (b) => {
  for (let i = 0; i < 4; i++) sw(b, `b${i}`, `B${i}`);
  gate(b, 'XOR', 'x2', ['b3.y', 'b2.y']);
  gate(b, 'XOR', 'x1', ['b2.y', 'b1.y']);
  gate(b, 'XOR', 'x0', ['b1.y', 'b0.y']);
  led(b, 'g0', 'G0', 'x0.y');
  led(b, 'g1', 'G1', 'x1.y');
  led(b, 'g2', 'G2', 'x2.y');
  led(b, 'g3', 'G3', 'b3.y');
}, [0, 1, 2, 3].map((i) => [`B${i}`, `b${i}`] as [string, string]), [0, 1, 2, 3].map((i) => [`G${i}`, `g${i}`] as [string, string]));

const gray2bin = makeChip('t-g2b', '그레이 → 2진', (b) => {
  for (let i = 0; i < 4; i++) sw(b, `g${i}`, `G${i}`);
  gate(b, 'XOR', 'x2', ['g3.y', 'g2.y']);
  gate(b, 'XOR', 'x1', ['x2.y', 'g1.y']);
  gate(b, 'XOR', 'x0', ['x1.y', 'g0.y']);
  led(b, 'b0', 'B0', 'x0.y');
  led(b, 'b1', 'B1', 'x1.y');
  led(b, 'b2', 'B2', 'x2.y');
  led(b, 'b3', 'B3', 'g3.y');
}, [0, 1, 2, 3].map((i) => [`G${i}`, `g${i}`] as [string, string]), [0, 1, 2, 3].map((i) => [`B${i}`, `b${i}`] as [string, string]));

/** BCD(0~9) → 8세그먼트: 10~15는 빈칸. 세그먼트마다 켜지는 숫자가 8개 이하면 OR, 아니면 꺼지는 숫자를 NOR */
const bcd7 = makeChip('t-bcd7', 'BCD → 8세그먼트', (b) => {
  sw(b, 'n', 'N', 4);
  split(b, 'sn', 'n.y', 4);
  for (let k = 0; k < 4; k++) gate(b, 'NOT', `inv${k}`, [`sn.y${k}`]);
  const plan = [...'abcdefg'].map((s) => {
    const on = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => HEX_SEGMENTS[n]!.includes(s));
    const off = Array.from({ length: 16 }, (_, n) => n).filter((n) => !on.includes(n));
    return on.length <= 8 ? { s, kind: 'OR' as const, ms: on } : { s, kind: 'NOR' as const, ms: off };
  });
  const used = [...new Set(plan.flatMap((p) => p.ms))].sort((x, y) => x - y);
  for (const m of used) gate(b, 'AND', `m${m}`, [0, 1, 2, 3].map((k) => ((m >> k) & 1 ? `sn.y${k}` : `inv${k}.y`)));
  for (const p of plan) {
    gate(b, p.kind, `seg_${p.s}`, p.ms.map((m) => `m${m}.y`));
    led(b, `out_${p.s}`, p.s, `seg_${p.s}.y`);
  }
}, [['N', 'n']], [...'abcdefg'].map((s) => [s, `out_${s}`] as [string, string]));

// 순차 회로: 플립플롭 예제의 D 플립플롭(ff-d, 상승 에지)을 쓴다
function seqChips(ff: Library) {
  const lib = (...defs: ChipDef[]): Library => ({ ...ff, ...Object.fromEntries(defs.map((d) => [d.id, d])) });

  const reg4 = makeChip('t-reg4', '4비트 레지스터', (b) => {
    sw(b, 'd', 'D', 4);
    sw(b, 'clk', 'CLK');
    split(b, 'sd', 'd.y', 4);
    for (let i = 0; i < 4; i++) use(b, 'ff-d', `f${i}`, { D: `sd.y${i}`, CLK: 'clk.y' });
    merge(b, 'mq', [0, 1, 2, 3].map((i) => `f${i}.Q`));
    led(b, 'q', 'Q', 'mq.y', 4);
  }, [['D', 'd'], ['CLK', 'clk']], [['Q', 'q']], ff);

  const shift4 = makeChip('t-shift4', '4비트 시프트 레지스터', (b) => {
    sw(b, 'in', 'IN');
    sw(b, 'clk', 'CLK');
    for (let i = 0; i < 4; i++) use(b, 'ff-d', `f${i}`, { D: i ? `f${i - 1}.Q` : 'in.y', CLK: 'clk.y' });
    for (let i = 0; i < 4; i++) led(b, `q${i}`, `Q${i}`, `f${i}.Q`);
  }, [['IN', 'in'], ['CLK', 'clk']], [0, 1, 2, 3].map((i) => [`Q${i}`, `q${i}`] as [string, string]), ff);

  /**
   * 비동기(리플) 카운터: 다음 자리는 앞 자리 Q̄의 상승(= Q의 하강)에 바뀐다.
   * CLR 동안은 모든 자리에 뒤집은 CLK를 넣어 0으로 만든다. CLR을 끌 때 두 경로가 같은 지연으로 바뀌어야
   * (nclr, NOT(nclr)) 클럭 선에 순간 펄스가 생기지 않는다.
   */
  const ripple4 = makeChip('t-ripple4', '4비트 비동기 카운터', (b) => {
    sw(b, 'clk', 'CLK');
    sw(b, 'clr', 'CLR');
    gate(b, 'NOT', 'nclr', ['clr.y']);
    gate(b, 'NOT', 'nnclr', ['nclr.y']);
    gate(b, 'NOT', 'nclk', ['clk.y']);
    gate(b, 'AND', 'clrclk', ['nnclr.y', 'nclk.y']);
    for (let i = 0; i < 4; i++) {
      gate(b, 'AND', `d${i}`, [`f${i}.Q̄`, 'nclr.y']);
      if (i) {
        gate(b, 'AND', `r${i}`, ['nclr.y', `f${i - 1}.Q̄`]);
        gate(b, 'OR', `c${i}`, [`r${i}.y`, 'clrclk.y']);
      }
      use(b, 'ff-d', `f${i}`, { D: `d${i}.y`, CLK: i ? `c${i}.y` : 'clk.y' });
    }
    merge(b, 'mq', [0, 1, 2, 3].map((i) => `f${i}.Q`));
    led(b, 'q', 'Q', 'mq.y', 4);
  }, [['CLK', 'clk'], ['CLR', 'clr']], [['Q', 'q']], ff);

  /** 동기 카운터: 모든 자리가 같은 CLK. 아래 자리가 모두 1이면 뒤집는다 (D = Q ⊕ T) */
  const sync4 = makeChip('t-sync4', '4비트 동기 카운터', (b) => {
    sw(b, 'clk', 'CLK');
    sw(b, 'clr', 'CLR');
    gate(b, 'NOT', 'nclr', ['clr.y']);
    gate(b, 'AND', 't2', ['f0.Q', 'f1.Q']);
    gate(b, 'AND', 't3', ['f0.Q', 'f1.Q', 'f2.Q']);
    gate(b, 'AND', 'd0', ['f0.Q̄', 'nclr.y']);
    const t = ['', 'f0.Q', 't2.y', 't3.y'];
    for (let i = 1; i < 4; i++) {
      gate(b, 'XOR', `x${i}`, [`f${i}.Q`, t[i]!]);
      gate(b, 'AND', `d${i}`, [`x${i}.y`, 'nclr.y']);
    }
    for (let i = 0; i < 4; i++) use(b, 'ff-d', `f${i}`, { D: `d${i}.y`, CLK: 'clk.y' });
    gate(b, 'AND', 'co', ['f0.Q', 'f1.Q', 'f2.Q', 'f3.Q']);
    merge(b, 'mq', [0, 1, 2, 3].map((i) => `f${i}.Q`));
    led(b, 'q', 'Q', 'mq.y', 4);
    led(b, 'oco', 'CO', 'co.y');
  }, [['CLK', 'clk'], ['CLR', 'clr']], [['Q', 'q'], ['CO', 'oco']], ff);

  /** BCD 카운터 0~9: EN일 때만 세고, 9 다음은 0 (CO로 다음 자리에 알림) */
  const bcd = makeChip('t-bcd', 'BCD 카운터 (0~9)', (b) => {
    sw(b, 'clk', 'CLK');
    sw(b, 'clr', 'CLR');
    sw(b, 'en', 'EN');
    gate(b, 'NOT', 'nclr', ['clr.y']);
    gate(b, 'AND', 't1', ['en.y', 'f0.Q']);
    gate(b, 'AND', 't2', ['en.y', 'f0.Q', 'f1.Q']);
    gate(b, 'AND', 't3', ['en.y', 'f0.Q', 'f1.Q', 'f2.Q']);
    gate(b, 'AND', 'wrap', ['en.y', 'f0.Q', 'f3.Q']);
    gate(b, 'NOT', 'nwrap', ['wrap.y']);
    const t = ['en.y', 't1.y', 't2.y', 't3.y'];
    for (let i = 0; i < 4; i++) {
      gate(b, 'XOR', `x${i}`, [`f${i}.Q`, t[i]!]);
      gate(b, 'AND', `d${i}`, [`x${i}.y`, 'nclr.y', 'nwrap.y']);
      use(b, 'ff-d', `f${i}`, { D: `d${i}.y`, CLK: 'clk.y' });
    }
    merge(b, 'mq', [0, 1, 2, 3].map((i) => `f${i}.Q`));
    led(b, 'q', 'Q', 'mq.y', 4);
    led(b, 'co', 'CO', 'wrap.y');
  }, [['CLK', 'clk'], ['CLR', 'clr'], ['EN', 'en']], [['Q', 'q'], ['CO', 'co']], ff);

  return { reg4, shift4, ripple4, sync4, bcd, lib };
}

// ---------------------------------------------------------------- 예제 (블록을 펼쳐 기본 게이트만)

export interface TeachingSample {
  /** samples/ 기준 경로 */
  file: string;
  title: string;
  description: string;
  circuit: Circuit;
}

/** 블록을 끝까지 펼친다. 부품 id의 `/`는 `_`로, 플립플롭 안쪽(래치) 그룹은 너무 많아 뺀다. */
function flatten(c: Circuit, lib: Library, note: string): Circuit {
  // 메모(왼쪽 위) 아래부터 회로를 놓는다: 메모 한 줄이 대략 격자 한 칸
  autoLayout(c, lib, note.split('\n').length * 2 + 3);
  const out = expandCircuit(c, lib, Infinity);
  const fix = (id: string) => id.replace(/\//g, '_');
  const notes: Note[] = [{ id: 'note1', x: 0, y: 0, text: note }];
  return {
    parts: out.parts.map((p) => ({ ...p, id: fix(p.id) })),
    wires: out.wires.map((w, i) => ({ id: `w${i + 1}`, from: { partId: fix(w.from.partId), pin: w.from.pin }, to: { partId: fix(w.to.partId), pin: w.to.pin } })),
    groups: (out.groups ?? [])
      .filter((g) => !/^(D 래치|SR 래치) /.test(g.name))
      .map((g, i) => ({ id: `g${i + 1}`, name: g.name.replace(/ \([^)]*\)$/, ''), parts: g.parts.map(fix) })),
    notes,
  };
}

export function teachingSamples(flipflops: Library): TeachingSample[] {
  const seq = seqChips(flipflops);
  const L = (...defs: ChipDef[]): Library => Object.fromEntries(defs.map((d) => [d.id, d]));
  const samples: TeachingSample[] = [];
  const add = (file: string, title: string, description: string, note: string, lib: Library, build: (b: CircuitBuilder) => void) => {
    const b = new CircuitBuilder();
    build(b);
    samples.push({ file, title, description, circuit: flatten(b.build(), lib, note) });
  };

  add('기본/NAND로 만든 게이트.json', 'NAND로 만든 게이트', 'NAND만으로 NOT·AND·OR·XOR', 'NAND 하나로 모든 게이트를 만들 수 있습니다.\nA, B를 눌러 네 결과를 비교해 보세요.', L(nandNot, nandAnd, nandOr, nandXor), (b) => {
    sw(b, 'a', 'A');
    sw(b, 'b', 'B');
    use(b, nandNot.id, 'not', { A: 'a.y' });
    use(b, nandAnd.id, 'and', { A: 'a.y', B: 'b.y' });
    use(b, nandOr.id, 'or', { A: 'a.y', B: 'b.y' });
    use(b, nandXor.id, 'xor', { A: 'a.y', B: 'b.y' });
    led(b, 'y_not', 'NOT A', 'not.Y');
    led(b, 'y_and', 'A AND B', 'and.Y');
    led(b, 'y_or', 'A OR B', 'or.Y');
    led(b, 'y_xor', 'A XOR B', 'xor.Y');
  });

  add('선택/멀티플렉서.json', '멀티플렉서·디멀티플렉서', '4:1 MUX(2:1 MUX 3개) · 1:4 DEMUX', 'S1 S0로 고릅니다.\nMUX: D0~D3 중 하나가 Y로 / DEMUX: D가 Y0~Y3 중 하나로', L(mux2, mux4, demux4), (b) => {
    for (let i = 0; i < 4; i++) sw(b, `d${i}`, `D${i}`);
    sw(b, 's0', 'S0');
    sw(b, 's1', 'S1');
    sw(b, 'dd', 'D');
    use(b, mux4.id, 'mux', { D0: 'd0.y', D1: 'd1.y', D2: 'd2.y', D3: 'd3.y', S0: 's0.y', S1: 's1.y' });
    use(b, demux4.id, 'demux', { D: 'dd.y', S0: 's0.y', S1: 's1.y' });
    led(b, 'y', 'Y', 'mux.Y');
    for (let i = 0; i < 4; i++) led(b, `y${i}`, `Y${i}`, `demux.Y${i}`);
  });

  add('선택/디코더·인코더.json', '디코더·인코더', '3→8 디코더(2→4 두 개) · 4→2 우선순위 인코더', '디코더: A2 A1 A0이 가리키는 Y 하나만 켜집니다.\n인코더: 켜진 I 중 가장 큰 번호를 Y1 Y0로 (V = 하나라도 켜짐)', L(dec24, dec38, prio4), (b) => {
    sw(b, 'a0', 'A0');
    sw(b, 'a1', 'A1');
    sw(b, 'a2', 'A2');
    for (let i = 0; i < 4; i++) sw(b, `i${i}`, `I${i}`);
    use(b, dec38.id, 'dec', { A0: 'a0.y', A1: 'a1.y', A2: 'a2.y' });
    use(b, prio4.id, 'enc', { I0: 'i0.y', I1: 'i1.y', I2: 'i2.y', I3: 'i3.y' });
    for (let i = 0; i < 8; i++) led(b, `y${i}`, `Y${i}`, `dec.Y${i}`);
    led(b, 'ey1', 'Y1', 'enc.Y1');
    led(b, 'ey0', 'Y0', 'enc.Y0');
    led(b, 'v', 'V', 'enc.V');
  });

  add('연산/비교기.json', '4비트 비교기', '1비트 비교기 4개로 A>B, A=B, A<B', '4비트 스위치 A, B를 눌러 값을 바꿔 보세요.\n윗자리부터 같으면 아래 자리를 봅니다.', L(cmp1, cmp4), (b) => {
    sw(b, 'a', 'A', 4);
    sw(b, 'b', 'B', 4);
    use(b, cmp4.id, 'cmp', { A: 'a.y', B: 'b.y' });
    led(b, 'gt', 'A>B', 'cmp.A>B');
    led(b, 'eq', 'A=B', 'cmp.A=B');
    led(b, 'lt', 'A<B', 'cmp.A<B');
  });

  add('연산/전감산기.json', '반감산기·전감산기', '반감산기 2개 + OR = 전감산기', 'D = A − B − Bi 의 차, Bo = 빌림', L(halfSub, fullSub), (b) => {
    sw(b, 'a', 'A');
    sw(b, 'b', 'B');
    sw(b, 'bi', 'Bi');
    use(b, fullSub.id, 'fs', { A: 'a.y', B: 'b.y', Bi: 'bi.y' });
    led(b, 'd', 'D', 'fs.D');
    led(b, 'bo', 'Bo', 'fs.Bo');
  });

  add('연산/4비트 ALU.json', '4비트 ALU', 'OP 00 AND · 01 OR · 10 덧셈 · 11 뺄셈', 'OP(2비트): 0 = AND, 1 = OR, 2 = 덧셈, 3 = 뺄셈\n뺄셈은 B를 뒤집고 1을 더합니다 (2의 보수). C: 덧셈 자리올림 / 뺄셈이면 빌림 없음', L(halfAdd, fullAdd, addSub4, alu4), (b) => {
    sw(b, 'a', 'A', 4);
    sw(b, 'b', 'B', 4);
    sw(b, 'op', 'OP', 2);
    use(b, alu4.id, 'alu', { A: 'a.y', B: 'b.y', OP: 'op.y' });
    led(b, 'y', 'Y', 'alu.Y', 4);
    led(b, 'c', 'C', 'alu.C');
  });

  add('기억 소자/레지스터.json', '레지스터', '4비트 레지스터 · 4비트 시프트 레지스터 (D 플립플롭)', '레지스터: D를 정하고 CLK를 누르면 Q에 저장\n시프트: IN을 정하고 S-CLK를 누를 때마다 한 칸씩 이동\n(처음에는 값이 깜빡이니 CLK를 한 번 누르세요)', seq.lib(seq.reg4, seq.shift4), (b) => {
    sw(b, 'd', 'D', 4);
    b.add('PUSH', 'clk', 0, 0, 'CLK');
    sw(b, 'sin', 'IN');
    b.add('PUSH', 'sclk', 0, 0, 'S-CLK');
    use(b, seq.reg4.id, 'reg', { D: 'd.y', CLK: 'clk.y' });
    use(b, seq.shift4.id, 'sh', { IN: 'sin.y', CLK: 'sclk.y' });
    led(b, 'q', 'Q', 'reg.Q', 4);
    for (let i = 0; i < 4; i++) led(b, `q${i}`, `Q${i}`, `sh.Q${i}`);
  });

  add('기억 소자/카운터.json', '카운터 (비동기·동기)', '4비트 비동기(리플) 카운터와 동기 카운터 비교', '먼저 CLR을 켜고 CLK를 한 번 누른 뒤 CLR을 끄세요.\nCLK를 누를 때마다 둘 다 1씩 늘어납니다. 파형으로 바뀌는 시점을 비교해 보세요.', seq.lib(seq.ripple4, seq.sync4), (b) => {
    b.add('PUSH', 'clk', 0, 0, 'CLK');
    sw(b, 'clr', 'CLR');
    use(b, seq.ripple4.id, 'rip', { CLK: 'clk.y', CLR: 'clr.y' });
    use(b, seq.sync4.id, 'syn', { CLK: 'clk.y', CLR: 'clr.y' });
    led(b, 'rq', '비동기 Q', 'rip.Q', 4);
    led(b, 'sq', '동기 Q', 'syn.Q', 4);
    led(b, 'co', 'CO', 'syn.CO');
  });

  add('표시/0~99 카운터.json', '0~99 카운터 (BCD 표시)', 'BCD 카운터 2개 + BCD→8세그먼트 2개', '먼저 CLR을 잠깐 켰다 끄세요.\n클럭마다 1의 자리가 늘고, 9 다음에는 10의 자리가 늘어납니다.', seq.lib(seq.bcd, bcd7), (b) => {
    b.add('CLOCK', 'clk', 0, 0, 'CLK').hz(1);
    sw(b, 'clr', 'CLR');
    b.add('VCC', 'vcc');
    use(b, seq.bcd.id, 'ones', { CLK: 'clk.y', CLR: 'clr.y', EN: 'vcc.y' });
    use(b, seq.bcd.id, 'tens', { CLK: 'clk.y', CLR: 'clr.y', EN: 'ones.CO' });
    use(b, bcd7.id, 'dec10', { N: 'tens.Q' });
    use(b, bcd7.id, 'dec1', { N: 'ones.Q' });
    b.add('SEG8', 'seg10');
    b.add('SEG8', 'seg1');
    for (const s of 'abcdefg') {
      b.wire(`dec10.${s}`, `seg10.${s}`);
      b.wire(`dec1.${s}`, `seg1.${s}`);
    }
  });

  add('기타/부호·검사.json', '패리티·그레이 코드', '짝수 패리티 생성·검사 · 2진↔그레이 변환', '패리티: D0~D3의 1이 홀수면 P = 1. 받은 쪽에서 P까지 XOR해 1이면 오류\n그레이 코드: 이웃한 수끼리 한 비트만 다릅니다', L(parityGen, parityChk, bin2gray, gray2bin), (b) => {
    for (let i = 0; i < 4; i++) sw(b, `d${i}`, `D${i}`);
    sw(b, 'pin', '받은 P');
    for (let i = 0; i < 4; i++) sw(b, `b${i}`, `B${i}`);
    for (let i = 0; i < 4; i++) sw(b, `gi${i}`, `G${i}`);
    const d = Object.fromEntries([0, 1, 2, 3].map((i) => [`D${i}`, `d${i}.y`]));
    use(b, parityGen.id, 'pgen', d);
    use(b, parityChk.id, 'pchk', { ...d, P: 'pin.y' });
    use(b, bin2gray.id, 'b2g', Object.fromEntries([0, 1, 2, 3].map((i) => [`B${i}`, `b${i}.y`])));
    use(b, gray2bin.id, 'g2b', Object.fromEntries([0, 1, 2, 3].map((i) => [`G${i}`, `gi${i}.y`])));
    led(b, 'p', 'P', 'pgen.P');
    led(b, 'err', 'ERR', 'pchk.ERR');
    for (let i = 0; i < 4; i++) led(b, `g${i}`, `→G${i}`, `b2g.G${i}`);
    for (let i = 0; i < 4; i++) led(b, `bo${i}`, `→B${i}`, `g2b.B${i}`);
  });

  return samples;
}
