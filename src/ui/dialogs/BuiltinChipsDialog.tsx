import { useEffect, useState } from 'react';
import { CHIPS_DIR, type SampleEntry } from '../../model/samples';
import { useEditor } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { Modal } from './Modal';
import { fetchManifest, openSample } from './SamplesDialog';

/** 운영자가 chips/ 폴더에 올려 둔 기본 제공 칩. 추가하면 칩만 내 칩에 들어온다. */
export function BuiltinChipsDialog() {
  const close = () => useUi.getState().setBuiltinChipsOpen(false);
  const library = useEditor((s) => s.library);
  const owned = new Set(Object.values(library).map((d) => d.name));
  const [state, setState] = useState<{ items: SampleEntry[] } | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchManifest(CHIPS_DIR)
      .then((items) => alive && setState({ items }))
      .catch((e: Error) => alive && setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, []);

  const items = state && 'items' in state ? state.items : [];

  return (
    <Modal title="기본 제공 칩" onClose={close} wide>
      <p className="muted small">미리 만들어 둔 칩 묶음입니다. 추가하면 내 칩에 들어오고, 작업 공간은 그대로입니다.</p>
      {state === null && <p className="muted">불러오는 중…</p>}
      {state && 'error' in state && (
        <p className="warn" role="alert">
          기본 제공 칩 목록을 불러올 수 없습니다. {state.error}
        </p>
      )}
      {state && 'items' in state && items.length === 0 && <p className="muted">아직 기본 제공 칩이 없습니다.</p>}
      {/* 분류는 카드 위 꼬리표로, 카드는 한 줄에 3개 */}
      <ul className="builtin-list">
        {items.map((s) => {
          const have = s.chips.length > 0 && s.chips.every((n) => owned.has(n));
          return (
            <li key={s.file} className="builtin-card" data-testid={`builtin-${s.file}`}>
              {s.category && <span className="builtin-tag">{s.category}</span>}
              <strong>{s.title}</strong>
              {s.description && <p className="small">{s.description}</p>}
              <div className="builtin-foot">
                <span className="builtin-count muted small" title={s.chips.join('\n')} tabIndex={0} aria-label={`칩 ${s.chips.length}개: ${s.chips.join(', ')}`}>
                  칩 {s.chips.length}개
                </span>
                {have && <span className="muted small">· 이미 있음</span>}
              </div>
              <button
                type="button"
                className="text-button primary"
                onClick={() => {
                  close();
                  void openSample(s.file, CHIPS_DIR, true);
                }}
              >
                {have ? '다시 추가' : '내 칩에 추가'}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
