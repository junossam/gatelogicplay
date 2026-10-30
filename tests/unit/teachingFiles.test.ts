// samples/의 수업용 예제 파일이 tests/fixtures/teaching.ts와 같은지. GEN_SAMPLES=1 이면 다시 만든다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { parseBundle, serializeBundle } from '../../src/model/storage';
import { teachingSamples } from '../fixtures/teaching';

const root = join(__dirname, '..', '..', 'samples');

it('수업용 예제 파일이 생성 코드와 같다 (다시 만들기: GEN_SAMPLES=1 pnpm test)', () => {
  const ff = parseBundle(readFileSync(join(root, '기억 소자', '플립플롭 모음.json'), 'utf8'));
  if (!ff.ok) throw new Error(ff.error);
  for (const s of teachingSamples(ff.data.library)) {
    const doc = JSON.parse(serializeBundle({}, s.circuit, null));
    const text = JSON.stringify({ format: doc.format, version: doc.version, title: s.title, description: s.description, ...doc }, null, 2) + '\n';
    const path = join(root, s.file);
    if (process.env.GEN_SAMPLES) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    } else {
      expect(existsSync(path), s.file).toBe(true);
      expect(readFileSync(path, 'utf8'), s.file).toBe(text);
    }
  }
});
