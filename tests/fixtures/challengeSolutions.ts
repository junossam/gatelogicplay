// 챌린지 모범 답안 (모범 게이트 수로 풀 수 있는지 확인용)
import { starterCircuit, challengeById } from '../../src/model/challenges';
import type { Circuit, PrimitiveKind } from '../../src/sim/types';

/** 시작 회로(in1.., out1..)에 게이트와 전선을 더한다. 전선은 'in1.y' → 'g1.a' 형식 */
function solve(id: string, gates: [string, PrimitiveKind][], wires: [string, string][]): Circuit {
  const base = starterCircuit(challengeById(id)!);
  const parts = [...base.parts, ...gates.map(([gid, kind], i) => ({ id: gid, kind: { type: 'primitive' as const, kind }, x: 8 + (i % 4) * 5, y: 1 + Math.floor(i / 4) * 5 }))];
  return {
    parts,
    wires: wires.map(([f, t], i) => {
      const [fp, fpin] = f.split('.') as [string, string];
      const [tp, tpin] = t.split('.') as [string, string];
      return { id: `w${i + 1}`, from: { partId: fp, pin: fpin }, to: { partId: tp, pin: tpin } };
    }),
  };
}

export const SOLUTIONS: Record<string, Circuit> = {
  'nand-not': solve('nand-not', [['g1', 'NAND']], [['in1.y', 'g1.a'], ['in1.y', 'g1.b'], ['g1.y', 'out1.a']]),
  'nand-and': solve('nand-and', [['g1', 'NAND'], ['g2', 'NAND']], [['in1.y', 'g1.a'], ['in2.y', 'g1.b'], ['g1.y', 'g2.a'], ['g1.y', 'g2.b'], ['g2.y', 'out1.a']]),
  'nand-or': solve(
    'nand-or',
    [['g1', 'NAND'], ['g2', 'NAND'], ['g3', 'NAND']],
    [['in1.y', 'g1.a'], ['in1.y', 'g1.b'], ['in2.y', 'g2.a'], ['in2.y', 'g2.b'], ['g1.y', 'g3.a'], ['g2.y', 'g3.b'], ['g3.y', 'out1.a']],
  ),
  'nand-xor': solve(
    'nand-xor',
    [['g1', 'NAND'], ['g2', 'NAND'], ['g3', 'NAND'], ['g4', 'NAND']],
    [
      ['in1.y', 'g1.a'],
      ['in2.y', 'g1.b'],
      ['in1.y', 'g2.a'],
      ['g1.y', 'g2.b'],
      ['g1.y', 'g3.a'],
      ['in2.y', 'g3.b'],
      ['g2.y', 'g4.a'],
      ['g3.y', 'g4.b'],
      ['g4.y', 'out1.a'],
    ],
  ),
  'half-adder': solve('half-adder', [['x1', 'XOR'], ['a1', 'AND']], [['in1.y', 'x1.a'], ['in2.y', 'x1.b'], ['in1.y', 'a1.a'], ['in2.y', 'a1.b'], ['x1.y', 'out1.a'], ['a1.y', 'out2.a']]),
  'full-adder': solve(
    'full-adder',
    [['x1', 'XOR'], ['x2', 'XOR'], ['a1', 'AND'], ['a2', 'AND'], ['o1', 'OR']],
    [
      ['in1.y', 'x1.a'],
      ['in2.y', 'x1.b'],
      ['x1.y', 'x2.a'],
      ['in3.y', 'x2.b'],
      ['x2.y', 'out1.a'],
      ['in1.y', 'a1.a'],
      ['in2.y', 'a1.b'],
      ['x1.y', 'a2.a'],
      ['in3.y', 'a2.b'],
      ['a1.y', 'o1.a'],
      ['a2.y', 'o1.b'],
      ['o1.y', 'out2.a'],
    ],
  ),
  mux2: solve(
    'mux2',
    [['n1', 'NOT'], ['a1', 'AND'], ['a2', 'AND'], ['o1', 'OR']],
    [['in3.y', 'n1.a'], ['in1.y', 'a1.a'], ['n1.y', 'a1.b'], ['in2.y', 'a2.a'], ['in3.y', 'a2.b'], ['a1.y', 'o1.a'], ['a2.y', 'o1.b'], ['o1.y', 'out1.a']],
  ),
  majority: solve(
    'majority',
    [['a1', 'AND'], ['x1', 'XOR'], ['a2', 'AND'], ['o1', 'OR']],
    [['in1.y', 'a1.a'], ['in2.y', 'a1.b'], ['in1.y', 'x1.a'], ['in2.y', 'x1.b'], ['x1.y', 'a2.a'], ['in3.y', 'a2.b'], ['a1.y', 'o1.a'], ['a2.y', 'o1.b'], ['o1.y', 'out1.a']],
  ),
  // Q = NOR(R, Q̄), Q̄ = NOR(S, Q)
  'nor-sr': solve('nor-sr', [['n1', 'NOR'], ['n2', 'NOR']], [['in1.y', 'n1.a'], ['n2.y', 'n1.b'], ['in2.y', 'n2.a'], ['n1.y', 'n2.b'], ['n1.y', 'out1.a'], ['n2.y', 'out2.a']]),
  // S' = NAND(D, CLK), R' = NAND(S', CLK), Q = NAND(S', Q̄), Q̄ = NAND(R', Q)
  'nand-dlatch': solve(
    'nand-dlatch',
    [['s', 'NAND'], ['r', 'NAND'], ['q', 'NAND'], ['qn', 'NAND']],
    [['in1.y', 's.a'], ['in2.y', 's.b'], ['s.y', 'r.a'], ['in2.y', 'r.b'], ['s.y', 'q.a'], ['qn.y', 'q.b'], ['r.y', 'qn.a'], ['q.y', 'qn.b'], ['q.y', 'out1.a']],
  ),
};
