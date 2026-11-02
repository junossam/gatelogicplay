// 기본 컴퓨터 예제: 저장된 파일을 그대로 엔진에 넣어 명령어 인출 4단계를 확인한다. GEN_SAMPLES=1 이면 파일을 다시 만든다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBundle, serializeBundle } from '../../src/model/storage';
import { compile } from '../../src/sim/compile';
import { Engine } from '../../src/sim/engine';
import { bitKey } from '../../src/sim/pins';
import { basicComputer, PROGRAM } from '../fixtures/basicComputer';

const root = join(__dirname, '..', '..');
const FILE = join(root, 'samples', '기본 컴퓨터', '명령어 인출.json');

describe('기본 컴퓨터 (공통 버스 · 명령어 인출)', () => {
  it('예제 파일이 생성 코드와 같다', () => {
    const ff = parseBundle(readFileSync(join(root, 'samples', '기억 소자', '플립플롭 모음.json'), 'utf8'));
    if (!ff.ok) throw new Error(ff.error);
    const { circuit, library } = basicComputer(ff.data.library);
    const doc = JSON.parse(serializeBundle(library, circuit, null));
    const text =
      JSON.stringify({ format: doc.format, version: doc.version, title: '기본 컴퓨터: 명령어 인출', description: '공통 버스 · AR·PC·DR·AC·IR·TR · ROM. CLK마다 T0~T3', ...doc }, null, 2) + '\n';
    if (process.env.GEN_SAMPLES) {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, text);
    } else {
      expect(existsSync(FILE)).toBe(true);
      expect(readFileSync(FILE, 'utf8')).toBe(text);
    }
  });

  it('RESET 후 CLK마다 T0: AR←PC, T1: DR←M[AR]·PC←PC+1, T2: IR←DR, T3: I←IR(15)·AR←IR(0~11)', () => {
    const r = parseBundle(readFileSync(FILE, 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const e = new Engine(compile(r.data.workspace, r.data.library));
    const read = (id: string, bits = 1) => {
      let v = 0;
      for (let k = 0; k < bits; k++) v |= e.readPin(bitKey(`${id}.a`, k)) << k;
      return v;
    };
    const press = () => {
      e.tick(20);
      e.setInput('clk', 1);
      e.tick(60);
      e.setInput('clk', 0);
      e.tick(60);
    };
    const state = () => ({
      T: [0, 1, 2, 3].findIndex((i) => read(`t${i}`) === 1),
      AR: read('v_ar', 12),
      PC: read('v_pc', 12),
      DR: read('v_dr', 16),
      IR: read('v_ir', 16),
      I: read('v_i'),
    });
    e.tick(40);
    e.setInput('reset', 1);
    press();
    e.setInput('reset', 0);
    e.tick(40);
    expect(state()).toEqual({ T: 0, AR: 0, PC: 0, DR: 0, IR: 0, I: 0 });

    let prev = state();
    for (let pc = 0; pc < 8; pc++) {
      const word = PROGRAM[pc]!;
      press(); // T0
      expect(state(), `PC=${pc} T0`).toEqual({ ...prev, T: 1, AR: pc });
      press(); // T1
      expect(state(), `PC=${pc} T1`).toEqual({ ...prev, T: 2, AR: pc, DR: word, PC: pc + 1 });
      press(); // T2
      expect(state(), `PC=${pc} T2`).toEqual({ ...prev, T: 3, AR: pc, DR: word, PC: pc + 1, IR: word });
      press(); // T3
      prev = { T: 0, AR: word & 0xfff, PC: pc + 1, DR: word, IR: word, I: word >> 15 };
      expect(state(), `PC=${pc} T3`).toEqual(prev);
    }
  });
});
