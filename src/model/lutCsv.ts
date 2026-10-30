// 진리표 부품의 표를 CSV로 주고받는다 (엑셀에서 열고 고칠 수 있게).
// 형식: 첫 줄은 핀 이름, 입력과 출력 사이에 `|` 열. 그다음 줄마다 입력 비트 | 출력 비트.
//   A,B,|,S,C
//   0,0,|,0,0
//   0,1,|,1,0
import { MAX_LUT_INPUTS, MAX_LUT_OUTPUTS } from '../sim/pins';

export interface LutData {
  inputs: number;
  outputs: number;
  /** 행 번호(입력을 A부터 높은 자리로 읽은 값) → 출력 비트 묶음 (Y0이 비트 0) */
  table: number[];
  inNames: string[];
  outNames: string[];
}

export const MAX_PIN_NAME = 8;
/** 엑셀이 UTF-8 CSV의 한글을 깨뜨리지 않게 붙이는 BOM */
export const BOM = String.fromCharCode(0xfeff);
const BOM_RE = new RegExp(`^${BOM}`);
const SEPARATORS = new Set(['|', '=>', '->', '→', '']);

export const defaultInName = (k: number) => String.fromCharCode(65 + k);
export const defaultOutName = (j: number) => `Y${j}`;

/** 표를 CSV로 (엑셀이 한글을 깨뜨리지 않게 앞에 BOM) */
export function lutToCsv(d: LutData): string {
  const head = [
    ...Array.from({ length: d.inputs }, (_, k) => d.inNames[k] || defaultInName(k)),
    '|',
    ...Array.from({ length: d.outputs }, (_, j) => d.outNames[j] || defaultOutName(j)),
  ];
  const lines = [head.map(csvCell).join(',')];
  for (let i = 0; i < 1 << d.inputs; i++) {
    const ins = Array.from({ length: d.inputs }, (_, k) => (i >> (d.inputs - 1 - k)) & 1);
    const outs = Array.from({ length: d.outputs }, (_, j) => ((d.table[i] ?? 0) >> j) & 1);
    lines.push([...ins, '|', ...outs].join(','));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * CSV를 읽는다. 구분 문자는 쉼표·탭·세미콜론을 알아서 고른다.
 * `|` 열이 없으면 fallbackInputs(지금 입력 수)로 입력과 출력을 나눈다.
 * 출력 칸의 x, -, 빈칸은 0. 빠진 행은 0.
 */
export function parseLutCsv(text: string, fallbackInputs?: number): { ok: true; data: LutData } | { ok: false; error: string } {
  const lines = text
    .replace(BOM_RE, '')
    .split(/\r?\n/)
    .map((l, i) => ({ l, no: i + 1 }))
    .filter(({ l }) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return { ok: false, error: '첫 줄(핀 이름)과 값 줄이 있어야 합니다.' };
  const first = lines[0]!.l;
  const delim = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const head = splitLine(first, delim);
  let sep = head.findIndex((c, i) => i > 0 && i < head.length - 1 && SEPARATORS.has(c));
  let n: number;
  let m: number;
  if (sep >= 0) {
    n = sep;
    m = head.length - sep - 1;
  } else if (fallbackInputs && fallbackInputs < head.length) {
    n = fallbackInputs;
    m = head.length - n;
    sep = -1;
  } else {
    return { ok: false, error: '입력과 출력을 나누는 | 열이 첫 줄에 없습니다. (예: A,B,|,Y)' };
  }
  if (n < 1 || n > MAX_LUT_INPUTS) return { ok: false, error: `입력은 1~${MAX_LUT_INPUTS}개여야 합니다 (지금 ${n}개).` };
  if (m < 1 || m > MAX_LUT_OUTPUTS) return { ok: false, error: `출력은 1~${MAX_LUT_OUTPUTS}개여야 합니다 (지금 ${m}개).` };
  const cols = (cells: string[]) => (sep >= 0 ? [...cells.slice(0, sep), ...cells.slice(sep + 1)] : cells);
  const names = cols(head).map((s) => s.slice(0, MAX_PIN_NAME));
  const table = Array<number>(1 << n).fill(0);
  const seen = new Set<number>();
  for (const { l, no } of lines.slice(1)) {
    const cells = cols(splitLine(l, delim));
    if (cells.length < n + m) return { ok: false, error: `${no}번째 줄: 칸이 모자랍니다 (입력 ${n} + 출력 ${m}).` };
    let idx = 0;
    for (let k = 0; k < n; k++) {
      const c = cells[k];
      if (c !== '0' && c !== '1') return { ok: false, error: `${no}번째 줄: 입력 ${names[k] || defaultInName(k)}은 0이나 1이어야 합니다 ("${c}").` };
      idx = (idx << 1) | Number(c);
    }
    if (seen.has(idx)) return { ok: false, error: `${no}번째 줄: 같은 입력 줄이 두 번 있습니다.` };
    seen.add(idx);
    let v = 0;
    for (let j = 0; j < m; j++) {
      const c = cells[n + j]!.toLowerCase();
      if (c === '1') v |= 1 << j;
      else if (c !== '0' && c !== '' && c !== 'x' && c !== '-') {
        return { ok: false, error: `${no}번째 줄: 출력 ${names[n + j] || defaultOutName(j)}은 0이나 1이어야 합니다 ("${cells[n + j]}").` };
      }
    }
    table[idx] = v;
  }
  return {
    ok: true,
    data: {
      inputs: n,
      outputs: m,
      table,
      inNames: names.slice(0, n).map((s, k) => (s === defaultInName(k) ? '' : s)),
      outNames: names.slice(n).map((s, j) => (s === defaultOutName(j) ? '' : s)),
    },
  };
}
