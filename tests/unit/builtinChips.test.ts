// chips/의 확장형 기본 제공 칩을 실제로 여러 개 엮어 넓힌 회로가 맞게 동작하는지 (저장된 파일 그대로, 엔진 API만으로)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBundle } from '../../src/model/storage';
import { compile } from '../../src/sim/compile';
import { Engine } from '../../src/sim/engine';
import { bitKey } from '../../src/sim/pins';
import type { Bit, Library } from '../../src/sim/types';
import { CircuitBuilder } from '../fixtures/circuits';

function load(file: string): { lib: Library; id: (name: string) => string } {
  const r = parseBundle(readFileSync(join(__dirname, '..', '..', 'chips', file), 'utf8'));
  if (!r.ok) throw new Error(`${file}: ${r.error}`);
  const lib = r.data.library;
  return {
    lib,
    id: (name) => {
      const d = Object.values(lib).find((x) => x.name === name);
      if (!d) throw new Error(`${file}에 ${name} 칩이 없습니다`);
      return d.id;
    },
  };
}

const bit = (v: number, k: number) => ((v >> k) & 1) as Bit;

function run(b: CircuitBuilder, lib: Library) {
  const e = new Engine(compile(b.build(), lib));
  e.tick(30);
  const set = (id: string, v: number, bits = 1) => {
    for (let k = 0; k < bits; k++) e.setInput(bitKey(id, k), bit(v, k));
  };
  const out = (id: string, bits = 1) => {
    let v = 0;
    for (let k = 0; k < bits; k++) v |= e.readPin(bitKey(`${id}.a`, k)) << k;
    return v;
  };
  const press = (id: string) => {
    e.tick(10);
    set(id, 1);
    e.tick(30);
    set(id, 0);
    e.tick(30);
  };
  return { e, set, out, press };
}

