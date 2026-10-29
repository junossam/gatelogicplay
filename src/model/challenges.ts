// 챌린지 모드: 목표 진리표와 자동 채점 (SPEC 13장 6단계)
import { compile, CompileError } from '../sim/compile';
import { GATE_KINDS, INPUT_KINDS } from '../sim/primitives';
import { orderedIO, truthTable, type Cell } from '../sim/truthTable';
import type { Bit, Circuit, Library, Part, PartKind, PrimitiveKind } from '../sim/types';

/** 목표 칸: 값, 이전 유지, 상관없음(금지 상태 허용) */
export type Target = Bit | 'hold' | 'x';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  inputs: string[];
  outputs: string[];
  /** 쓸 수 있는 게이트. 없으면 기본 게이트 전부 */
  allowed?: PrimitiveKind[];
  /** 입력 비트(이름 순서대로) → 출력별 목표 */
  target(bits: Bit[]): Target[];
  /** 모범 답안 게이트 수 */
  par: number;
}

const ALL_GATES: PrimitiveKind[] = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT'];

export const CHALLENGES: Challenge[] = [
  {
    id: 'nand-not',
    title: 'NAND로 NOT',
    description: 'NAND 게이트만으로 입력을 뒤집으세요.',
    inputs: ['A'],
    outputs: ['Y'],
    allowed: ['NAND'],
    target: ([a]) => [(1 - a!) as Bit],
    par: 1,
  },
  {
    id: 'nand-and',
    title: 'NAND로 AND',
    description: 'NAND 게이트만으로 AND를 만드세요.',
    inputs: ['A', 'B'],
    outputs: ['Y'],
    allowed: ['NAND'],
    target: ([a, b]) => [(a! & b!) as Bit],
    par: 2,
  },
  {
    id: 'nand-or',
    title: 'NAND로 OR',
    description: 'NAND 게이트만으로 OR를 만드세요.',
    inputs: ['A', 'B'],
    outputs: ['Y'],
    allowed: ['NAND'],
    target: ([a, b]) => [(a! | b!) as Bit],
    par: 3,
  },
  {
    id: 'nand-xor',
    title: 'NAND로 XOR',
    description: 'NAND 게이트만으로 XOR를 만드세요. 4개로 만들 수 있습니다.',
    inputs: ['A', 'B'],
    outputs: ['Y'],
    allowed: ['NAND'],
    target: ([a, b]) => [(a! ^ b!) as Bit],
    par: 4,
  },
  {
    id: 'half-adder',
    title: '반가산기',
    description: '두 비트를 더해 합 S와 올림 C를 내세요.',
    inputs: ['A', 'B'],
    outputs: ['S', 'C'],
    target: ([a, b]) => [(a! ^ b!) as Bit, (a! & b!) as Bit],
    par: 2,
  },
  {
    id: 'full-adder',
    title: '전가산기',
    description: '세 비트(A, B, 들어오는 올림 Cin)를 더해 S와 Cout을 내세요.',
    inputs: ['A', 'B', 'Cin'],
    outputs: ['S', 'Cout'],
    target: ([a, b, c]) => {
      const sum = a! + b! + c!;
      return [(sum & 1) as Bit, (sum >> 1) as Bit];
    },
    par: 5,
  },
  {
    id: 'mux2',
    title: '2:1 선택기',
    description: 'SEL이 0이면 A, 1이면 B를 Y로 내보내세요.',
    inputs: ['A', 'B', 'SEL'],
    outputs: ['Y'],
    target: ([a, b, sel]) => [(sel ? b! : a!) as Bit],
    par: 4,
  },
  {
    id: 'majority',
    title: '다수결',
    description: '세 입력 중 1이 두 개 이상이면 Y = 1.',
    inputs: ['A', 'B', 'C'],
    outputs: ['Y'],
    target: ([a, b, c]) => [(a! + b! + c! >= 2 ? 1 : 0) as Bit],
    par: 4,
  },
  {
    id: 'nor-sr',
    title: 'NOR로 SR 래치',
    description: 'S를 누르면 Q = 1, R을 누르면 Q = 0, 둘 다 떼면 그대로. R과 S를 함께 누르는 경우는 상관없습니다.',
    inputs: ['R', 'S'],
    outputs: ['Q', 'Q̄'],
    allowed: ['NOR'],
    target: ([r, s]) => (r && s ? ['x', 'x'] : r ? [0, 1] : s ? [1, 0] : ['hold', 'hold']),
    par: 2,
  },
  {
    id: 'nand-dlatch',
    title: 'NAND로 D 래치',
    description: 'CLK가 1이면 Q가 D를 따르고, 0이면 그대로 유지합니다. NAND 4개로 만들 수 있습니다.',
    inputs: ['D', 'CLK'],
    outputs: ['Q'],
    allowed: ['NAND'],
    target: ([d, clk]) => (clk ? [d!] : ['hold']),
    par: 4,
  },
];

