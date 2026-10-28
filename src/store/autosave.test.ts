import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspace, WORKSPACE_KEY } from '../model/storage';
import { AUTOSAVE_DELAY_MS, saveStatusStore, startAutosave } from './autosave';
import { createEditorStore } from './editorStore';

function memoryStorage() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('자동 저장', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('편집 후 1초 동안 추가 편집이 없으면 저장하고 배지를 바꾼다', () => {
    const kv = memoryStorage();
    const store = createEditorStore();
    const stop = startAutosave(store, kv);

    store.getState().addPart('AND', 0, 0);
    expect(saveStatusStore.getState().status).toBe('saving');
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100);
    store.getState().addPart('LED', 5, 0); // 추가 편집 → 타이머 재시작
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100);
    expect(kv.map.has(WORKSPACE_KEY)).toBe(false);

    vi.advanceTimersByTime(200);
    expect(saveStatusStore.getState().status).toBe('saved');
    expect(loadWorkspace(kv)).toEqual(store.getState().circuit);
    stop();
  });

  it('선택만 바뀌면 저장하지 않는다', () => {
    const kv = memoryStorage();
    const store = createEditorStore({ parts: [{ id: 'and1', kind: { type: 'primitive', kind: 'AND' }, x: 0, y: 0 }], wires: [] });
    const stop = startAutosave(store, kv);
    store.getState().setSelection({ parts: ['and1'] });
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2);
    expect(kv.map.has(WORKSPACE_KEY)).toBe(false);
    stop();
  });

  it('드래그 중에는 저장을 미룬다', () => {
    const kv = memoryStorage();
    const store = createEditorStore();
    const stop = startAutosave(store, kv);
    store.getState().addPart('AND', 0, 0);
    store.getState().beginDrag();
    store.getState().dragBy(2, 0);
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS * 3);
    expect(kv.map.has(WORKSPACE_KEY)).toBe(false);
    store.getState().endDrag();
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(loadWorkspace(kv).parts[0]).toMatchObject({ x: 2 });
    stop();
  });
});
