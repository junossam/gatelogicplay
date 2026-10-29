import { create } from 'zustand';

export const SETTINGS_KEY = 'logiclab:v1:settings';

interface Settings {
  /** 선택 부품 CLOCK을 팔레트에 보일지 (SPEC 1.1) */
  clockEnabled: boolean;
}

function load(): Settings {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { clockEnabled: raw.clockEnabled ?? true };
  } catch {
    return { clockEnabled: true };
  }
}

export const useSettings = create<Settings & { setClockEnabled(v: boolean): void }>((set, get) => ({
  ...load(),
  setClockEnabled(clockEnabled) {
    set({ clockEnabled });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ clockEnabled: get().clockEnabled }));
    } catch {
      // 저장 실패는 무시 (설정은 이번 세션에만 적용)
    }
  },
}));
