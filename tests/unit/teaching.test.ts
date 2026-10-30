// samples/의 수업용 예제(칩 없이 기본 게이트로 펼친 회로)가 실제로 맞게 동작하는지 — 저장된 파일을 그대로 엔진에 넣는다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBundle } from '../../src/model/storage';
import { compile } from '../../src/sim/compile';
import { Engine } from '../../src/sim/engine';
import { bitKey } from '../../src/sim/pins';
import type { Bit } from '../../src/sim/types';
import { HEX_SEGMENTS } from '../fixtures/circuits';

function open(file: string) {
  const r = parseBundle(readFileSync(join(__dirname, '..', '..', 'samples', file), 'utf8'));
  if (!r.ok) throw new Error(`${file}: ${r.error}`);
  const c = r.data.workspace;
  // 칩 없이 기본 부품만, 블록마다 그룹
  expect(Object.keys(r.data.library)).toEqual([]);
  expect(c.parts.every((p) => p.kind.type === 'primitive')).toBe(true);
  expect(c.groups?.length).toBeGreaterThan(0);
  const e = new Engine(compile(c, {}));
  e.setTicksPerSecond(10);
  // 실제 앱처럼 조작 전에 시뮬레이션이 잠시 돌아 있던 상태에서 시작
  e.tick(30);
  const set = (id: string, v: number, bits = 1) => {
    for (let k = 0; k < bits; k++) e.setInput(bitKey(id, k), ((v >> k) & 1) as Bit);
  };
  const led = (id: string, bits = 1) => {
    let v = 0;
    for (let k = 0; k < bits; k++) v |= e.readPin(bitKey(`${id}.a`, k)) << k;
    return v;
  };
  /** 푸시 버튼 한 번: 입력을 바꾼 뒤 잠시 기다렸다가(준비 시간) 누르고 뗀다 */
  const press = (id: string) => {
    e.tick(10);
    set(id, 1);
    e.tick(30);
    set(id, 0);
    e.tick(30);
  };
  return { c, e, set, led, press };
}

const bit = (v: number, k: number) => (v >> k) & 1;
const popOdd = (v: number) => [0, 1, 2, 3].reduce((p, k) => p ^ bit(v, k), 0);

