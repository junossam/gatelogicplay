// examples/flipflops.logiclab.json 이 가져오기 검증을 통과하고, 각 플립플롭이 상승 에지에서만 바르게 동작하는지
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseBundle } from '../../src/model/storage';
import { compile, findChipCycle } from '../../src/sim/compile';
import { Engine } from '../../src/sim/engine';
import type { Bit } from '../../src/sim/types';

const json = readFileSync(join(__dirname, '..', '..', 'examples', 'flipflops.logiclab.json'), 'utf8');
const parsed = parseBundle(json);
if (!parsed.ok) throw new Error(parsed.error);
const { library, workspace } = parsed.data;

let e: Engine;
const q = (p: string) => e.readPin(`${p}_q.a`);
const qn = (p: string) => e.readPin(`${p}_qn.a`);
const set = (id: string, v: Bit) => {
  e.setInput(id, v);
  e.tick(60);
};
/** CLK 푸시 버튼: 누름(상승 에지) → 뗌 */
const clock = (p: string) => {
  set(`${p}_clk`, 1);
  set(`${p}_clk`, 0);
};

beforeEach(() => {
  e = new Engine(compile(workspace, library));
});

describe('플립플롭 예제 파일', () => {
  it('저장 형식 검증을 통과하고 칩 순환 참조가 없다', () => {
    expect(Object.values(library).map((d) => d.name).sort()).toEqual(['D 래치', 'D 플립플롭', 'JK 플립플롭', 'SR 래치', 'SR 플립플롭', 'T 플립플롭'].sort());
    expect(findChipCycle(library)).toBeNull();
  });

  it('D 플립플롭: 에지에서 D를 저장, 클럭 없이 D가 바뀌면 유지', () => {
    set('d_d', 1);
    clock('d');
    expect([q('d'), qn('d')]).toEqual([1, 0]);
    set('d_d', 0);
    expect(q('d')).toBe(1);
    clock('d');
    expect([q('d'), qn('d')]).toEqual([0, 1]);
  });

  it('SR 플립플롭: 셋, 유지, 리셋', () => {
    set('sr_s', 1);
    clock('sr');
    expect(q('sr')).toBe(1);
    set('sr_s', 0);
    clock('sr');
    expect(q('sr')).toBe(1);
    set('sr_r', 1);
    clock('sr');
    expect([q('sr'), qn('sr')]).toEqual([0, 1]);
    set('sr_r', 0);
    clock('sr');
    expect(q('sr')).toBe(0);
  });

  it('JK 플립플롭: 리셋, 셋, 유지, 토글', () => {
    set('jk_k', 1);
    clock('jk');
    expect(q('jk')).toBe(0);
    set('jk_k', 0);
    set('jk_j', 1);
    clock('jk');
    expect(q('jk')).toBe(1);
    set('jk_j', 0);
    clock('jk');
    expect(q('jk')).toBe(1);
    set('jk_j', 1);
    set('jk_k', 1);
    const toggles = [0, 1, 2, 3].map(() => {
      clock('jk');
      return q('jk');
    });
    expect(toggles).toEqual([0, 1, 0, 1]);
    expect(qn('jk')).toBe(0);
  });

  it('T 플립플롭: CLR로 0을 만든 뒤 T=1이면 에지마다 반전, T=0이면 유지', () => {
    // 처음(모든 Net 0)에는 Q가 정해지지 않으므로 CLR + 클럭으로 정리
    set('t_clr', 1);
    clock('t');
    set('t_clr', 0);
    expect([q('t'), qn('t')]).toEqual([0, 1]);
    set('t_t', 1);
    const seq = [0, 1, 2].map(() => {
      clock('t');
      return q('t');
    });
    expect(seq).toEqual([1, 0, 1]);
    set('t_t', 0);
    clock('t');
    expect([q('t'), qn('t')]).toEqual([1, 0]);
    // CLR은 언제든 0으로
    set('t_clr', 1);
    clock('t');
    expect(q('t')).toBe(0);
  });

  it('클럭이 1로 머무는 동안 입력이 바뀌어도 출력은 그대로 (레이스 없음)', () => {
    set('jk_k', 1);
    clock('jk'); // 처음 상태 정리
    set('jk_j', 1);
    set('jk_k', 1);
    set('jk_clk', 1);
    const before = q('jk');
    e.tick(300);
    expect(q('jk')).toBe(before);
    expect(e.oscillating.filter((id) => id.startsWith('jk'))).toEqual([]);
  });
});
