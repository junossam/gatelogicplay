import { describe, expect, it } from 'vitest';
import { compile } from '../../sim/compile';
import { Engine } from '../../sim/engine';
import { busAdderWorkspace, busLibrary, harness, nestedLibrary, CircuitBuilder } from '../../../tests/fixtures/circuits';
import { CHIP_GROUP_SUFFIX, expandCircuit } from './expand';
import { GRID, partRect } from './geometry';

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('칩 펼쳐 보기', () => {
  const lib = busLibrary();
  const ws = busAdderWorkspace();

  it('0단계는 그대로, 1단계는 바깥 칩만 펼쳐 안쪽 칩(전가산기)은 칩으로 남는다', () => {
    expect(expandCircuit(ws, lib, 0)).toBe(ws);
    const one = expandCircuit(ws, lib, 1);
    expect(one.parts.some((p) => p.id === 'add')).toBe(false);
    expect(one.parts.filter((p) => p.kind.type === 'chip').map((p) => p.id).sort()).toEqual(['add/fa0', 'add/fa1', 'add/fa2', 'add/fa3']);
    expect(one.groups?.map((g) => g.name)).toEqual(['4비트 가산기(버스) (add)']);
  });

  it('전부 펼치면 기본 부품만 남고, 칩의 입출력 부품은 빠지며 칩마다 그룹이 생긴다', () => {
    const all = expandCircuit(ws, lib, Infinity);
    expect(all.parts.every((p) => p.kind.type === 'primitive')).toBe(true);
    // 칩 핀 부품(내부 스위치·LED)은 없다 → 남은 스위치·LED는 바깥 것뿐
    expect(all.parts.filter((p) => p.kind.type === 'primitive' && (p.kind.kind === 'SWITCH' || p.kind.kind === 'LED')).map((p) => p.id).sort()).toEqual(['carry', 'ina', 'inb', 'sum']);
    // 가산기 1 + 전가산기 4 + 반가산기 8
    expect(all.groups?.filter((g) => g.id.endsWith(CHIP_GROUP_SUFFIX))).toHaveLength(13);
    // 모든 전선 끝은 존재하는 부품
    const ids = new Set(all.parts.map((p) => p.id));
    for (const w of all.wires) {
      expect(ids.has(w.from.partId), w.from.partId).toBe(true);
      expect(ids.has(w.to.partId), w.to.partId).toBe(true);
    }
  });

  it('펼친 회로를 그대로 컴파일해도 원래 회로와 같은 값을 낸다 (경로 id와 연결이 맞다)', () => {
    const all = expandCircuit(ws, lib, Infinity);
    const a = new Engine(compile(ws, lib));
    const b = new Engine(compile(all, {}));
    for (const [x, y] of [[3, 5], [9, 9], [15, 1]] as const) {
      for (let k = 0; k < 4; k++) {
        for (const e of [a, b]) {
          e.setInput(k ? `ina[${k}]` : 'ina', ((x >> k) & 1) as 0 | 1);
          e.setInput(k ? `inb[${k}]` : 'inb', ((y >> k) & 1) as 0 | 1);
        }
      }
      a.tick(40);
      b.tick(40);
      const read = (e: Engine) => [0, 1, 2, 3].map((k) => e.readPin(k ? `sum.a[${k}]` : 'sum.a')).concat(e.readPin('carry.a'));
      expect(read(b)).toEqual(read(a));
    }
  });

  it('펼친 칩이 커진 만큼 옆 부품을 밀어 겹치지 않는다', () => {
    const def = Object.values(nestedLibrary()).find((d) => d.name === 'D 래치')!;
    const c = new CircuitBuilder().chip(def.id, 'u1', 6, 0).add('LED', 'right', 14, 0, 'R').add('LED', 'below', 6, 6, 'B').build();
    const out = expandCircuit(c, nestedLibrary(), Infinity);
    const rects = out.parts.map((p) => ({ id: p.id, r: partRect(p, nestedLibrary()) }));
    const inner = rects.filter((x) => x.id.startsWith('u1/'));
    for (const id of ['right', 'below']) {
      const r = rects.find((x) => x.id === id)!.r;
      for (const q of inner) expect(overlaps(r, q.r), `${id} vs ${q.id}`).toBe(false);
    }
    expect(GRID).toBe(20);
    // 하네스(입력마다 스위치)도 펼칠 수 있다
    expect(expandCircuit(harness(def), nestedLibrary(), 1).parts.some((p) => p.id.startsWith('u1/'))).toBe(true);
  });
});
