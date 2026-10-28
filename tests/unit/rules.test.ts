import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC).filter((f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.ts$/.test(f));
const rel = (f: string) => relative(SRC, f).split(sep).join('/');

describe('CLAUDE.md 규칙', () => {
  it('규칙 1: src/sim은 React/DOM/스토어를 import하지 않는다', () => {
    for (const f of files.filter((f) => rel(f).startsWith('sim/'))) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/from ['"](react|react-dom|zustand)/);
      expect(text, rel(f)).not.toMatch(/from ['"]\.\.\/(ui|store)\//);
      expect(text, rel(f)).not.toMatch(/\b(document|window)\./);
    }
  });

  it('규칙 8: 색은 tokens.css에서만 정의한다', () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const fn = /\b(rgba?|hsla?)\(/;
    for (const f of files.filter((f) => rel(f) !== 'theme/tokens.css')) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(hex);
      expect(text, rel(f)).not.toMatch(fn);
    }
  });
});
