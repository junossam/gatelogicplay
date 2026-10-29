// 공유 링크: 4.3절 파일(JSON)을 deflate로 압축해 base64url로 URL 해시에 넣는다 (SPEC 13장 7단계, 서버 없음)

export const SHARE_PREFIX = '#share=';
/** 이보다 길면 메신저 등에서 잘릴 수 있다고 알린다 */
export const SHARE_WARN_LENGTH = 8000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('링크에 쓸 수 없는 문자가 있습니다');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(json: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

/** 망가진 코드면 오류를 던진다 */
export async function decodeShare(code: string): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')));
  } catch (e) {
    throw new Error(`공유 링크를 읽을 수 없습니다 (${(e as Error).message || '압축 해제 실패'})`);
  }
}

export async function shareUrl(json: string, base: string): Promise<string> {
  return `${base}${SHARE_PREFIX}${await encodeShare(json)}`;
}

/** URL 해시에서 공유 코드를 꺼낸다. 없으면 null */
export function shareCodeFrom(hash: string): string | null {
  return hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null;
}
