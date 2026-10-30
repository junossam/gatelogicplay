// 기본 제공 칩 (chips/의 선택·연산·기억 소자 묶음): 여러 개를 엮어 2·4·8비트로 넓힐 수 있게 EN·확장 입출력을 둔다.
// chips/ 파일은 이 코드로 만들고, tests/unit/builtinChips.test.ts가 실제로 엮어서 넓힌 회로를 엔진으로 검증한다.
import { withDependencies } from '../../src/model/library';
import type { ChipDef, Library } from '../../src/sim/types';
import { gate, led, makeChip, merge, split, sw, use } from './teaching';

export interface BuiltinChipFile {
  /** chips/ 기준 경로 */
  file: string;
  title: string;
  description: string;
  library: Library;
}

function category<T extends ChipDef>(name: string, color: string, ...defs: T[]): T[] {
  for (const d of defs) {
    d.category = name;
    d.color = color;
  }
  return defs;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// ---------------------------------------------------------------- 멀티플렉서 (EN: 0이면 출력 0 → 여러 개의 출력을 OR로 묶어 넓힌다)

export const mux2 = makeChip('bi-mux2', '2:1 MUX (EN)', (b) => {
  sw(b, 'd0', 'D0');
  sw(b, 'd1', 'D1');
  sw(b, 's', 'S');
  sw(b, 'en', 'EN');
  gate(b, 'NOT', 'ns', ['s.y']);
  gate(b, 'AND', 'a0', ['d0.y', 'ns.y', 'en.y']);
  gate(b, 'AND', 'a1', ['d1.y', 's.y', 'en.y']);
  gate(b, 'OR', 'o', ['a0.y', 'a1.y']);
  led(b, 'y', 'Y', 'o.y');
}, [['D0', 'd0'], ['D1', 'd1'], ['S', 's'], ['EN', 'en']], [['Y', 'y']]);

export const mux4 = makeChip('bi-mux4', '4:1 MUX (EN)', (b) => {
  for (const i of range(4)) sw(b, `d${i}`, `D${i}`);
  sw(b, 's0', 'S0');
  sw(b, 's1', 'S1');
  sw(b, 'en', 'EN');
  gate(b, 'NOT', 'n0', ['s0.y']);
  gate(b, 'NOT', 'n1', ['s1.y']);
  const sel = [['n1.y', 'n0.y'], ['n1.y', 's0.y'], ['s1.y', 'n0.y'], ['s1.y', 's0.y']];
  sel.forEach(([hi, lo], i) => gate(b, 'AND', `a${i}`, [`d${i}.y`, hi!, lo!, 'en.y']));
  gate(b, 'OR', 'o', range(4).map((i) => `a${i}.y`));
  led(b, 'y', 'Y', 'o.y');
}, [...range(4).map((i) => [`D${i}`, `d${i}`] as [string, string]), ['S0', 's0'], ['S1', 's1'], ['EN', 'en']], [['Y', 'y']]);

// ---------------------------------------------------------------- 디멀티플렉서 (D가 곧 EN: 앞 단 출력을 뒤 단 D에 이어 넓힌다)

export const demux2 = makeChip('bi-demux2', '1:2 DEMUX', (b) => {
  sw(b, 'd', 'D');
  sw(b, 's', 'S');
  gate(b, 'NOT', 'ns', ['s.y']);
  gate(b, 'AND', 'g0', ['d.y', 'ns.y']);
  gate(b, 'AND', 'g1', ['d.y', 's.y']);
  led(b, 'y0', 'Y0', 'g0.y');
  led(b, 'y1', 'Y1', 'g1.y');
}, [['D', 'd'], ['S', 's']], [['Y0', 'y0'], ['Y1', 'y1']]);

export const demux4 = makeChip('bi-demux4', '1:4 DEMUX', (b) => {
  sw(b, 'd', 'D');
  sw(b, 's0', 'S0');
  sw(b, 's1', 'S1');
  gate(b, 'NOT', 'n0', ['s0.y']);
  gate(b, 'NOT', 'n1', ['s1.y']);
  const sel = [['n1.y', 'n0.y'], ['n1.y', 's0.y'], ['s1.y', 'n0.y'], ['s1.y', 's0.y']];
  sel.forEach(([hi, lo], i) => {
    gate(b, 'AND', `g${i}`, ['d.y', hi!, lo!]);
    led(b, `y${i}`, `Y${i}`, `g${i}.y`);
  });
}, [['D', 'd'], ['S0', 's0'], ['S1', 's1']], range(4).map((i) => [`Y${i}`, `y${i}`] as [string, string]));

// ---------------------------------------------------------------- 디코더·인코더

export const dec24 = makeChip('bi-dec24', '2→4 디코더 (EN)', (b) => {
  sw(b, 'a0', 'A0');
  sw(b, 'a1', 'A1');
  sw(b, 'en', 'EN');
  gate(b, 'NOT', 'n0', ['a0.y']);
  gate(b, 'NOT', 'n1', ['a1.y']);
  const sel = [['n1.y', 'n0.y'], ['n1.y', 'a0.y'], ['a1.y', 'n0.y'], ['a1.y', 'a0.y']];
  sel.forEach(([hi, lo], i) => {
    gate(b, 'AND', `g${i}`, ['en.y', hi!, lo!]);
    led(b, `y${i}`, `Y${i}`, `g${i}.y`);
  });
}, [['A0', 'a0'], ['A1', 'a1'], ['EN', 'en']], range(4).map((i) => [`Y${i}`, `y${i}`] as [string, string]));

/**
 * 4→2 우선순위 인코더 (확장): EI = 이 칩을 쓸지, GS = 켜진 입력이 있음, EO = 켜진 입력이 없음(아래 칩의 EI로).
 * 8→3: 위 칩 EO → 아래 칩 EI, 셋째 비트 = 위 칩 GS, Y1·Y0은 두 칩을 OR.
 */
export const enc42 = makeChip('bi-enc42', '4→2 우선순위 인코더 (확장)', (b) => {
  for (const i of range(4)) sw(b, `i${i}`, `I${i}`);
  sw(b, 'ei', 'EI');
  gate(b, 'OR', 'any', range(4).map((i) => `i${i}.y`));
  gate(b, 'NOT', 'none', ['any.y']);
  gate(b, 'NOT', 'ni2', ['i2.y']);
  gate(b, 'AND', 't', ['ni2.y', 'i1.y']);
  gate(b, 'OR', 'o1', ['i3.y', 'i2.y']);
  gate(b, 'OR', 'o0', ['i3.y', 't.y']);
  gate(b, 'AND', 'y1g', ['o1.y', 'ei.y']);
  gate(b, 'AND', 'y0g', ['o0.y', 'ei.y']);
  gate(b, 'AND', 'gs', ['any.y', 'ei.y']);
  gate(b, 'AND', 'eo', ['none.y', 'ei.y']);
  led(b, 'y1', 'Y1', 'y1g.y');
  led(b, 'y0', 'Y0', 'y0g.y');
  led(b, 'ogs', 'GS', 'gs.y');
  led(b, 'oeo', 'EO', 'eo.y');
}, [...range(4).map((i) => [`I${i}`, `i${i}`] as [string, string]), ['EI', 'ei']], [['Y1', 'y1'], ['Y0', 'y0'], ['GS', 'ogs'], ['EO', 'oeo']]);

// ---------------------------------------------------------------- 1비트 비교기 (확장): 아래 자리 결과(Gi·Ei·Li)를 받아 위 자리로

/**
 * G = A·¬B + (A=B)·Gi,  E = (A=B)·Ei,  L = ¬A·B + (A=B)·Li.
 * 가장 낮은 자리는 Gi=0, Ei=1(VCC), Li=0. 아래 자리의 G·E·L을 위 자리의 Gi·Ei·Li에 이어 n비트로 넓힌다.
 */
export const cmp1 = makeChip('bi-cmp1', '1비트 비교기 (확장)', (b) => {
  sw(b, 'a', 'A');
  sw(b, 'b', 'B');
  sw(b, 'gi', 'Gi');
  sw(b, 'ei', 'Ei');
  sw(b, 'li', 'Li');
  gate(b, 'NOT', 'na', ['a.y']);
  gate(b, 'NOT', 'nb', ['b.y']);
  gate(b, 'XNOR', 'same', ['a.y', 'b.y']);
  gate(b, 'AND', 'gt', ['a.y', 'nb.y']);
  gate(b, 'AND', 'lt', ['na.y', 'b.y']);
  gate(b, 'AND', 'gk', ['same.y', 'gi.y']);
  gate(b, 'AND', 'lk', ['same.y', 'li.y']);
  gate(b, 'AND', 'ek', ['same.y', 'ei.y']);
  gate(b, 'OR', 'g', ['gt.y', 'gk.y']);
  gate(b, 'OR', 'l', ['lt.y', 'lk.y']);
  led(b, 'og', 'G', 'g.y');
  led(b, 'oe', 'E', 'ek.y');
  led(b, 'ol', 'L', 'l.y');
}, [['A', 'a'], ['B', 'b'], ['Gi', 'gi'], ['Ei', 'ei'], ['Li', 'li']], [['G', 'og'], ['E', 'oe'], ['L', 'ol']]);

// ---------------------------------------------------------------- 레지스터 (D 플립플롭 ff-d 사용)

export function registerChips(ff: Library) {
  /** 1비트 레지스터: LD=1이면 CLK 상승에 D를 저장, LD=0이면 그대로 */
  const reg1 = makeChip('bi-reg1', '1비트 레지스터 (LD)', (b) => {
    sw(b, 'd', 'D');
    sw(b, 'ld', 'LD');
    sw(b, 'clk', 'CLK');
    gate(b, 'NOT', 'nld', ['ld.y']);
    gate(b, 'AND', 'take', ['d.y', 'ld.y']);
    gate(b, 'AND', 'keep', ['f.Q', 'nld.y']);
    gate(b, 'OR', 'next', ['take.y', 'keep.y']);
    use(b, 'ff-d', 'f', { D: 'next.y', CLK: 'clk.y' });
    led(b, 'q', 'Q', 'f.Q');
  }, [['D', 'd'], ['LD', 'ld'], ['CLK', 'clk']], [['Q', 'q']], ff);

  const reg4 = makeChip('bi-reg4', '4비트 레지스터 (LD)', (b) => {
    sw(b, 'd', 'D', 4);
    sw(b, 'ld', 'LD');
    sw(b, 'clk', 'CLK');
    split(b, 'sd', 'd.y', 4);
    for (const i of range(4)) use(b, reg1.id, `r${i}`, { D: `sd.y${i}`, LD: 'ld.y', CLK: 'clk.y' });
    merge(b, 'mq', range(4).map((i) => `r${i}.Q`));
    led(b, 'q', 'Q', 'mq.y', 4);
  }, [['D', 'd'], ['LD', 'ld'], ['CLK', 'clk']], [['Q', 'q']], { ...ff, [reg1.id]: reg1 });

  /** 4비트 시프트 레지스터: CLK마다 SI → Q0 → … → Q3. SO(=Q3)를 다음 칩의 SI에 이어 넓힌다 */
  const shift4 = makeChip('bi-shift4', '4비트 시프트 레지스터 (SI·SO)', (b) => {
    sw(b, 'si', 'SI');
    sw(b, 'clk', 'CLK');
    for (const i of range(4)) use(b, 'ff-d', `f${i}`, { D: i ? `f${i - 1}.Q` : 'si.y', CLK: 'clk.y' });
    merge(b, 'mq', range(4).map((i) => `f${i}.Q`));
    led(b, 'q', 'Q', 'mq.y', 4);
    led(b, 'so', 'SO', 'f3.Q');
  }, [['SI', 'si'], ['CLK', 'clk']], [['Q', 'q'], ['SO', 'so']], ff);

  return { reg1, reg4, shift4 };
}

export function builtinChipFiles(ff: Library): BuiltinChipFile[] {
  const regs = registerChips(ff);
  const lib = (...defs: ChipDef[]) => withDependencies(defs.map((d) => d.id), { ...ff, ...Object.fromEntries(defs.map((d) => [d.id, d])) });
  return [
    {
      file: '선택/멀티플렉서.json',
      title: '멀티플렉서 (EN)',
      description: '2:1 · 4:1 MUX. EN과 OR로 8:1 이상',
      library: lib(...category('멀티플렉서', 'chip-3', mux2, mux4)),
    },
    {
      file: '선택/디멀티플렉서.json',
      title: '디멀티플렉서',
      description: '1:2 · 1:4 DEMUX. 앞 단 출력 → 뒤 단 D로 1:8 이상',
      library: lib(...category('디멀티플렉서', 'chip-3', demux2, demux4)),
    },
    {
      file: '선택/디코더·인코더.json',
      title: '디코더·인코더 (확장)',
      description: '2→4 디코더(EN) · 4→2 우선순위 인코더(EI·EO·GS)',
      library: lib(...category('디코더·인코더', 'chip-4', dec24, enc42)),
    },
    {
      file: '연산/1비트 비교기.json',
      title: '1비트 비교기 (확장)',
      description: 'Gi·Ei·Li → G·E·L. 이어서 n비트 비교',
      library: lib(...category('비교기', 'chip-1', cmp1)),
    },
    {
      file: '기억 소자/레지스터.json',
      title: '레지스터 (확장)',
      description: '1·4비트 레지스터(LD) · 4비트 시프트(SI·SO)',
      library: lib(...category('레지스터', 'chip-2', regs.reg1, regs.reg4, regs.shift4)),
    },
  ];
}
