import { describe, expect, it } from 'vitest';
import {
  adderLibrary,
  dffChip,
  dLatchChip,
  harness,
  nestedLibrary,
  register4Chip,
  srLatch,
  srLatchChip,
} from '../../tests/fixtures/circuits';
import { compile, CompileError, findChipCycle } from '../sim/compile';
import { Engine } from '../sim/engine';
import { truthTable } from '../sim/truthTable';
import type { Bit, ChipDef, Library } from '../sim/types';
import {
  allDeps,
  applyChipUpdate,
  chipCategories,
  groupByCategory,
  chipPinsFrom,
  unwiredIO,
  countBrokenWires,
  importConflicts,
  mergeImport,
  pinNameErrors,
  pruneLibrary,
  rangeToChip,
  uniqueName,
  usedBy,
  withDependencies,
  wouldCreateCycle,
} from './library';
import { parseBundle, serializeBundle } from './storage';

const led = (e: Engine, id: string) => e.readPin(`${id}.a`);
const run = (e: Engine) => e.tick(300);

function clockPulse(e: Engine, clk: string) {
  e.setInput(clk, 0);
  run(e);
  e.setInput(clk, 1);
  run(e);
  e.setInput(clk, 0);
  run(e);
}

describe('칩 평탄화', () => {
  it('노드 id는 경로 (dff1/latch/or2 형식)', () => {
    const lib = nestedLibrary();
    const nl = compile(harness(lib['chip-dff']!, 'dff1'), lib);
    expect(nl.nodes.map((n) => n.path)).toContain('dff1/master/latch/or2');
    // 칩 입력 SWITCH는 바깥 신호의 별칭이라 사용자 입력이 아니다
    expect([...nl.inputs.keys()].sort()).toEqual(['in_CLK', 'in_D']);
  });

  it('D 래치: CLK=1이면 Q가 D를 따르고, CLK=0이면 유지', () => {
    const lib = { ...nestedLibrary() };
    const e = new Engine(compile(harness(lib['chip-dlatch']!), lib));
    e.setInput('in_CLK', 1);
    e.setInput('in_D', 1);
    run(e);
    expect(led(e, 'out_Q')).toBe(1);
    e.setInput('in_D', 0);
    run(e);
    expect(led(e, 'out_Q')).toBe(0);
    e.setInput('in_D', 1);
    run(e);
    e.setInput('in_CLK', 0);
    run(e);
    e.setInput('in_D', 0);
    run(e);
    expect(led(e, 'out_Q')).toBe(1);
  });

  it('D 플립플롭: 클럭 상승 에지에서만 저장', () => {
    const lib = nestedLibrary();
    const e = new Engine(compile(harness(lib['chip-dff']!), lib));
    e.setInput('in_D', 1);
    clockPulse(e, 'in_CLK');
    expect(led(e, 'out_Q')).toBe(1);
    // 클럭이 0인 동안 D가 바뀌어도 그대로
    e.setInput('in_D', 0);
    run(e);
    expect(led(e, 'out_Q')).toBe(1);
    // 클럭이 1로 머무는 동안 D가 바뀌어도 그대로 (에지에서만 저장)
    e.setInput('in_CLK', 1);
    run(e);
    expect(led(e, 'out_Q')).toBe(0);
    e.setInput('in_D', 1);
    run(e);
    expect(led(e, 'out_Q')).toBe(0);
    e.setInput('in_CLK', 0);
    run(e);
    expect(led(e, 'out_Q')).toBe(0);
  });

  it('4단계 완료 기준: SR 래치 → D 플립플롭 → 4비트 레지스터 중첩이 동작하고, 래치 수정이 반영된다', () => {
    const lib: Library = nestedLibrary();
    const ws = harness(lib['chip-reg4']!, 'reg');
    const e = new Engine(compile(ws, lib));
    const write = (bits: Bit[]) => {
      bits.forEach((b, i) => e.setInput(`in_D${i}`, b));
      clockPulse(e, 'in_CLK');
      return [0, 1, 2, 3].map((i) => led(e, `out_Q${i}`));
    };
    expect(write([1, 0, 1, 1])).toEqual([1, 0, 1, 1]);
    expect(write([0, 1, 1, 0])).toEqual([0, 1, 1, 0]);
    // 클럭 없이 D만 바꾸면 유지
    [1, 1, 1, 1].forEach((b, i) => e.setInput(`in_D${i}`, b as Bit));
    run(e);
    expect([0, 1, 2, 3].map((i) => led(e, `out_Q${i}`))).toEqual([0, 1, 1, 0]);

    // 래치의 Q 출력 전선을 끊으면 (Q = 0) 레지스터 출력도 모두 0
    const sr = lib['chip-sr']!;
    const edited: ChipDef = {
      ...sr,
      revision: sr.revision + 1,
      circuit: { ...sr.circuit, wires: sr.circuit.wires.filter((w) => !(w.from.partId === 'not1' && w.to.partId === 'q')) },
    };
    const lib2 = { ...lib, [sr.id]: edited };
    const e2 = new Engine();
    e2.load(compile(ws, lib2), e.snapshot());
    [1, 1, 1, 1].forEach((b, i) => e2.setInput(`in_D${i}`, b as Bit));
    e2.setInput('in_CLK', 1);
    e2.tick(300);
    e2.setInput('in_CLK', 0);
    e2.tick(300);
    expect([0, 1, 2, 3].map((i) => led(e2, `out_Q${i}`))).toEqual([0, 0, 0, 0]);
  });

  it('전가산기 (반가산기 칩 2개 + OR): 8개 조합', () => {
    const lib = adderLibrary();
    const t = truthTable(harness(lib['chip-fa']!), lib);
    expect(t.rows).toHaveLength(8);
    for (const r of t.rows) {
      const [a, b, c] = r.inputs;
      const sum = a! + b! + c!;
      expect(r.outputs).toEqual([sum & 1, sum >> 1]);
    }
  });

  it('4비트 리플 캐리 가산기: 256개 조합, 칩 중첩 3단계', () => {
    const lib = adderLibrary();
    const t = truthTable(harness(lib['chip-add4']!), lib);
    expect(t.inputs).toEqual(['A0', 'B0', 'A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
    expect(t.rows).toHaveLength(256);
    for (const r of t.rows) {
      const bit = (name: string) => r.inputs[t.inputs.indexOf(name)]!;
      const a = bit('A0') + 2 * bit('A1') + 4 * bit('A2') + 8 * bit('A3');
      const b = bit('B0') + 2 * bit('B1') + 4 * bit('B2') + 8 * bit('B3');
      const out = r.outputs as number[];
      expect(out[0]! + 2 * out[1]! + 4 * out[2]! + 8 * out[3]! + 16 * out[4]!).toBe(a + b);
    }
  });
});

describe('의존성과 순환 참조 (SPEC 9.1)', () => {
  it('칩 A 안에 A를 넣으려 하면 막힌다', () => {
    const lib = nestedLibrary();
    expect(wouldCreateCycle('chip-sr', 'chip-sr', lib)).toBe(true);
    // SR 래치를 편집하는 중에는 SR 래치를 포함하는 칩도 넣을 수 없다
    expect(wouldCreateCycle('chip-sr', 'chip-reg4', lib)).toBe(true);
    expect(wouldCreateCycle('chip-reg4', 'chip-sr', lib)).toBe(false);
    expect(wouldCreateCycle(null, 'chip-sr', lib)).toBe(false);
  });

  it('순환 라이브러리는 컴파일 전에 막는다', () => {
    const a = srLatchChip('A');
    a.circuit = { ...a.circuit, parts: [...a.circuit.parts, { id: 'self', kind: { type: 'chip', chipId: 'A' }, x: 0, y: 20 }] };
    const lib = { A: a };
    expect(findChipCycle(lib)).toEqual(['A', 'A']);
    expect(() => compile(harness(a), lib)).toThrow(CompileError);
    expect(() => compile(harness(a), lib)).toThrow(/순환/);
  });

  it('allDeps / usedBy / withDependencies', () => {
    const lib = nestedLibrary();
    expect([...allDeps('chip-reg4', lib)].sort()).toEqual(['chip-dff', 'chip-dlatch', 'chip-sr']);
    expect(usedBy('chip-sr', lib).map((d) => d.id)).toEqual(['chip-dlatch']);
    expect(Object.keys(withDependencies(['chip-dff'], lib)).sort()).toEqual(['chip-dff', 'chip-dlatch', 'chip-sr']);
  });
});

describe('핀', () => {
  it('핀 이름은 라벨, 순서는 지정 순서 → 위→아래', () => {
    expect(chipPinsFrom(srLatch())).toEqual({
      inputs: [
        { name: 'R', partId: 'r' },
        { name: 'S', partId: 's' },
      ],
      outputs: [
        { name: 'Q', partId: 'q' },
        { name: 'Q̄', partId: 'qn' },
      ],
    });
    expect(chipPinsFrom(srLatch(), { order: { inputs: ['s'], outputs: [] }, names: { s: 'SET' } }).inputs.map((p) => p.name)).toEqual(['SET', 'R']);
  });

  it('빈 이름과 겹치는 이름은 오류', () => {
    expect(pinNameErrors({ inputs: [{ name: 'A', partId: 'a' }], outputs: [{ name: 'A', partId: 'y' }] })).toHaveLength(1);
    expect(pinNameErrors({ inputs: [{ name: '', partId: 'a' }], outputs: [] })).toHaveLength(1);
    expect(pinNameErrors({ inputs: [{ name: 'A', partId: 'a' }], outputs: [{ name: 'Y', partId: 'y' }] })).toEqual([]);
  });

  it('핀 이름만 바뀌면 쓰는 곳의 전선도 새 이름으로 이어지고, 삭제된 핀의 전선만 끊긴다', () => {
    const lib = nestedLibrary();
    const sr = lib['chip-sr']!;
    const renamed = { ...sr, inputs: [{ name: 'RESET', partId: 'r' }, sr.inputs[1]!] };
    expect(countBrokenWires(lib, renamed, [])).toBe(0);
    const { library } = applyChipUpdate(lib, renamed, []);
    const dl = library['chip-dlatch']!.circuit.wires;
    expect(dl.some((w) => w.to.partId === 'latch' && w.to.pin === 'RESET')).toBe(true);
    expect(dl.some((w) => w.to.pin === 'R')).toBe(false);
    // 이름을 바꿔도 동작은 그대로
    const e = new Engine(compile(harness(library['chip-dlatch']!), library));
    e.setInput('in_CLK', 1);
    e.setInput('in_D', 1);
    e.tick(100);
    expect(led(e, 'out_Q')).toBe(1);

    // 핀을 아예 빼면 그 전선만 끊긴다
    const removed = { ...sr, inputs: [sr.inputs[1]!] };
    expect(countBrokenWires(lib, removed, [])).toBe(1);
    const pruned = pruneLibrary({ ...lib, [sr.id]: removed });
    expect(pruned['chip-dlatch']!.circuit.wires.some((w) => w.to.pin === 'R')).toBe(false);
  });

  it('두 핀 이름을 서로 바꿔도 각 전선이 원래 부품을 따라간다', () => {
    const lib = nestedLibrary();
    const sr = lib['chip-sr']!;
    const swapped = { ...sr, inputs: [{ name: 'S', partId: 'r' }, { name: 'R', partId: 's' }] };
    const { library, others } = applyChipUpdate(lib, swapped, [harness(sr, 'u')]);
    const dl = library['chip-dlatch']!.circuit.wires;
    // andr(리셋 쪽)은 내부 부품 r을 가리키던 핀 → 이제 이름이 S
    expect(dl.find((w) => w.from.partId === 'andr')!.to.pin).toBe('S');
    expect(dl.find((w) => w.from.partId === 'ands')!.to.pin).toBe('R');
    expect(others[0]!.wires.find((w) => w.from.partId === 'in_R')!.to.pin).toBe('S');
  });

  it('이름이 겹치면 "이름 (2)"', () => {
    const lib = nestedLibrary();
    expect(uniqueName('SR 래치', lib)).toBe('SR 래치 (2)');
    expect(uniqueName('SR 래치', lib, 'chip-sr')).toBe('SR 래치');
    expect(uniqueName('새 칩', lib)).toBe('새 칩');
  });
});

describe('범위를 칩으로 만들기 (SPEC 8장)', () => {
  it('SR 래치의 OR/NOT 범위를 칩으로 만들면 R, S → Q, Q̄ 칩이 되고 동작은 그대로', () => {
    const { chip, circuit, instanceId } = rangeToChip(srLatch(), ['or1', 'or2', 'not1', 'not2'], {}, {
      id: 'new',
      name: '새 칩',
      color: 'chip-2',
      now: '2026-01-01T00:00:00Z',
    });
    expect(chip.inputs.map((p) => p.name)).toEqual(['R', 'S']);
    expect(chip.outputs.map((p) => p.name)).toEqual(['Q', 'Q̄']);
    expect(circuit.parts.map((p) => p.id).sort()).toEqual([instanceId, 'q', 'qn', 'r', 's'].sort());
    expect(circuit.wires).toHaveLength(4);

    const lib = { new: chip };
    const e = new Engine(compile(circuit, lib));
    e.setInput('s', 1);
    e.tick(20);
    e.setInput('s', 0);
    e.tick(20);
    expect([led(e, 'q'), led(e, 'qn')]).toEqual([1, 0]);
    e.setInput('r', 1);
    e.tick(20);
    e.setInput('r', 0);
    e.tick(20);
    expect([led(e, 'q'), led(e, 'qn')]).toEqual([0, 1]);
  });
});

describe('가져오기와 내보내기', () => {
  const lib = nestedLibrary();
  const changed = { ...lib['chip-sr']!, name: 'SR 래치 수정본', revision: 9 };
  const incoming: Library = { 'chip-sr': changed };

  it('같은 id에 내용이 다르면 충돌', () => {
    expect(importConflicts(lib, incoming).map((d) => d.id)).toEqual(['chip-sr']);
    expect(importConflicts(lib, { 'chip-sr': lib['chip-sr']! })).toEqual([]);
  });

  it('덮어쓰기 / 복사본 / 건너뛰기', () => {
    expect(mergeImport(lib, incoming, 'overwrite').library['chip-sr']!.name).toBe('SR 래치 수정본');
    expect(mergeImport(lib, incoming, 'skip').library['chip-sr']!.name).toBe('SR 래치');
    const copy = mergeImport(lib, incoming, 'copy').library;
    expect(copy['chip-sr']!.name).toBe('SR 래치');
    const added = Object.values(copy).find((d) => d.revision === 9)!;
    expect(added.id).not.toBe('chip-sr');
    expect(added.name).toBe('SR 래치 수정본');
  });

  it('복사본으로 저장하면 가져온 칩들 안의 참조도 새 id로 바꾼다', () => {
    const inc = { ...withDependencies(['chip-dlatch'], lib) };
    inc['chip-sr'] = changed;
    const { library } = mergeImport(lib, inc, 'copy');
    const newSr = Object.values(library).find((d) => d.revision === 9)!;
    const dl = library['chip-dlatch']!;
    expect(dl.circuit.parts.find((p) => p.id === 'latch')!.kind).toEqual({ type: 'chip', chipId: newSr.id });
  });

  it('내보낸 파일은 의존하는 칩을 모두 담고, 다시 읽을 수 있다', () => {
    const json = serializeBundle(withDependencies(['chip-reg4'], lib), harness(register4Chip()), null);
    const r = parseBundle(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.data.library).sort()).toEqual(['chip-dff', 'chip-dlatch', 'chip-reg4', 'chip-sr']);
  });

  it('잘못된 파일은 문제 필드를 알려주며 거부', () => {
    const bad = JSON.parse(serializeBundle({ x: { ...dffChip(), id: 'x', inputs: [{ name: '', partId: 'd' }] } }, harness(dLatchChip()), null));
    const r = parseBundle(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('library.x.inputs.0.name');
    expect(parseBundle('{"format":"logiclab"').ok).toBe(false);
  });
});

describe('순차 회로 진리표: 처음에는 안정되지 않는 플립플롭', () => {
  it('D 래치: CLK=1이면 D를 따르고, CLK=0이면 이전 유지', () => {
    const lib = nestedLibrary();
    const t = truthTable(harness(lib['chip-dlatch']!), lib);
    expect(t.inputs).toEqual(['D', 'CLK']);
    const row = (d: number, clk: number) => t.rows.find((r) => r.inputs[0] === d && r.inputs[1] === clk)!;
    expect(row(0, 0).outputs).toEqual(['hold', 'hold']);
    expect(row(1, 0).outputs).toEqual(['hold', 'hold']);
    expect(row(0, 1).outputs).toEqual([0, 1]);
    expect(row(1, 1).outputs).toEqual([1, 0]);
  });

  it('4비트 레지스터: 금지 상태 없이 CLK=0 행은 모두 이전 유지', () => {
    const lib = nestedLibrary();
    const t = truthTable(harness(lib['chip-reg4']!), lib);
    expect(t.rows).toHaveLength(32);
    expect(t.rows.some((r) => r.forbidden)).toBe(false);
    const clk = t.inputs.indexOf('CLK');
    for (const r of t.rows.filter((r) => r.inputs[clk] === 0)) expect(r.outputs).toEqual(['hold', 'hold', 'hold', 'hold']);
  });
});

describe('칩 핀에서 빼기', () => {
  it('전선 없는 LED는 핀 후보에서 기본으로 빠지고, exclude로 뺀 부품은 핀이 되지 않는다', () => {
    const c = srLatch();
    c.parts.push({ id: 'led9', kind: { type: 'primitive', kind: 'LED' }, x: 80, y: -3, label: 'Y1' });
    expect([...unwiredIO(c)]).toEqual(['led9']);
    expect(chipPinsFrom(c).outputs.map((p) => p.name)).toEqual(['Y1', 'Q', 'Q̄']);
    expect(chipPinsFrom(c, { exclude: ['led9'] }).outputs.map((p) => p.name)).toEqual(['Q', 'Q̄']);
  });
});

describe('칩 분류', () => {
  it('분류별로 묶고, 분류 없는 칩은 맨 뒤', () => {
    const lib = nestedLibrary();
    lib['chip-sr'] = { ...lib['chip-sr']!, category: '래치' };
    lib['chip-dlatch'] = { ...lib['chip-dlatch']!, category: '래치' };
    lib['chip-reg4'] = { ...lib['chip-reg4']!, category: '레지스터' };
    expect(chipCategories(lib)).toEqual(['래치', '레지스터']);
    expect(groupByCategory(Object.values(lib)).map(([c, defs]) => [c, defs.length])).toEqual([
      ['래치', 2],
      ['레지스터', 1],
      ['', 1],
    ]);
  });
});
