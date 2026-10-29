import { useState } from 'react';
import { importConflicts, type ConflictMode } from '../../model/library';
import { editorStore, useEditor } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { Modal } from './Modal';

const MODES: { value: ConflictMode; label: string; desc: string }[] = [
  { value: 'overwrite', label: '덮어쓰기', desc: '가져온 칩으로 바꿉니다. 이 칩을 쓰는 곳에도 반영됩니다.' },
  { value: 'copy', label: '복사본으로 저장', desc: '새 칩 "이름 (2)"로 저장합니다.' },
  { value: 'skip', label: '건너뛰기', desc: '지금 있는 칩을 그대로 둡니다.' },
];

/** 가져오기: 같은 id가 이미 있으면 덮어쓰기 / 복사본 / 건너뛰기 중 고른다 (SPEC 4.3) */
export function ImportDialog() {
  const bundle = useUi((s) => s.pendingImport)!;
  const close = () => useUi.getState().setPendingImport(null);
  const library = useEditor((s) => s.library);
  const conflicts = importConflicts(library, bundle.library);
  const hasWorkspace = bundle.workspace.parts.length > 0;
  const [mode, setMode] = useState<ConflictMode>('copy');
  const [withWorkspace, setWithWorkspace] = useState(hasWorkspace);
  const [error, setError] = useState<string | null>(null);
  const count = Object.keys(bundle.library).length;

  const apply = () => {
    try {
      editorStore.getState().importLibrary(bundle.library, mode, withWorkspace ? bundle.workspace : undefined);
      if (bundle.openChipId && !withWorkspace && editorStore.getState().library[bundle.openChipId] && mode !== 'copy') {
        editorStore.getState().openChip(bundle.openChipId);
      }
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal
      title="가져오기"
      onClose={close}
      footer={
        <>
          <button type="button" className="text-button" onClick={close}>
            취소
          </button>
          <button type="button" className="text-button primary" onClick={apply}>
            가져오기
          </button>
        </>
      }
    >
      <p>칩 {count}개{hasWorkspace ? `, 작업 공간(부품 ${bundle.workspace.parts.length}개)` : ''}가 들어 있습니다.</p>
      {conflicts.length > 0 && (
        <fieldset className="conflicts" data-testid="import-conflicts">
          <legend>같은 칩이 이미 있습니다: {conflicts.map((d) => d.name).join(', ')}</legend>
          {MODES.map((m) => (
            <label key={m.value} className="radio">
              <input type="radio" name="conflict" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
              <span>
                <strong>{m.label}</strong> <span className="muted small">{m.desc}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {hasWorkspace && (
        <label className="check">
          <input type="checkbox" checked={withWorkspace} onChange={(e) => setWithWorkspace(e.target.checked)} />
          작업 공간도 불러오기 (지금 작업 공간을 바꿉니다)
        </label>
      )}
      {error && (
        <p className="warn small" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function MessageDialog() {
  const message = useUi((s) => s.message)!;
  const close = () => useUi.getState().setMessage(null);
  return (
    <Modal
      title={message.title}
      onClose={close}
      footer={
        message.onConfirm ? (
          <>
            <button type="button" className="text-button" onClick={close}>
              취소
            </button>
            <button
              type="button"
              className={`text-button ${message.danger ? 'danger' : 'primary'}`}
              onClick={() => {
                close();
                message.onConfirm!();
              }}
            >
              {message.confirmLabel ?? '확인'}
            </button>
          </>
        ) : (
          <button type="button" className="text-button primary" onClick={close}>
            확인
          </button>
        )
      }
    >
      <p>{message.body}</p>
      {message.items && (
        <ul>
          {message.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
