import { challengeById, starterCircuit } from '../../model/challenges';
import { challengeStore, updateProgress } from '../../store/challengeStore';
import { editorStore, type EditorStore } from '../../store/editorStore';
import { confirmLeaveChip } from '../Palette/Palette';

/** 챌린지 시작: 저장된 풀이가 있으면 이어서, 없으면 시작 회로 */
export function startChallenge(id: string) {
  const ch = challengeById(id);
  if (!ch) return;
  confirmLeaveChip(() => {
    const saved = challengeStore.getState().progress[id]?.circuit;
    editorStore.getState().openChallenge(id, saved && saved.parts.length ? saved : starterCircuit(ch));
    challengeStore.setState({ active: id });
  });
}

export function exitChallenge() {
  editorStore.getState().closeChallenge();
  challengeStore.setState({ active: null });
}

export function restartChallenge(id: string) {
  const ch = challengeById(id);
  if (!ch) return;
  const starter = starterCircuit(ch);
  editorStore.getState().openChallenge(id, starter);
  updateProgress(id, { circuit: starter });
}

/** 챌린지 중 회로가 바뀌면 진행 기록에 반영 */
export function bindChallenges(store: EditorStore): () => void {
  return store.subscribe((state, prev) => {
    if (state.openChallengeId && state.circuit !== prev.circuit) updateProgress(state.openChallengeId, { circuit: state.circuit });
  });
}
