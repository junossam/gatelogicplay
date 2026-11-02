// samples/연산/4비트 덧셈 10진수 표시.json: A + B(0~30)가 두 8세그먼트에 10진수 두 자리로 나오는지 (엔진 API만으로)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBundle } from '../../src/model/storage';
import { compile } from '../../src/sim/compile';
import { Engine } from '../../src/sim/engine';
import { bitKey } from '../../src/sim/pins';
import { HEX_SEGMENTS } from '../fixtures/circuits';

describe('예제: 4비트 덧셈 결과를 10진수로', () => {
  it('A, B 모든 조합에서 십의 자리·일의 자리 8세그먼트가 A + B', () => {
    const r = parseBundle(readFileSync(join(__dirname, '..', '..', 'samples', '연산', '4비트 덧셈 10진수 표시.json'), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const e = new Engine(compile(r.data.workspace, r.data.library));
    const lit = (seg: string) => [...'abcdefg'].filter((s) => e.readPin(`${seg}.${s}`) === 1).join('');
    for (let a = 0; a < 16; a++) {
      for (let b = 0; b < 16; b++) {
        for (let k = 0; k < 4; k++) {
          e.setInput(bitKey('switch1', k), ((a >> k) & 1) as 0 | 1);
          e.setInput(bitKey('switch2', k), ((b >> k) & 1) as 0 | 1);
        }
        e.tick(60);
        const sum = a + b;
        expect([lit('seg82'), lit('seg81')], `${a} + ${b}`).toEqual([HEX_SEGMENTS[Math.floor(sum / 10)], HEX_SEGMENTS[sum % 10]]);
      }
    }
  });
});
