import { useEffect, useState } from 'react';
import { decodeShare, SHARE_WARN_LENGTH, shareCodeFrom, shareUrl } from '../../model/share';
import { parseBundle } from '../../model/storage';
import { useUi } from '../../store/uiStore';
import { currentBundle } from '../Palette/Palette';
import { Modal } from './Modal';

/** 링크로 열었을 때: 해시를 지우고, 읽을 수 있으면 4.3절 가져오기 대화상자로 */
export async function openShareLink(loc: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location): Promise<void> {
  const code = shareCodeFrom(loc.hash);
  if (code === null) return;
  history.replaceState(null, '', loc.pathname + loc.search);
  const ui = useUi.getState();
  try {
    const r = parseBundle(await decodeShare(code));
    if (!r.ok) throw new Error(`파일 검증에 실패했습니다. ${r.error}`);
    ui.setPendingImport(r.data);
  } catch (e) {
    ui.setMessage({ title: '공유 링크를 열 수 없습니다', body: (e as Error).message });
  }
}

export function ShareDialog() {
  const close = () => useUi.getState().setShareOpen(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const { json } = currentBundle('share');
    void shareUrl(json, `${location.origin}${location.pathname}`).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // 클립보드 권한이 없으면 입력란을 선택해 직접 복사하게 한다
      document.querySelector<HTMLInputElement>('.share-url')?.select();
    }
  };

  return (
    <Modal
      title="공유 링크"
      onClose={close}
      footer={
        <>
          <button type="button" className="text-button" onClick={close}>
            닫기
          </button>
          <button type="button" className="text-button primary" disabled={!url} onClick={copy}>
            {copied ? '복사됨' : '링크 복사'}
          </button>
        </>
      }
    >
      <p className="small">지금 회로와 회로가 쓰는 칩이 링크에 모두 들어갑니다. 받은 사람은 링크를 열고 가져오기를 확인하면 됩니다. 계정이나 서버는 필요 없습니다.</p>
      <input className="field share-url" readOnly aria-label="공유 링크" value={url ?? '만드는 중…'} onFocus={(e) => e.target.select()} />
      {url && (
        <p className={`small ${url.length > SHARE_WARN_LENGTH ? 'warn' : 'muted'}`} data-testid="share-length">
          {url.length.toLocaleString()}자
          {url.length > SHARE_WARN_LENGTH && ' · 링크가 길어 메신저 등에서 잘릴 수 있습니다. 팔레트의 내보내기(JSON)를 권합니다.'}
        </p>
      )}
    </Modal>
  );
}
