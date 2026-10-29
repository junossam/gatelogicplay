import { describe, expect, it } from 'vitest';
import { harness, nestedLibrary, register4Chip } from '../../tests/fixtures/circuits';
import { decodeShare, encodeShare, shareCodeFrom, shareUrl } from './share';
import { parseBundle, serializeBundle } from './storage';

describe('공유 링크', () => {
  it('묶음 파일을 압축해 URL에 넣고 그대로 되돌린다 (한글 이름 포함)', async () => {
    const json = serializeBundle(nestedLibrary(), harness(register4Chip(), 'reg'), null);
    const url = await shareUrl(json, 'https://example.test/app/');
    expect(url.startsWith('https://example.test/app/#share=')).toBe(true);
    const code = shareCodeFrom(new URL(url).hash)!;
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    // 압축 덕분에 원본보다 훨씬 짧다
    expect(code.length).toBeLessThan(json.length / 3);
    const back = await decodeShare(code);
    expect(back).toBe(json);
    expect(parseBundle(back).ok).toBe(true);
  });

  it('망가진 코드는 거부한다', async () => {
    const code = await encodeShare('{"format":"logiclab"}');
    await expect(decodeShare(code.slice(0, -6) + 'AAAAAA')).rejects.toThrow('공유 링크를 읽을 수 없습니다');
    await expect(decodeShare('잘못된!')).rejects.toThrow('공유 링크를 읽을 수 없습니다');
  });

  it('공유 해시가 아니면 null', () => {
    expect(shareCodeFrom('#other')).toBeNull();
    expect(shareCodeFrom('')).toBeNull();
    expect(shareCodeFrom('#share=abc')).toBe('abc');
  });
});
