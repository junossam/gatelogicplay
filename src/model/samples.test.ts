import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { busAdderWorkspace, busLibrary } from '../../tests/fixtures/circuits';
import { buildManifest, describeSample, isSafeSamplePath, sampleFileFrom, sampleLink, sampleUrl, titleFromFile } from './samples';
import { serializeBundle } from './storage';

const bundle = (extra: Record<string, unknown> = {}) => JSON.stringify({ ...JSON.parse(serializeBundle(busLibrary(), busAdderWorkspace(), null)), ...extra });

describe('예제 목록', () => {
  it('파일 이름에서 제목을 만든다: 확장자·정렬 번호를 떼고 _는 띄어쓰기', () => {
    expect(titleFromFile('연산/01-반_가산기.gatelogicplay.json')).toBe('반 가산기');
    expect(titleFromFile('flipflops.json')).toBe('flipflops');
  });

  it('파일 맨 위의 title·description을 쓰고, 칩 이름·부품 수·분류(폴더)를 담는다', () => {
    const r = describeSample('연산/adder.json', bundle({ title: ' 4비트 가산기 ', description: '설명' }));
    expect(r).toEqual({
      ok: true,
      entry: { file: '연산/adder.json', title: '4비트 가산기', description: '설명', category: '연산', chips: ['반가산기', '전가산기', '4비트 가산기(버스)'], parts: 5 },
    });
  });

  it('검증에 실패한 파일은 오류로 모으고 나머지는 분류 → 파일 이름 순', () => {
    const { manifest, errors } = buildManifest([
      { file: 'b.json', json: bundle() },
      { file: '연산/z.json', json: bundle() },
      { file: 'a.json', json: bundle() },
      { file: 'bad.json', json: '{"format":"logiclab"}' },
    ]);
    expect(manifest.samples.map((s) => s.file)).toEqual(['a.json', 'b.json', '연산/z.json']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^bad\.json: /);
  });

  it('저장소의 samples/ 예제는 모두 검증을 통과한다', () => {
    for (const file of ['기억 소자/플립플롭 모음.json', '연산/4비트 가산기.json']) {
      const r = describeSample(file, readFileSync(join(__dirname, '..', '..', 'samples', file), 'utf8'));
      expect(r.ok, file).toBe(true);
    }
  });
});

describe('예제 경로와 링크', () => {
  it('상위 폴더·절대 경로·역슬래시·json 아닌 파일은 거부', () => {
    expect(isSafeSamplePath('연산/a.json')).toBe(true);
    for (const bad of ['../a.json', 'a/../../b.json', '/a.json', String.raw`a\b.json`, 'a.js', '', 'a//b.json']) expect(isSafeSamplePath(bad), bad).toBe(false);
  });

  it('#sample= 링크를 만들고 다시 읽는다 (한글·띄어쓰기 포함)', () => {
    const link = sampleLink('기억 소자/플립플롭 모음.json', 'https://junossam.github.io/gatelogicplay/');
    expect(link).toBe('https://junossam.github.io/gatelogicplay/#sample=' + encodeURIComponent('기억 소자/플립플롭 모음.json'));
    expect(sampleFileFrom(new URL(link).hash)).toBe('기억 소자/플립플롭 모음.json');
    expect(sampleFileFrom('#sample=..%2Fsecret.json')).toBeNull();
    expect(sampleFileFrom('#share=abc')).toBeNull();
  });

  it('예제 파일 URL은 페이지 기준 상대 경로 (하위 폴더 배포)', () => {
    expect(sampleUrl('기억 소자/a b.json', 'https://junossam.github.io/gatelogicplay/')).toBe(
      'https://junossam.github.io/gatelogicplay/samples/%EA%B8%B0%EC%96%B5%20%EC%86%8C%EC%9E%90/a%20b.json',
    );
  });
});
