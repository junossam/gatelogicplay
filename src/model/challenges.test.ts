import { describe, expect, it } from 'vitest';
import { SOLUTIONS } from '../../tests/fixtures/challengeSolutions';
import { srLatchChip } from '../../tests/fixtures/circuits';
import { CHALLENGES, challengeById, grade, isAllowedIn, starterCircuit } from './challenges';

describe('챌린지 채점', () => {
  it.each(CHALLENGES.map((c) => [c.id, c] as const))('%s: 모범 답안이 모범 게이트 수로 통과', (id, ch) => {
    const g = grade(ch, SOLUTIONS[id]!);
    expect(g.status, JSON.stringify(g)).toBe('pass');
    if (g.status === 'pass') {
      expect(g.gates).toBe(ch.par);
      expect(g.rows).toHaveLength(2 ** ch.inputs.length);
    }
  });

  it('틀린 회로는 틀린 행을 알려 준다', () => {
    const ch = challengeById('nand-xor')!;
    // AND를 만든 회로로 XOR 채점
    const g = grade(ch, { ...SOLUTIONS['nand-and']!, parts: SOLUTIONS['nand-and']!.parts.map((p) => p) });
    // nand-and 시작 회로도 입력 A, B / 출력 Y라 채점은 된다
    expect(g.status).toBe('fail');
    if (g.status === 'fail') {
      expect(g.rows.filter((r) => !r.ok).map((r) => r.inputs)).toEqual([
        [0, 1],
        [1, 0],
        [1, 1],
      ]);
      expect(g.wrong).toBe(3);
    }
  });

  it('빈 시작 회로는 실패 (연결 안 된 LED는 0)', () => {
    const ch = challengeById('nand-not')!;
    const g = grade(ch, starterCircuit(ch));
    expect(g.status).toBe('fail');
  });

  it('NOR SR 래치: 유지 행은 이전 유지, R=S=1은 상관없음으로 채점', () => {
    const g = grade(challengeById('nor-sr')!, SOLUTIONS['nor-sr']!);
    expect(g.status).toBe('pass');
    if (g.status !== 'invalid') {
      expect(g.rows[0]!.actual).toEqual(['hold', 'hold']);
      expect(g.rows[3]!.actual).toEqual(['forbidden', 'forbidden']);
    }
  });

  it('유지해야 하는 래치를 조합 회로로 풀면 실패', () => {
    const ch = challengeById('nor-sr')!;
    // Q = S, Q̄ = R 로만 연결 (NOR 없이) → 00 행이 유지가 아님
    const c = starterCircuit(ch);
    c.wires = [
      { id: 'w1', from: { partId: 'in2', pin: 'y' }, to: { partId: 'out1', pin: 'a' } },
      { id: 'w2', from: { partId: 'in1', pin: 'y' }, to: { partId: 'out2', pin: 'a' } },
    ];
    const g = grade(ch, c);
    expect(g.status).toBe('fail');
    if (g.status === 'fail') expect(g.rows[0]!.ok).toBe(false);
  });

  it('이름이 맞는 입출력이 없거나 챌린지에 없는 입력이 있으면 채점하지 않는다', () => {
    const ch = challengeById('half-adder')!;
    const c = starterCircuit(ch);
    const missing = { ...c, parts: c.parts.filter((p) => p.label !== 'C') };
    expect(grade(ch, missing)).toMatchObject({ status: 'invalid', message: expect.stringContaining('C') });
    const extra = { ...c, parts: [...c.parts, { id: 'sw9', kind: { type: 'primitive' as const, kind: 'SWITCH' as const }, x: 0, y: 30, label: 'Z' }] };
    expect(grade(ch, extra)).toMatchObject({ status: 'invalid', message: expect.stringContaining('Z') });
  });

  it('허용되지 않은 부품: NAND 챌린지의 AND, 클럭, 금지 게이트가 든 칩', () => {
    const ch = challengeById('nand-xor')!;
    const lib = { 'chip-sr': srLatchChip() };
    expect(isAllowedIn(ch, { type: 'primitive', kind: 'NAND' }, lib)).toBe(true);
    expect(isAllowedIn(ch, { type: 'primitive', kind: 'SWITCH' }, lib)).toBe(true);
    expect(isAllowedIn(ch, { type: 'primitive', kind: 'AND' }, lib)).toBe(false);
    expect(isAllowedIn(ch, { type: 'primitive', kind: 'CLOCK' }, lib)).toBe(false);
    // SR 래치 칩은 OR/NOT으로 만들어져 NAND 챌린지에서 못 쓴다
    expect(isAllowedIn(ch, { type: 'chip', chipId: 'chip-sr' }, lib)).toBe(false);
    expect(isAllowedIn(challengeById('half-adder')!, { type: 'chip', chipId: 'chip-sr' }, lib)).toBe(true);

    const c = SOLUTIONS['nand-xor']!;
    const cheat = { ...c, parts: c.parts.map((p) => (p.id === 'g4' ? { ...p, kind: { type: 'primitive' as const, kind: 'AND' as const } } : p)) };
    expect(grade(ch, cheat)).toMatchObject({ status: 'invalid' });
  });
});
