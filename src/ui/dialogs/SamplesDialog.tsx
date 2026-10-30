import { useEffect, useState } from 'react';
import { MANIFEST_FILE, manifestSchema, sampleFileFrom, sampleLink, SAMPLES_DIR, sampleUrl, type SampleEntry } from '../../model/samples';
import { parseBundle } from '../../model/storage';
import { useUi } from '../../store/uiStore';
import { Modal } from './Modal';

const pageUrl = () => `${location.origin}${location.pathname}`;

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`파일을 받을 수 없습니다 (HTTP ${res.status})`);
  return res.text();
}

/**
 * 예제(또는 기본 제공 칩) 파일을 받아 검증한 뒤 가져오기 대화상자로 (SPEC 4.3).
 * chipsOnly면 작업 공간은 빼고 칩만 가져온다.
 */
export async function openSample(file: string, dir: string = SAMPLES_DIR, chipsOnly = false): Promise<void> {
  const ui = useUi.getState();
  try {
    const r = parseBundle(await fetchText(sampleUrl(file, document.baseURI, dir)));
    if (!r.ok) throw new Error(`파일 검증에 실패했습니다. ${r.error}`);
    ui.setPendingImport(chipsOnly ? { ...r.data, workspace: { parts: [], wires: [] }, openChipId: null } : r.data);
  } catch (e) {
    ui.setMessage({ title: chipsOnly ? '칩을 가져올 수 없습니다' : '예제를 열 수 없습니다', body: (e as Error).message });
  }
}

/** 폴더의 목록 파일(index.json)을 받는다 */
export async function fetchManifest(dir: string): Promise<SampleEntry[]> {
  const r = manifestSchema.safeParse(JSON.parse(await fetchText(new URL(`${dir}/${MANIFEST_FILE}`, document.baseURI).href)));
  if (!r.success) throw new Error('목록 형식이 올바르지 않습니다');
  return r.data.samples;
}

/** `#sample=` 링크로 열었을 때: 해시를 지우고 그 예제를 가져오기 대화상자로 */
export async function openSampleLink(loc: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location): Promise<void> {
  if (!loc.hash.startsWith('#sample=')) return;
  const file = sampleFileFrom(loc.hash);
  history.replaceState(null, '', loc.pathname + loc.search);
  if (file === null) {
    useUi.getState().setMessage({ title: '예제를 열 수 없습니다', body: '링크의 예제 경로가 올바르지 않습니다.' });
    return;
  }
  await openSample(file);
}

function SampleCard({ sample }: { sample: SampleEntry }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sampleLink(sample.file, pageUrl()));
      setCopied(true);
    } catch {
      useUi.getState().setMessage({ title: '복사할 수 없습니다', body: sampleLink(sample.file, pageUrl()) });
    }
  };
  return (
    <li className="sample-card" data-testid={`sample-${sample.file}`}>
      <strong>{sample.title}</strong>
      {sample.description && <p className="small">{sample.description}</p>}
      <p className="muted small">
        칩 {sample.chips.length}개{sample.parts ? ` · 부품 ${sample.parts}개` : ''}
        {sample.chips.length > 0 && ` · ${sample.chips.join(', ')}`}
      </p>
      <div className="sample-actions">
        <button
          type="button"
          className="text-button primary"
          onClick={() => {
            useUi.getState().setSamplesOpen(false);
            void openSample(sample.file);
          }}
        >
          열기
        </button>
        <button type="button" className="text-button" onClick={copy} aria-label={`${sample.title} 링크 복사`}>
          {copied ? '복사됨' : '링크 복사'}
        </button>
      </div>
    </li>
  );
}

/** 운영자가 올려 둔 예제 목록 (samples/index.json) */
export function SamplesDialog() {
  const close = () => useUi.getState().setSamplesOpen(false);
  const [state, setState] = useState<{ samples: SampleEntry[] } | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchManifest(SAMPLES_DIR)
      .then((samples) => alive && setState({ samples }))
      .catch((e: Error) => alive && setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, []);

  const groups = new Map<string, SampleEntry[]>();
  if (state && 'samples' in state) for (const s of state.samples) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
  const showHeaders = [...groups.keys()].some((c) => c !== '');

  return (
    <Modal title="예제" onClose={close} wide>
      <p className="muted small">
        미리 만들어 둔 회로입니다. 열면 가져오기 창이 뜨고, 칩은 내 칩에 추가됩니다. 고친 회로는 내보내기로 내 컴퓨터에 저장하세요.
      </p>
      {state === null && <p className="muted">불러오는 중…</p>}
      {state && 'error' in state && (
        <p className="warn" role="alert">
          예제 목록을 불러올 수 없습니다. {state.error}
        </p>
      )}
      {state && 'samples' in state && state.samples.length === 0 && <p className="muted">아직 올라온 예제가 없습니다.</p>}
      {[...groups.entries()].map(([category, list]) => (
        <section key={category} className="sample-group" data-testid={`sample-group-${category || '기타'}`}>
          {showHeaders && <h3 className="panel-title">{category || '기타'}</h3>}
          <ul className="sample-list">
            {list.map((s) => (
              <SampleCard key={s.file} sample={s} />
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
