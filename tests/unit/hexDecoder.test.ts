// chips/표시/의 8세그먼트 디코더 칩(버스 입력·비트 입력)이 0~F를 표준 7세그먼트 모양으로 바꾸는지 (엔진 API만으로)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBundle } from '../../src/model/storage';
import { compile } from '../../src/sim/compile';
import { Engine } from '../../src/sim/engine';
import { bitKey } from '../../src/sim/pins';
import { CircuitBuilder, HEX_SEGMENTS } from '../fixtures/circuits';

function load(name: string) {
  const r = parseBundle(readFileSync(join(__dirname, '..', '..', 'chips', '표시', name), 'utf8'));
  if (!r.ok) throw new Error(r.error);
  return { lib: r.data.library, def: Object.values(r.data.library)[0]! };
}

/** 입력을 n으로 두고 8세그먼트에 켜진 세그먼트 */
function litFor(engine: Engine, set: (n: number) => void, n: number): string {
  set(n);
  engine.tick(6);
  expect(engine.readPin('disp.dp')).toBe(0);
  return [...'abcdefg'].filter((s) => engine.readPin(`disp.${s}`) === 1).join('');
}

describe('8세그먼트 디코더 (기본 제공 칩)', () => {
  it('버스 입력: N[4] → a~g, 0~F 모두 표준 16진 모양', () => {
    const { lib, def } = load('01-8세그먼트 디코더 (버스).json');
    expect(def.inputs.map((p) => p.name)).toEqual(['N']);
    expect(def.outputs.map((p) => p.name)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const b = new CircuitBuilder().add('SWITCH', 'sw', 0, 0, 'N').bits(4).chip(def.id, 'dec', 6, 0).add('SEG8', 'disp', 16, 0).wire('sw.y', 'dec.N');
    for (const s of 'abcdefg') b.wire(`dec.${s}`, `disp.${s}`);
    const e = new Engine(compile(b.build(), lib));
    const set = (n: number) => [0, 1, 2, 3].forEach((k) => e.setInput(bitKey('sw', k), ((n >> k) & 1) as 0 | 1));
    for (let n = 0; n < 16; n++) expect(litFor(e, set, n), `N=${n.toString(16)}`).toBe(HEX_SEGMENTS[n]);
  });

  it('비트 입력: B0~B3(나누기 없음) → a~g, 0~F 모두 표준 16진 모양', () => {
    const { lib, def } = load('02-8세그먼트 디코더.json');
    expect(def.inputs.map((p) => p.name)).toEqual(['B0', 'B1', 'B2', 'B3']);
    expect(def.circuit.parts.some((p) => p.kind.type === 'primitive' && p.kind.kind === 'SPLIT')).toBe(false);
    const b = new CircuitBuilder().chip(def.id, 'dec', 6, 0).add('SEG8', 'disp', 16, 0);
    for (let k = 0; k < 4; k++) b.add('SWITCH', `s${k}`, 0, k * 3, `B${k}`).wire(`s${k}.y`, `dec.B${k}`);
    for (const s of 'abcdefg') b.wire(`dec.${s}`, `disp.${s}`);
    const e = new Engine(compile(b.build(), lib));
    const set = (n: number) => [0, 1, 2, 3].forEach((k) => e.setInput(`s${k}`, ((n >> k) & 1) as 0 | 1));
    for (let n = 0; n < 16; n++) expect(litFor(e, set, n), `B=${n.toString(2)}`).toBe(HEX_SEGMENTS[n]);
  });
});