export function challengeById(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

export function allowedGates(ch: Challenge): PrimitiveKind[] {
  return ch.allowed ?? ALL_GATES;
}

function chipPrimitives(chipId: string, lib: Library, seen = new Set<string>()): Set<PrimitiveKind> {
  const out = new Set<PrimitiveKind>();
  if (seen.has(chipId)) return out;
  seen.add(chipId);
  for (const p of lib[chipId]?.circuit.parts ?? []) {
    if (p.kind.type === 'primitive') out.add(p.kind.kind);
    else for (const k of chipPrimitives(p.kind.chipId, lib, seen)) out.add(k);
  }
  return out;
}

/** 이 챌린지에서 쓸 수 있는 부품인가. 칩은 펼친 내부 게이트가 모두 허용될 때만. 클럭은 안 됨. */
export function isAllowedIn(ch: Challenge, kind: PartKind, lib: Library): boolean {
  const gates = new Set(allowedGates(ch));
  const ok = (k: PrimitiveKind) => INPUT_KINDS.has(k) || k === 'LED' || k === 'SEG8' || k === 'SPLIT' || k === 'MERGE' || gates.has(k);
  if (kind.type === 'primitive') return ok(kind.kind);
  return [...chipPrimitives(kind.chipId, lib)].every(ok);
}

/** 이름 붙은 입력 스위치와 출력 LED만 놓인 시작 회로 */
export function starterCircuit(ch: Challenge): Circuit {
  const parts: Part[] = [
    ...ch.inputs.map((name, i) => ({ id: `in${i + 1}`, kind: { type: 'primitive' as const, kind: 'SWITCH' as const }, x: 0, y: 2 + i * 4, label: name })),
    ...ch.outputs.map((name, i) => ({ id: `out${i + 1}`, kind: { type: 'primitive' as const, kind: 'LED' as const }, x: 30, y: 2 + i * 4, label: name })),
  ];
  return { parts, wires: [] };
}

export interface GradeRow {
  inputs: Bit[];
  expected: Target[];
  actual: Cell[];
  ok: boolean;
}

export type Grade =
  | { status: 'pass' | 'fail'; rows: GradeRow[]; gates: number; wrong: number }
  | { status: 'invalid'; message: string };

function cellMatches(target: Target, actual: Cell): boolean {
  if (target === 'x') return true;
  return target === actual;
}

/** 회로를 목표 진리표와 비교한다 */
export function grade(ch: Challenge, circuit: Circuit, lib: Library = {}): Grade {
  const io = orderedIO(circuit);
  const byLabel = (parts: Part[]) => new Map(parts.map((p) => [p.label ?? '', p.id]));
  const ins = byLabel(io.inputs);
  const outs = byLabel(io.outputs);
  const missingIn = ch.inputs.filter((n) => !ins.has(n));
  const missingOut = ch.outputs.filter((n) => !outs.has(n));
  if (missingIn.length || missingOut.length) {
    return { status: 'invalid', message: `이름이 맞는 ${missingIn.length ? '입력' : '출력'}이 없습니다: ${[...missingIn, ...missingOut].join(', ')}` };
  }
  const extra = io.inputs.filter((p) => !ch.inputs.includes(p.label ?? ''));
  if (extra.length) return { status: 'invalid', message: `챌린지에 없는 입력이 있습니다: ${extra.map((p) => p.label ?? p.id).join(', ')}` };
  const banned = circuit.parts.filter((p) => !isAllowedIn(ch, p.kind, lib));
  if (banned.length) return { status: 'invalid', message: `이 챌린지에서 쓸 수 없는 부품이 있습니다: ${banned.map((p) => p.id).join(', ')}` };

  let table;
  let gates = 0;
  try {
    gates = compile(circuit, lib).nodes.filter((n) => GATE_KINDS.has(n.kind)).length;
    table = truthTable(circuit, lib, { inputs: ch.inputs.map((n) => ins.get(n)!), outputs: ch.outputs.map((n) => outs.get(n)!) });
  } catch (e) {
    if (e instanceof CompileError) return { status: 'invalid', message: e.message };
    throw e;
  }
  const rows = table.rows.map((r): GradeRow => {
    const expected = ch.target(r.inputs);
    const actual: Cell[] = r.forbidden ? ch.outputs.map(() => 'forbidden') : r.outputs;
    return { inputs: r.inputs, expected, actual, ok: expected.every((t, k) => cellMatches(t, actual[k]!)) };
  });
  const wrong = rows.filter((r) => !r.ok).length;
  return { status: wrong ? 'fail' : 'pass', rows, gates, wrong };
}
