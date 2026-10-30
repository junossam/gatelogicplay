// chips/표시/2진수→8세그먼트 칩이 0~F를 표준 7세그먼트 모양으로 바꾸는지 (엔진 API만으로)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBundle } from '../../src/model/storage';
import { compile } from '../../src/sim/compile';
import { Engine } from '../../src/sim/engine';
import { bitKey } from '../../src/sim/pins';
import { CircuitBuilder, HEX_SEGMENTS } from '../fixtures/circuits';

const file = join(__dirname, '..', '..', 'chips', '표시', '2진수 8세그먼트 디코더.json');

describe('2진수 → 8세그먼트 디코더 (기본 제공 칩)', () => {
  const r = parseBundle(readFileSync(file, 'utf8'));
  if (!r.ok) throw new Error(r.error);
  const lib = r.data.library;
  const def = Object.values(lib)[0]!;

  it('입력 N은 4비트, 출력은 a~g', () => {
    expect(def.inputs.map((p) => p.name)).toEqual(['N']);
    expect(def.outputs.map((p) => p.name)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('0~F 모든 값에서 켜지는 세그먼트가 표준 16진 모양과 같다 (8세그먼트 부품에 연결)', () => {
    const b = new CircuitBuilder().add('SWITCH', 'sw', 0, 0, 'N').bits(4).chip(def.id, 'dec', 6, 0).add('SEG8', 'disp', 16, 0).wire('sw.y', 'dec.N');
    for (const s of 'abcdefg') b.wire(`dec.${s}`, `disp.${s}`);
    const e = new Engine(compile(b.build(), lib));
    for (let n = 0; n < 16; n++) {
      for (let k = 0; k < 4; k++) e.setInput(bitKey('sw', k), ((n >> k) & 1) as 0 | 1);
      e.tick(6);
      const lit = [...'abcdefg'].filter((s) => e.readPin(`disp.${s}`) === 1).join('');
      expect(lit, `N=${n.toString(16).toUpperCase()}`).toBe(HEX_SEGMENTS[n]);
      expect(e.readPin('disp.dp')).toBe(0);
    }
  });
});
