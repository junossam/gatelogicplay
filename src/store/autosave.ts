import { createStore, useStore } from 'zustand';
import { saveWorkspace } from '../model/storage';
import type { EditorStore } from './editorStore';

export type SaveStatus = 'saved' | 'saving' | 'error';

export const saveStatusStore = createStore<{ status: SaveStatus }>(() => ({ status: 'saved' }));

export function useSaveStatus(): SaveStatus {
  return useStore(saveStatusStore, (s) => s.status);
}

export const AUTOSAVE_DELAY_MS = 1000;

/** 편집 후 1초 동안 추가 편집이 없으면 저장한다 (SPEC 10장). 드래그 중에는 끝날 때까지 기다린다. */
export function startAutosave(store: EditorStore, kv: Pick<Storage, 'setItem'>): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const setStatus = (status: SaveStatus) => saveStatusStore.setState({ status });

  const flush = () => {
    const { circuit, dragBase } = store.getState();
    if (dragBase) {
      timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
      return;
    }
    try {
      saveWorkspace(kv, circuit);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.circuit === prev.circuit) return;
    setStatus('saving');
    clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
  });

  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}
