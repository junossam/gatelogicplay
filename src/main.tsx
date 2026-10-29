import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadLibrary, loadOpenChipId, loadWorkspace, storageBytes } from './model/storage';
import { saveAll, saveStatusStore, startAutosave } from './store/autosave';
import { editorStore } from './store/editorStore';
import { bindSimulation } from './store/simBinding';
import { startSimLoop } from './store/simStore';
import { challengeStore, loadChallenges, saveChallenges, startChallengeAutosave } from './store/challengeStore';
import { bindChallenges, startChallenge } from './ui/challenges/actions';
import { openSampleLink } from './ui/dialogs/SamplesDialog';
import { openShareLink } from './ui/dialogs/ShareDialog';
import './theme/tokens.css';
import './theme/app.css';

editorStore.getState().loadAll(loadWorkspace(localStorage), loadLibrary(localStorage), loadOpenChipId(localStorage));
saveStatusStore.setState({ bytes: storageBytes(localStorage) });
startAutosave(editorStore, localStorage, () => storageBytes(localStorage));
challengeStore.setState(loadChallenges(localStorage));
startChallengeAutosave(localStorage);
bindChallenges(editorStore);
// 새로고침 전에 풀던 챌린지로 돌아간다
const active = challengeStore.getState().active;
if (active) startChallenge(active);
bindSimulation(editorStore);
startSimLoop();
// 공유 링크나 예제 링크로 열었으면 가져오기 대화상자를 띄운다
void openShareLink();
void openSampleLink();

// 1초 대기 중에 페이지를 떠나면 바로 저장
window.addEventListener('pagehide', () => {
  if (saveStatusStore.getState().status === 'saving') saveAll(localStorage, editorStore.getState());
  saveChallenges(localStorage, challengeStore.getState());
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
