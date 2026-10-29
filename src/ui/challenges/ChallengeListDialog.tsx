import { allowedGates, CHALLENGES } from '../../model/challenges';
import { useChallenges } from '../../store/challengeStore';
import { useEditor } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { Modal } from '../dialogs/Modal';
import { startChallenge } from './actions';

export function ChallengeListDialog() {
  const close = () => useUi.getState().setChallengesOpen(false);
  const progress = useChallenges((s) => s.progress);
  const current = useEditor((s) => s.openChallengeId);
  const solved = CHALLENGES.filter((c) => progress[c.id]?.solved).length;

  return (
    <Modal title="챌린지" onClose={close} wide>
      <p className="muted small">
        목표 진리표에 맞는 회로를 만들면 자동으로 채점됩니다. {solved}/{CHALLENGES.length}개 통과
      </p>
      <ul className="challenge-list">
        {CHALLENGES.map((c) => {
          const p = progress[c.id];
          return (
            <li key={c.id} className={`challenge-card${p?.solved ? ' solved' : ''}`} data-testid={`challenge-${c.id}`}>
              <div className="challenge-head">
                <strong>{c.title}</strong>
                {p?.solved && <span className="badge ok">통과 · 게이트 {p.bestGates}개</span>}
              </div>
              <p className="small">{c.description}</p>
              <p className="muted small">
                입력 {c.inputs.join(', ')} → 출력 {c.outputs.join(', ')} · 쓸 수 있는 게이트 {c.allowed ? allowedGates(c).join(', ') : '전부'} · 모범 답안 {c.par}개
              </p>
              <button
                type="button"
                className="text-button primary"
                disabled={current === c.id}
                onClick={() => {
                  close();
                  startChallenge(c.id);
                }}
              >
                {current === c.id ? '푸는 중' : p && p.circuit.wires.length ? '이어서 풀기' : '시작'}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
