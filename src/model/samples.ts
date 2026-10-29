// 운영자가 올려 둔 예제 (samples/ 폴더). 빌드할 때 목록(samples/index.json)을 만들고, 앱은 목록을 읽어 보여 준다.
import { z } from 'zod';
import { parseBundle } from './storage';

/** 배포 결과 안의 예제 폴더 */
export const SAMPLES_DIR = 'samples';
export const MANIFEST_FILE = 'index.json';
/** 예제 바로 열기 링크: `#sample=분류/파일.json` */
export const SAMPLE_PREFIX = '#sample=';

const entrySchema = z.object({
  /** samples/ 기준 경로 (분류 폴더 포함) */
  file: z.string(),
  title: z.string(),
  description: z.string().optional(),
  /** 하위 폴더 이름. 맨 위에 있으면 '' */
  category: z.string(),
  /** 들어 있는 칩 이름 */
  chips: z.array(z.string()),
  /** 작업 공간 부품 수 */
  parts: z.number(),
});

export const manifestSchema = z.object({ samples: z.array(entrySchema) });

export type SampleEntry = z.infer<typeof entrySchema>;
export type SampleManifest = z.infer<typeof manifestSchema>;

/** 파일 이름 → 제목: 확장자와 앞의 정렬 번호(`01-`)를 떼고 `_`는 띄어쓰기로 */
export function titleFromFile(file: string): string {
  const base = file.split('/').pop()!;
  return base
    .replace(/(\.gatelogicplay|\.logiclab)?\.json$/i, '')
    .replace(/^\d+[-_. ]+/, '')
    .replace(/_/g, ' ')
    .trim();
}

/** 예제 경로로 쓸 수 있는지: 상대 경로, `..`·역슬래시 없음, .json으로 끝남 */
export function isSafeSamplePath(file: string): boolean {
  if (!file || file.startsWith('/') || file.includes('\\') || !/\.json$/i.test(file)) return false;
  return file.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** 예제 파일 하나를 검증하고 목록 항목을 만든다. 파일 맨 위의 `title`, `description` 문자열은 선택. */
export function describeSample(file: string, json: string): { ok: true; entry: SampleEntry } | { ok: false; error: string } {
  if (!isSafeSamplePath(file)) return { ok: false, error: `${file}: 파일 이름을 쓸 수 없습니다` };
  const r = parseBundle(json);
  if (!r.ok) return { ok: false, error: `${file}: ${r.error}` };
  const raw = JSON.parse(json) as { title?: unknown; description?: unknown };
  const slash = file.lastIndexOf('/');
  return {
    ok: true,
    entry: {
      file,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : titleFromFile(file),
      ...(typeof raw.description === 'string' && raw.description.trim() ? { description: raw.description.trim() } : {}),
      category: slash < 0 ? '' : file.slice(0, slash),
      chips: Object.values(r.data.library).map((d) => d.name),
      parts: r.data.workspace.parts.length,
    },
  };
}

/** 예제 파일들로 목록을 만든다. 분류 → 파일 이름 순. 검증에 실패한 파일은 errors로. */
export function buildManifest(files: { file: string; json: string }[]): { manifest: SampleManifest; errors: string[] } {
  const samples: SampleEntry[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const r = describeSample(f.file, f.json);
    if (r.ok) samples.push(r.entry);
    else errors.push(r.error);
  }
  samples.sort((a, b) => a.category.localeCompare(b.category, 'ko') || a.file.localeCompare(b.file, 'ko'));
  return { manifest: { samples }, errors };
}

/** `#sample=...` 해시에서 예제 경로. 없거나 쓸 수 없는 경로면 null. */
export function sampleFileFrom(hash: string): string | null {
  if (!hash.startsWith(SAMPLE_PREFIX)) return null;
  let file: string;
  try {
    file = decodeURIComponent(hash.slice(SAMPLE_PREFIX.length));
  } catch {
    return null;
  }
  return isSafeSamplePath(file) ? file : null;
}

/** 예제 파일 URL (현재 페이지 기준 상대 경로라 하위 폴더 배포에서도 동작) */
export function sampleUrl(file: string, base: string): string {
  return new URL(`${SAMPLES_DIR}/${file.split('/').map(encodeURIComponent).join('/')}`, base).href;
}

/** 예제 바로 열기 링크 */
export function sampleLink(file: string, pageUrl: string): string {
  return `${pageUrl}${SAMPLE_PREFIX}${encodeURIComponent(file)}`;
}
