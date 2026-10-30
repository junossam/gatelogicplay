import { describe, expect, it } from 'vitest';
import { BOM, lutToCsv, parseLutCsv } from './lutCsv';

describe('진리표 CSV', () => {
  it('내려받은 CSV를 다시 올리면 같은 표 (핀 이름 포함)', () => {
    const d = { inputs: 2, outputs: 2, table: [0, 1, 1, 2], inNames: ['', '입력B'], outNames: ['S', ''] };
    const csv = lutToCsv(d);
    expect(csv.startsWith(`${BOM}A,입력B,|,S,Y1\r\n0,0,|,0,0\r\n0,1,|,1,0\r\n`)).toBe(true);
    expect(parseLutCsv(csv)).toEqual({ ok: true, data: d });
  });

  it('엑셀에서 고친 탭·세미콜론 구분, 순서가 섞인 줄, 빠진 줄(0), x는 0', () => {
    const tsv = 'A\tB\tC\t|\tY\n1\t1\t1\t|\t1\n0\t0\t1\t|\tx\n1\t0\t0\t|\t1\n';
    const r = parseLutCsv(tsv);
    expect(r.ok && r.data.table).toEqual([0, 0, 0, 0, 1, 0, 0, 1]);
    const semi = 'A;B;=>;Y\n0;1;=>;1\n';
    const s = parseLutCsv(semi);
    expect(s.ok && s.data).toMatchObject({ inputs: 2, outputs: 1, table: [0, 1, 0, 0] });
  });

  it('| 열이 없으면 지금 입력 수로 나눈다', () => {
    const r = parseLutCsv('A,B,Y\n1,1,1\n', 2);
    expect(r.ok && r.data.table).toEqual([0, 0, 0, 1]);
    expect(parseLutCsv('A,B,Y\n1,1,1\n').ok).toBe(false);
  });

  it('잘못된 파일은 몇 번째 줄이 왜 틀렸는지 알려 준다', () => {
    expect(parseLutCsv('A,|,Y\n2,|,1\n')).toEqual({ ok: false, error: '2번째 줄: 입력 A은 0이나 1이어야 합니다 ("2").' });
    expect(parseLutCsv('A,|,Y\n1,|,1\n1,|,0\n')).toEqual({ ok: false, error: '3번째 줄: 같은 입력 줄이 두 번 있습니다.' });
    expect(parseLutCsv('A,B,C,D,E,F,G,H,I,|,Y\n')).toMatchObject({ ok: false });
    const wide = parseLutCsv(`A,|,${Array.from({ length: 17 }, (_, j) => `Y${j}`).join(',')}\n0,|,${Array(17).fill(0).join(',')}\n`);
    expect(wide).toEqual({ ok: false, error: '출력은 1~16개여야 합니다 (지금 17개).' });
  });
});
