import { useRef } from 'react';
import { useSaveStatus, useStorageWarning } from '../../store/autosave';
import { editorStore, isChipDirty, useEditor, viewTarget } from '../../store/editorStore';
import { MAX_SPEED, MIN_SPEED, simActions, useSim } from '../../store/simStore';
import { useUi } from '../../store/uiStore';
import { challengeById } from '../../model/challenges';
import { exitChallenge } from '../challenges/actions';
import { confirmLeaveChip, exportCurrent, importBundleFile } from '../Palette/Palette';
import { MenuBar, type MenuDef } from './MenuBar';

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
  // 칩 내부를 읽기 전용으로 보는 중이면 편집 메뉴를 막는다
  const readOnly = useEditor((s) => s.viewPath.length > 0);
  const hasSelection = useEditor((s) => s.selection.parts.length + s.selection.wires.length + s.selection.notes.length > 0);
  const hasParts = useEditor((s) => s.selection.parts.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const running = useSim((s) => s.running);
  const speed = useSim((s) => s.speed);
  const simError = useSim((s) => s.error);
  const fileRef = useRef<HTMLInputElement>(null);
  const ui = useUi.getState;
  const library = useEditor((s) => s.library);
  const addNote = () => {
    const c = ui().canvasCenter();
    const id = editorStore.getState().addNote(c.x - 5, c.y - 1);
    ui().setEditingNote(id);
  };
  const confirmClear = () => {
    const c = editorStore.getState().circuit;
    ui().setMessage({
      title: openChipId ? '칩 회로 비우기' : '작업 공간 비우기',
      body: `${openChipId ? '편집 중인 칩' : '작업 공간'}의 부품 ${c.parts.length}개, 전선 ${c.wires.length}개와 그룹·메모를 모두 지웁니다. 내 칩은 그대로 남고, 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.`,
      confirmLabel: '비우기',
      danger: true,
      onConfirm: () => editorStore.getState().clearCircuit(),
    });
  };
  const confirmResetAll = () => {
    ui().setMessage({
      title: '모두 초기화',
      body: `작업 공간과 내 칩 ${Object.keys(library).length}개를 모두 지웁니다. 되돌릴 수 없으니 필요하면 먼저 내보내기로 저장해 두세요. (챌린지 기록은 남습니다.)`,
      confirmLabel: '모두 지우기',
      danger: true,
      onConfirm: () => editorStore.getState().resetAll(),
    });
  };
  const closeDoc = () => (challengeId ? exitChallenge() : confirmLeaveChip(() => editorStore.getState().closeChip()));

  // 자주 쓰지 않는 기능은 메뉴로, 실행 조작·실행 취소·가져오기/내보내기·칩으로 저장만 버튼으로 둔다
  const menus: MenuDef[] = [
    {
      label: '파일',
      items: [
        { label: '가져오기', run: () => fileRef.current?.click() },
        { label: '내보내기', run: exportCurrent },
        null,
        { label: '예제', disabled: !!challengeId, run: () => ui().setSamplesOpen(true) },
        { label: '공유 링크', disabled: !!challengeId, run: () => ui().setShareOpen(true) },
        null,
        { label: openChipId ? '칩 회로 비우기' : '작업 공간 비우기', disabled: !!challengeId || readOnly, run: confirmClear },
        { label: '모두 초기화 (내 칩까지)', disabled: !!challengeId, run: confirmResetAll },
      ],
    },
    {
      label: '편집',
      items: [
        { label: '실행 취소', shortcut: 'Ctrl+Z', disabled: !canUndo, run: undo },
        { label: '다시 실행', shortcut: 'Ctrl+Shift+Z', disabled: !canRedo, run: redo },
        null,
        { label: '선택 회전', shortcut: 'R', disabled: readOnly || !hasParts, run: () => editorStore.getState().rotateSelection() },
        { label: '선택 삭제', shortcut: 'Delete', disabled: readOnly || !hasSelection, run: () => editorStore.getState().deleteSelection() },
        null,
        { label: '선택을 그룹으로 묶기', shortcut: 'Ctrl+Shift+G', disabled: readOnly || !hasParts, run: () => ui().setGroupEdit({ create: true }) },
        { label: '메모 추가', disabled: readOnly, run: addNote },
        null,
        {
          label: '선택 범위를 칩으로',
          shortcut: 'Ctrl+G',
          disabled: readOnly || !hasParts || !!challengeId,
          run: () => editorStore.getState().makeChipFromSelection(),
        },
        { label: '칩으로 저장', shortcut: 'Ctrl+S', disabled: !!challengeId, run: () => ui().setSaveOpen(true) },
        ...(openChipId || challengeId ? [{ label: challengeId ? '챌린지 닫기' : '칩 편집 닫기', run: closeDoc }] : []),
      ],
    },
    {
      label: '시뮬레이션',
      items: [
        { label: running ? '일시정지' : '실행', shortcut: 'Space', disabled: !!simError, run: simActions.toggle },
        { label: '한 틱 진행', shortcut: '.', disabled: !!simError, run: simActions.step },
        { label: '초기화 (모든 Net을 0으로)', run: simActions.reset },
      ],
    },
    {
      label: '도구',
      items: [
        { label: '진리표', run: () => ui().setTruthOpen(true) },
        { label: '챌린지', run: () => ui().setChallengesOpen(true) },
        null,
        { label: '설정', run: () => ui().setSettingsOpen(true) },
      ],
    },
  ];

  return (
    <header className="header">
      <div className="logo">GateLogicPlay</div>
      <MenuBar menus={menus} />
      <span className="header-divider" aria-hidden="true" />
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
        <button type="button" className="icon-button" aria-label="실행 취소" title="실행 취소 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          ↶
        </button>
        <button type="button" className="icon-button" aria-label="다시 실행" title="다시 실행 (Shift+Ctrl+Z)" disabled={!canRedo} onClick={redo}>
          ↷
        </button>
        <span className="header-divider" aria-hidden="true" />
        <button type="button" className="text-button" onClick={() => fileRef.current?.click()} title="JSON 파일에서 회로와 칩 불러오기">
          가져오기
        </button>
        <button type="button" className="text-button" onClick={exportCurrent} title="회로와 칩을 JSON 파일로 내 컴퓨터에 저장">
          내보내기
        </button>
        {(openChipId || challengeId) && (
          <button type="button" className="text-button" onClick={closeDoc}>
            닫기
          </button>
        )}
        {!challengeId && (
          <button type="button" className="text-button primary" onClick={() => ui().setSaveOpen(true)} title="칩으로 저장 (Ctrl+S)">
            칩으로 저장
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBundleFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
