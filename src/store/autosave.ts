import { createStore, useStore } from 'zustand';
import { saveLibrary, saveWorkspace, STORAGE_WARN_BYTES } from '../model/storage';
import { workspaceOf, type EditorState, type EditorStore } from './editorStore';

export type SaveStatus = 'saved' | 'saving' | 'error';

export const saveStatusStore = createStore<{ status: SaveStatus; bytes: number }>(() => ({ status: 'saved', bytes: 0 }));

export function useSaveStatus(): SaveStatus {
  return useStore(saveStatusStore, (s) => s.status);
}

export function useStorageWarning(): boolean {
  return useStore(saveStatusStore, (s) => s.bytes > STORAGE_WARN_BYTES);
}

export const AUTOSAVE_DELAY_MS = 1000;

type KV = Pick<Storage, 'setItem'>;

/** 작업 공간·라이브러리·열린 칩을 저장한다 */
export function saveAll(kv: KV, state: EditorState): void {
  saveWorkspace(kv, workspaceOf(state), state.openChipId);
  saveLibrary(kv, state.library);
}

const persisted = (s: EditorState) => [workspaceOf(s), s.library, s.openChipId] as const;

/** 편집 후 1초 동안 추가 편집이 없으면 저장한다 (SPEC 10장). 드래그 중에는 끝날 때까지 기다린다. */
export function startAutosave(store: EditorStore, kv: KV, measure?: () => number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const setStatus = (status: SaveStatus) => saveStatusStore.setState({ status });

  const flush = () => {
    const state = store.getState();
    if (state.dragBase) {
      timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
      return;
    }
    try {
      saveAll(kv, state);
      saveStatusStore.setState({ status: 'saved', bytes: measure?.() ?? 0 });
    } catch {
      setStatus('error');
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    const a = persisted(state);
    const b = persisted(prev);
    if (a.every((v, i) => v === b[i])) return;
    setStatus('saving');
    clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
  });

  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}
