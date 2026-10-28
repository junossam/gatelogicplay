import { useSaveStatus } from '../../store/autosave';
import { useEditor } from '../../store/editorStore';

const STATUS_TEXT = { saved: '저장됨', saving: '저장 중…', error: '저장 실패' } as const;

export function Header() {
  const status = useSaveStatus();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  return (
    <header className="header">
      <div className="logo">LogicLab</div>
      <nav className="breadcrumb" aria-label="이동 경로">
        <span>내 칩</span>
        <span aria-hidden="true">/</span>
        <span className="current">작업 공간</span>
      </nav>
      <span className={`save-badge ${status}`} role="status" data-testid="save-status">
        {STATUS_TEXT[status]}
      </span>
      <div className="header-actions">
        <button type="button" className="icon-button" aria-label="실행 취소" title="실행 취소 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          ↶
        </button>
        <button type="button" className="icon-button" aria-label="다시 실행" title="다시 실행 (Shift+Ctrl+Z)" disabled={!canRedo} onClick={redo}>
          ↷
        </button>
      </div>
    </header>
  );
}
