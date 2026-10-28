import { useSaveStatus } from '../../store/autosave';
import { useEditor } from '../../store/editorStore';
import { MAX_SPEED, MIN_SPEED, simActions, useSim } from '../../store/simStore';

const STATUS_TEXT = { saved: '저장됨', saving: '저장 중…', error: '저장 실패' } as const;

export function Header() {
  const status = useSaveStatus();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const running = useSim((s) => s.running);
  const speed = useSim((s) => s.speed);
  const simError = useSim((s) => s.error);

  return (
    <header className="header">
      <div className="logo">LogicLab</div>
      <nav className="breadcrumb" aria-label="이동 경로">
        <span className="current">작업 공간</span>
      </nav>
      <span className={`save-badge ${status}`} role="status" data-testid="save-status">
        {STATUS_TEXT[status]}
      </span>

      <div className="sim-controls">
        <button
          type="button"
          className="icon-button"
          aria-label={running ? '일시정지' : '실행'}
          title={running ? '일시정지 (Space)' : '실행 (Space)'}
          disabled={!!simError}
          onClick={simActions.toggle}
          data-testid="run-toggle"
        >
          {running ? '❚❚' : '▶'}
        </button>
        <button type="button" className="icon-button" aria-label="한 틱 진행" title="한 틱 진행 (.)" disabled={!!simError} onClick={simActions.step}>
          ⇥
        </button>
        <button type="button" className="icon-button" aria-label="초기화" title="모든 Net을 0으로" onClick={simActions.reset}>
          ↺
        </button>
        <label className="speed">
          <span>속도</span>
          <input
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            value={speed}
            onChange={(e) => simActions.setSpeed(Number(e.target.value))}
            aria-label="시뮬레이션 속도"
          />
          <output>{speed}Hz</output>
        </label>
      </div>

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
