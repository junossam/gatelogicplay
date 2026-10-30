// chips/의 확장형 기본 제공 칩 파일이 tests/fixtures/builtin.ts와 같은지. GEN_SAMPLES=1 이면 다시 만든다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { parseBundle, serializeBundle } from '../../src/model/storage';
import { builtinChipFiles } from '../fixtures/builtin';

const root = join(__dirname, '..', '..');

it('확장형 기본 제공 칩 파일이 생성 코드와 같다 (다시 만들기: GEN_SAMPLES=1 pnpm test)', () => {
  const ff = parseBundle(readFileSync(join(root, 'samples', '기억 소자', '플립플롭 모음.json'), 'utf8'));
  if (!ff.ok) throw new Error(ff.error);
  for (const f of builtinChipFiles(ff.data.library)) {
    const doc = JSON.parse(serializeBundle(f.library, { parts: [], wires: [] }, null));
    const text = JSON.stringify({ format: doc.format, version: doc.version, title: f.title, description: f.description, ...doc }, null, 2) + '\n';
    const path = join(root, 'chips', f.file);
    if (process.env.GEN_SAMPLES) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    } else {
      expect(existsSync(path), f.file).toBe(true);
      expect(readFileSync(path, 'utf8'), f.file).toBe(text);
    }
  }
});
