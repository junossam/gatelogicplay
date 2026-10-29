import { z } from 'zod';
import { createStore, useStore } from 'zustand';
import { circuitSchema, FORMAT, VERSION } from '../model/schema';
import type { Circuit } from '../sim/types';

export const CHALLENGES_KEY = 'logiclab:v1:challenges';

export interface Progress {
  circuit: Circuit;
  solved: boolean;
  /** 통과한 회로 중 가장 적은 게이트 수 */
  bestGates: number | null;
}

const fileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  progress: z.record(z.string(), z.object({ circuit: circuitSchema, solved: z.boolean(), bestGates: z.number().nullable() })),
  /** 새로고침 전에 열려 있던 챌린지 */
  active: z.string().nullable(),
});

interface State {
  progress: Record<string, Progress>;
  active: string | null;
}

export const challengeStore = createStore<State>(() => ({ progress: {}, active: null }));

export function useChallenges<T>(selector: (s: State) => T): T {
  return useStore(challengeStore, selector);
}

export function updateProgress(id: string, patch: Partial<Progress>) {
  const { progress } = challengeStore.getState();
  const prev = progress[id] ?? { circuit: { parts: [], wires: [] }, solved: false, bestGates: null };
  const next = { ...prev, ...patch };
  if ((Object.keys(patch) as (keyof Progress)[]).every((k) => prev[k] === next[k])) return;
  challengeStore.setState({ progress: { ...progress, [id]: next } });
}

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function loadChallenges(kv: KV): State {
  try {
    const r = fileSchema.safeParse(JSON.parse(kv.getItem(CHALLENGES_KEY) ?? 'null'));
    if (r.success) return { progress: r.data.progress, active: r.data.active };
  } catch {
    // 깨진 진행 기록은 버리고 새로 시작
  }
  return { progress: {}, active: null };
}

export function saveChallenges(kv: Pick<Storage, 'setItem'>, state: State) {
  kv.setItem(CHALLENGES_KEY, JSON.stringify({ format: FORMAT, version: VERSION, progress: state.progress, active: state.active }));
}

/** 진행 기록이 바뀌면 1초 뒤 저장 (작업 공간 자동 저장과 같은 간격) */
export function startChallengeAutosave(kv: Pick<Storage, 'setItem'>): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = challengeStore.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => saveChallenges(kv, challengeStore.getState()), 1000);
  });
  return () => {
    unsub();
    clearTimeout(timer);
  };
}
