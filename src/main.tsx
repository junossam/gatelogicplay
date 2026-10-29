import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadLibrary, loadOpenChipId, loadWorkspace, storageBytes } from './model/storage';
import { saveAll, saveStatusStore, startAutosave } from './store/autosave';
import { editorStore } from './store/editorStore';
import { bindSimulation } from './store/simBinding';
import { startSimLoop } from './store/simStore';
import './theme/tokens.css';
import './theme/app.css';

editorStore.getState().loadAll(loadWorkspace(localStorage), loadLibrary(localStorage), loadOpenChipId(localStorage));
saveStatusStore.setState({ bytes: storageBytes(localStorage) });
startAutosave(editorStore, localStorage, () => storageBytes(localStorage));
bindSimulation(editorStore);
startSimLoop();

// 1초 대기 중에 페이지를 떠나면 바로 저장
window.addEventListener('pagehide', () => {
  if (saveStatusStore.getState().status === 'saving') saveAll(localStorage, editorStore.getState());
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
