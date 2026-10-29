import { useSaveStatus, useStorageWarning } from '../../store/autosave';
import { editorStore, isChipDirty, useEditor, viewTarget } from '../../store/editorStore';
import { MAX_SPEED, MIN_SPEED, simActions, useSim } from '../../store/simStore';
import { useUi } from '../../store/uiStore';
import { challengeById } from '../../model/challenges';
import { exitChallenge } from '../challenges/actions';
import { confirmLeaveChip } from '../Palette/Palette';

const STATUS_TEXT = { saved: '저장됨', saving: '저장 중…', error: '저장 실패' } as const;

function Breadcrumb() {
  const openChipId = useEditor((s) => s.openChipId);
  const library = useEditor((s) => s.library);
  const circuit = useEditor((s) => s.circuit);
  const viewPath = useEditor((s) => s.viewPath);
  const { chain } = viewTarget({ circuit, library, viewPath });
  const challengeId = useEditor((s) => s.openChallengeId);
  const root = challengeId ? challengeById(challengeId)?.title : openChipId ? library[openChipId]?.name : null;
  const goRoot = () => editorStore.getState().setViewPath([]);

  return (
    <nav className="breadcrumb" aria-label="이동 경로">
      <ol>
        {root ? (
          <>
            <li>
              <button
                type="button"
                className="crumb"
                onClick={() => (challengeId ? exitChallenge() : confirmLeaveChip(() => editorStore.getState().closeChip()))}
                title="작업 공간으로"
              >
                {challengeId ? '챌린지' : '내 칩'}
              </button>
            </li>
            <li>
              {chain.length ? (
                <button type="button" className="crumb" onClick={goRoot}>
                  {root}
                </button>
              ) : (
                <span className="current" aria-current="page">
                  {root}
                </span>
              )}
            </li>
          </>
        ) : (
          <li>
            {chain.length ? (
              <button type="button" className="crumb" onClick={goRoot}>
                작업 공간
              </button>
            ) : (
              <span className="current" aria-current="page">
                작업 공간
              </span>
            )}
          </li>
        )}
        {chain.map((def, i) =>
          i === chain.length - 1 ? (
            <li key={i}>
              <span className="current" aria-current="page">
                {def.name}
              </span>
            </li>
          ) : (
            <li key={i}>
              <button type="button" className="crumb" onClick={() => editorStore.getState().setViewPath(viewPath.slice(0, i + 1))}>
                {def.name}
              </button>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

export function Header() {
  const status = useSaveStatus();
  const storageWarn = useStorageWarning();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useEditor(isChipDirty);
  const openChipId = useEditor((s) => s.openChipId);
  const challengeId = useEditor((s) => s.openChallengeId);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const running = useSim((s) => s.running);
  const speed = useSim((s) => s.speed);
  const simError = useSim((s) => s.error);
  const setTruthOpen = useUi((s) => s.setTruthOpen);
  const setSaveOpen = useUi((s) => s.setSaveOpen);

  return (
    <header className="header">
      <div className="logo">LogicLab</div>
      <Breadcrumb />
      <span className={`save-badge ${dirty ? 'dirty' : status}`} role="status" data-testid="save-status">
        {dirty ? '칩 변경 사항 저장 안 됨' : STATUS_TEXT[status]}
      </span>
      {storageWarn && (
        <span className="save-badge error" role="alert">
          저장 용량 4MB 초과 · JSON으로 내보내 두세요
        </span>
      )}

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
        <button type="button" className="text-button" onClick={() => useUi.getState().setChallengesOpen(true)}>
          챌린지
        </button>
        <button type="button" className="text-button" onClick={() => setTruthOpen(true)}>
          진리표
        </button>
        {!challengeId && (
          <button type="button" className="text-button primary" onClick={() => setSaveOpen(true)} title="칩으로 저장 (Ctrl+S)">
            칩으로 저장
          </button>
        )}
        {(openChipId || challengeId) && (
          <button
            type="button"
            className="text-button"
            onClick={() => (challengeId ? exitChallenge() : confirmLeaveChip(() => editorStore.getState().closeChip()))}
          >
            닫기
          </button>
        )}
        <button type="button" className="icon-button" aria-label="설정" title="설정" onClick={() => useUi.getState().setSettingsOpen(true)}>
          ⚙
        </button>
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