describe('수업용 예제 (칩 없이 펼친 회로)', () => {
  it('NAND로 만든 게이트', () => {
    const { e, set, led } = open('기본/NAND로 만든 게이트.json');
    for (let v = 0; v < 4; v++) {
      const [a, b] = [bit(v, 0), bit(v, 1)];
      set('a', a);
      set('b', b);
      e.tick(10);
      expect([led('y_not'), led('y_and'), led('y_or'), led('y_xor')], `A=${a} B=${b}`).toEqual([1 - a, a & b, a | b, a ^ b]);
    }
  });

  it('4:1 MUX · 1:4 DEMUX', () => {
    const { e, set, led } = open('선택/멀티플렉서.json');
    for (let d = 0; d < 16; d++) {
      for (let s = 0; s < 4; s++) {
        for (let i = 0; i < 4; i++) set(`d${i}`, bit(d, i));
        set('s0', bit(s, 0));
        set('s1', bit(s, 1));
        set('dd', d & 1);
        e.tick(12);
        expect(led('y'), `D=${d} S=${s}`).toBe(bit(d, s));
        expect([0, 1, 2, 3].map((i) => led(`y${i}`))).toEqual([0, 1, 2, 3].map((i) => (i === s ? d & 1 : 0)));
      }
    }
  });

  it('3→8 디코더 · 4→2 우선순위 인코더', () => {
    const { e, set, led } = open('선택/디코더·인코더.json');
    for (let a = 0; a < 8; a++) {
      [0, 1, 2].forEach((k) => set(`a${k}`, bit(a, k)));
      e.tick(10);
      expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => led(`y${i}`)), `A=${a}`).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i === a ? 1 : 0)));
    }
    for (let v = 0; v < 16; v++) {
      [0, 1, 2, 3].forEach((k) => set(`i${k}`, bit(v, k)));
      e.tick(10);
      const hi = v ? 31 - Math.clz32(v) : 0;
      expect([led('ey1'), led('ey0'), led('v')], `I=${v}`).toEqual([bit(hi, 1), bit(hi, 0), v ? 1 : 0]);
    }
  });

  it('4비트 비교기: 256가지 모두', () => {
    const { e, set, led } = open('연산/비교기.json');
    for (let a = 0; a < 16; a++) {
      for (let b = 0; b < 16; b++) {
        set('a', a, 4);
        set('b', b, 4);
        e.tick(12);
        expect([led('gt'), led('eq'), led('lt')], `${a} vs ${b}`).toEqual([+(a > b), +(a === b), +(a < b)]);
      }
    }
  });

  it('전감산기', () => {
    const { e, set, led } = open('연산/전감산기.json');
    for (let v = 0; v < 8; v++) {
      const [a, b, bi] = [bit(v, 0), bit(v, 1), bit(v, 2)];
      set('a', a);
      set('b', b);
      set('bi', bi);
      e.tick(12);
      const diff = a - b - bi;
      expect([led('d'), led('bo')], `${a}-${b}-${bi}`).toEqual([diff & 1, +(diff < 0)]);
    }
  });

  it('4비트 ALU: AND·OR·덧셈·뺄셈 1024가지', () => {
    const { e, set, led } = open('연산/4비트 ALU.json');
    for (let op = 0; op < 4; op++) {
      for (let a = 0; a < 16; a++) {
        for (let b = 0; b < 16; b++) {
          set('a', a, 4);
          set('b', b, 4);
          set('op', op, 2);
          e.tick(40);
          const y = [a & b, a | b, (a + b) & 15, (a - b) & 15][op];
          const c = [0, 0, +(a + b > 15), +(a >= b)][op];
          expect([led('y', 4), led('c')], `op=${op} ${a},${b}`).toEqual([y, c]);
        }
      }
    }
  });

  it('4비트 레지스터 · 시프트 레지스터 (CLK 상승 에지)', () => {
    const { set, led, press } = open('기억 소자/레지스터.json');
    for (const v of [5, 10, 15, 0, 9]) {
      set('d', v, 4);
      press('clk');
      expect(led('q', 4)).toBe(v);
    }
    set('d', 3, 4);
    expect(led('q', 4)).toBe(9); // CLK 없이는 그대로
    set('sin', 0);
    for (let i = 0; i < 4; i++) press('sclk');
    const seq = [1, 0, 1, 1, 0, 0];
    let reg = 0;
    for (const x of seq) {
      set('sin', x);
      press('sclk');
      reg = ((reg << 1) | x) & 15;
      expect([0, 1, 2, 3].map((i) => led(`q${i}`))).toEqual([0, 1, 2, 3].map((i) => bit(reg, i)));
    }
  });

  it('비동기·동기 카운터: CLR 후 0부터 세고 15 다음 0', () => {
    const { set, led, press } = open('기억 소자/카운터.json');
    set('clr', 1);
    press('clk');
    set('clr', 0);
    expect([led('rq', 4), led('sq', 4)]).toEqual([0, 0]);
    for (let n = 1; n <= 20; n++) {
      press('clk');
      expect([led('rq', 4), led('sq', 4)], `n=${n}`).toEqual([n % 16, n % 16]);
      expect(led('co')).toBe(+(n % 16 === 15));
    }
  });

  it('0~99 카운터: 클럭마다 1씩, 99 다음 00 (8세그먼트 표시로 읽기)', () => {
    const { e, set } = open('표시/0~99 카운터.json');
    const digit = (seg: string) => {
      const lit = [...'abcdefg'].filter((s) => e.readPin(`${seg}.${s}`)).join('');
      const d = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => HEX_SEGMENTS[n] === lit);
      if (d === undefined) throw new Error(`${seg}: 숫자 모양이 아님 (${lit})`);
      return d;
    };
    const read = () => digit('seg10') * 10 + digit('seg1');
    set('clr', 1);
    e.tick(40);
    set('clr', 0);
    e.tick(5);
    // 클럭 1Hz · 초당 10틱 → 10틱마다 1 증가
    const start = read();
    for (let k = 1; k <= 120; k++) {
      e.tick(10);
      expect(read(), `k=${k}`).toBe((start + k) % 100);
    }
  });

  it('패리티 생성·검사 · 2진↔그레이 변환', () => {
    const { e, set, led } = open('기타/부호·검사.json');
    for (let v = 0; v < 16; v++) {
      [0, 1, 2, 3].forEach((k) => {
        set(`d${k}`, bit(v, k));
        set(`b${k}`, bit(v, k));
        set(`gi${k}`, bit(v, k));
      });
      for (const p of [0, 1]) {
        set('pin', p);
        e.tick(10);
        expect(led('p'), `D=${v}`).toBe(popOdd(v));
        expect(led('err'), `D=${v} P=${p}`).toBe(popOdd(v) ^ p);
      }
      const gray = v ^ (v >> 1);
      const bin = v ^ (v >> 1) ^ (v >> 2) ^ (v >> 3);
      expect([0, 1, 2, 3].map((k) => led(`g${k}`)), `B=${v}`).toEqual([0, 1, 2, 3].map((k) => bit(gray, k)));
      expect([0, 1, 2, 3].map((k) => led(`bo${k}`)), `G=${v}`).toEqual([0, 1, 2, 3].map((k) => bit(bin, k)));
    }
  });
});
