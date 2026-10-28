import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadWorkspace, saveWorkspace } from './model/storage';
import { saveStatusStore, startAutosave } from './store/autosave';
import { editorStore } from './store/editorStore';
import './theme/tokens.css';
import './theme/app.css';

editorStore.getState().load(loadWorkspace(localStorage));
startAutosave(editorStore, localStorage);

// 1초 대기 중에 페이지를 떠나면 바로 저장
window.addEventListener('pagehide', () => {
  if (saveStatusStore.getState().status === 'saving') saveWorkspace(localStorage, editorStore.getState().circuit);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