describe('확장형 기본 제공 칩: 엮어서 넓히기', () => {
  it('멀티플렉서: 4:1 MUX(EN) 두 개 + OR = 8:1 MUX', () => {
    const { lib, id } = load('선택/멀티플렉서.json');
    const b = new CircuitBuilder();
    for (let i = 0; i < 8; i++) b.add('SWITCH', `d${i}`, 0, i * 2, `D${i}`);
    for (let k = 0; k < 3; k++) b.add('SWITCH', `s${k}`, 0, 20 + k * 2, `S${k}`);
    b.add('NOT', 'ns2', 4, 26).wire('s2.y', 'ns2.a');
    for (const [h, en] of [[0, 'ns2.y'], [1, 's2.y']] as const) {
      b.chip(id('4:1 MUX (EN)'), `m${h}`, 8, h * 12);
      for (let i = 0; i < 4; i++) b.wire(`d${h * 4 + i}.y`, `m${h}.D${i}`);
      b.wire('s0.y', `m${h}.S0`).wire('s1.y', `m${h}.S1`).wire(en, `m${h}.EN`);
    }
    b.add('OR', 'o', 18, 6).wire('m0.Y', 'o.a').wire('m1.Y', 'o.b').add('LED', 'y', 24, 6, 'Y').wire('o.y', 'y.a');
    const { e, set, out } = run(b, lib);
    for (const d of [0b10110010, 0b01001101, 0xff, 0]) {
      for (let s = 0; s < 8; s++) {
        for (let i = 0; i < 8; i++) set(`d${i}`, bit(d, i));
        for (let k = 0; k < 3; k++) set(`s${k}`, bit(s, k));
        e.tick(12);
        expect(out('y'), `D=${d} S=${s}`).toBe(bit(d, s));
      }
    }
    // 2:1 MUX도 EN=0이면 0
    const b2 = new CircuitBuilder().add('SWITCH', 'd1', 0, 0).add('SWITCH', 's', 0, 3).add('SWITCH', 'en', 0, 6).chip(id('2:1 MUX (EN)'), 'm', 6, 0).add('LED', 'y', 14, 0);
    b2.wire('d1.y', 'm.D1').wire('s.y', 'm.S').wire('en.y', 'm.EN').wire('m.Y', 'y.a');
    const r2 = run(b2, lib);
    r2.set('d1', 1);
    r2.set('s', 1);
    r2.e.tick(10);
    expect(r2.out('y')).toBe(0);
    r2.set('en', 1);
    r2.e.tick(10);
    expect(r2.out('y')).toBe(1);
  });

  it('디멀티플렉서: 1:2 DEMUX → 1:4 DEMUX 두 개 = 1:8 DEMUX', () => {
    const { lib, id } = load('선택/디멀티플렉서.json');
    const b = new CircuitBuilder().add('SWITCH', 'd', 0, 0, 'D');
    for (let k = 0; k < 3; k++) b.add('SWITCH', `s${k}`, 0, 3 + k * 2, `S${k}`);
    b.chip(id('1:2 DEMUX'), 'top', 6, 0).wire('d.y', 'top.D').wire('s2.y', 'top.S');
    for (const h of [0, 1]) {
      b.chip(id('1:4 DEMUX'), `q${h}`, 14, h * 10).wire(`top.Y${h}`, `q${h}.D`).wire('s0.y', `q${h}.S0`).wire('s1.y', `q${h}.S1`);
      for (let i = 0; i < 4; i++) b.add('LED', `y${h * 4 + i}`, 24, h * 10 + i * 2).wire(`q${h}.Y${i}`, `y${h * 4 + i}.a`);
    }
    const { e, set, out } = run(b, lib);
    for (const d of [0, 1]) {
      for (let s = 0; s < 8; s++) {
        set('d', d);
        for (let k = 0; k < 3; k++) set(`s${k}`, bit(s, k));
        e.tick(10);
        expect(Array.from({ length: 8 }, (_, i) => out(`y${i}`)), `D=${d} S=${s}`).toEqual(Array.from({ length: 8 }, (_, i) => (i === s ? d : 0)));
      }
    }
  });

  it('디코더: 2→4 디코더(EN) 두 개 = 3→8 디코더', () => {
    const { lib, id } = load('선택/디코더·인코더.json');
    const b = new CircuitBuilder();
    for (let k = 0; k < 3; k++) b.add('SWITCH', `a${k}`, 0, k * 2, `A${k}`);
    b.add('NOT', 'na2', 4, 6).wire('a2.y', 'na2.a');
    for (const [h, en] of [[0, 'na2.y'], [1, 'a2.y']] as const) {
      b.chip(id('2→4 디코더 (EN)'), `d${h}`, 8, h * 10).wire('a0.y', `d${h}.A0`).wire('a1.y', `d${h}.A1`).wire(en, `d${h}.EN`);
      for (let i = 0; i < 4; i++) b.add('LED', `y${h * 4 + i}`, 18, h * 10 + i * 2).wire(`d${h}.Y${i}`, `y${h * 4 + i}.a`);
    }
    const { e, set, out } = run(b, lib);
    for (let a = 0; a < 8; a++) {
      for (let k = 0; k < 3; k++) set(`a${k}`, bit(a, k));
      e.tick(10);
      expect(Array.from({ length: 8 }, (_, i) => out(`y${i}`)), `A=${a}`).toEqual(Array.from({ length: 8 }, (_, i) => +(i === a)));
    }
  });

  it('인코더: 4→2 우선순위 인코더 두 개(위 EO → 아래 EI) = 8→3 우선순위 인코더', () => {
    const { lib, id } = load('선택/디코더·인코더.json');
    const b = new CircuitBuilder().add('VCC', 'vcc', 0, 20);
    for (let i = 0; i < 8; i++) b.add('SWITCH', `i${i}`, 0, i * 2, `I${i}`);
    const enc = id('4→2 우선순위 인코더 (확장)');
    b.chip(enc, 'hi', 8, 0).chip(enc, 'lo', 8, 12);
    for (let i = 0; i < 4; i++) b.wire(`i${i + 4}.y`, `hi.I${i}`).wire(`i${i}.y`, `lo.I${i}`);
    b.wire('vcc.y', 'hi.EI').wire('hi.EO', 'lo.EI');
    b.add('OR', 'o1', 18, 0).wire('hi.Y1', 'o1.a').wire('lo.Y1', 'o1.b');
    b.add('OR', 'o0', 18, 6).wire('hi.Y0', 'o0.a').wire('lo.Y0', 'o0.b');
    b.add('OR', 'og', 18, 12).wire('hi.GS', 'og.a').wire('lo.GS', 'og.b');
    b.add('LED', 'y2', 26, 0).wire('hi.GS', 'y2.a');
    b.add('LED', 'y1', 26, 3).wire('o1.y', 'y1.a');
    b.add('LED', 'y0', 26, 6).wire('o0.y', 'y0.a');
    b.add('LED', 'gs', 26, 9).wire('og.y', 'gs.a');
    const { e, set, out } = run(b, lib);
    for (let v = 0; v < 256; v++) {
      for (let i = 0; i < 8; i++) set(`i${i}`, bit(v, i));
      e.tick(12);
      const hi = v ? 31 - Math.clz32(v) : 0;
      expect([out('y2'), out('y1'), out('y0'), out('gs')], `I=${v.toString(2)}`).toEqual([bit(hi, 2), bit(hi, 1), bit(hi, 0), +(v > 0)]);
    }
  });

  it('1비트 비교기(확장) 4개·8개를 이어 4비트·8비트 비교', () => {
    const { lib, id } = load('연산/1비트 비교기.json');
    for (const n of [4, 8]) {
      const b = new CircuitBuilder().add('SWITCH', 'a', 0, 0, 'A').bits(n).add('SWITCH', 'b', 0, 4, 'B').bits(n).add('VCC', 'vcc', 0, 8).add('GND', 'gnd', 0, 11);
      b.add('SPLIT', 'sa', 4, 0).bits(n).wire('a.y', 'sa.a').add('SPLIT', 'sb', 4, 20).bits(n).wire('b.y', 'sb.a');
      for (let k = 0; k < n; k++) {
        b.chip(id('1비트 비교기 (확장)'), `c${k}`, 10 + k * 8, 0).wire(`sa.y${k}`, `c${k}.A`).wire(`sb.y${k}`, `c${k}.B`);
        if (k === 0) b.wire('gnd.y', 'c0.Gi').wire('vcc.y', 'c0.Ei').wire('gnd.y', 'c0.Li');
        else b.wire(`c${k - 1}.G`, `c${k}.Gi`).wire(`c${k - 1}.E`, `c${k}.Ei`).wire(`c${k - 1}.L`, `c${k}.Li`);
      }
      const last = `c${n - 1}`;
      b.add('LED', 'g', 80, 0).wire(`${last}.G`, 'g.a').add('LED', 'eq', 80, 3).wire(`${last}.E`, 'eq.a').add('LED', 'l', 80, 6).wire(`${last}.L`, 'l.a');
      const { e, set, out } = run(b, lib);
      const pairs = n === 4 ? Array.from({ length: 256 }, (_, i) => [i & 15, i >> 4]) : [[0, 0], [255, 255], [128, 127], [3, 200], [77, 77], [170, 85], [1, 0], [0, 1]];
      for (const [x, y] of pairs) {
        set('a', x!, n);
        set('b', y!, n);
        e.tick(4 * n + 10);
        expect([out('g'), out('eq'), out('l')], `${n}비트 ${x} vs ${y}`).toEqual([+(x! > y!), +(x === y), +(x! < y!)]);
      }
    }
  });

  it('레지스터: 4비트 레지스터(LD) 두 개 = 8비트, LD=0이면 그대로', () => {
    const { lib, id } = load('기억 소자/레지스터.json');
    const b = new CircuitBuilder().add('SWITCH', 'd', 0, 0, 'D').bits(8).add('SWITCH', 'ld', 0, 4, 'LD').add('PUSH', 'clk', 0, 8, 'CLK');
    b.add('SPLIT', 'sd', 5, 0).bits(8).wire('d.y', 'sd.a');
    b.add('MERGE', 'lo', 8, 0).bits(4).add('MERGE', 'hi', 8, 10).bits(4);
    for (let i = 0; i < 4; i++) b.wire(`sd.y${i}`, `lo.a${i}`).wire(`sd.y${i + 4}`, `hi.a${i}`);
    const reg = id('4비트 레지스터 (LD)');
    b.chip(reg, 'r0', 12, 0).chip(reg, 'r1', 12, 10);
    b.wire('lo.y', 'r0.D').wire('hi.y', 'r1.D');
    for (const r of ['r0', 'r1']) b.wire('ld.y', `${r}.LD`).wire('clk.y', `${r}.CLK`);
    b.add('LED', 'q0', 22, 0).bits(4).wire('r0.Q', 'q0.a').add('LED', 'q1', 22, 10).bits(4).wire('r1.Q', 'q1.a');
    const { set, out, press } = run(b, lib);
    const q = () => out('q0', 4) | (out('q1', 4) << 4);
    set('ld', 1);
    for (const v of [0x5a, 0xff, 0x00, 0xc3]) {
      set('d', v, 8);
      press('clk');
      expect(q(), `D=${v}`).toBe(v);
    }
    set('ld', 0);
    set('d', 0x11, 8);
    press('clk');
    expect(q()).toBe(0xc3); // LD=0: CLK를 눌러도 그대로
    set('ld', 1);
    press('clk');
    expect(q()).toBe(0x11);
  });

  it('시프트 레지스터: 4비트(SI·SO) 두 개를 SO → SI로 이어 8비트', () => {
    const { lib, id } = load('기억 소자/레지스터.json');
    const sh = id('4비트 시프트 레지스터 (SI·SO)');
    const b = new CircuitBuilder().add('SWITCH', 'si', 0, 0, 'SI').add('PUSH', 'clk', 0, 4, 'CLK');
    b.chip(sh, 'a', 6, 0).chip(sh, 'b', 16, 0).wire('si.y', 'a.SI').wire('a.SO', 'b.SI').wire('clk.y', 'a.CLK').wire('clk.y', 'b.CLK');
    b.add('LED', 'qa', 26, 0).bits(4).wire('a.Q', 'qa.a').add('LED', 'qb', 26, 4).bits(4).wire('b.Q', 'qb.a').add('LED', 'so', 26, 8).wire('b.SO', 'so.a');
    const { set, out, press } = run(b, lib);
    set('si', 0);
    for (let i = 0; i < 8; i++) press('clk');
    let reg = 0;
    const seq = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
    for (const x of seq) {
      set('si', x);
      press('clk');
      reg = ((reg << 1) | x) & 0xff;
      const qa = out('qa', 4);
      const qb = out('qb', 4);
      // Q0이 가장 최근 비트: 비트 i = i클럭 전 입력
      const want = (k: number) => bit(reg, k);
      expect([qa, qb], `reg=${reg.toString(2)}`).toEqual([[0, 1, 2, 3].reduce((v, k) => v | (want(k) << k), 0), [0, 1, 2, 3].reduce((v, k) => v | (want(k + 4) << k), 0)]);
      expect(out('so')).toBe(want(7));
    }
  });
});
