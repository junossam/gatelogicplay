import { create } from 'zustand';
import type { PrimitiveKind } from '../sim/types';

interface UiState {
  /** 팔레트에서 클릭해 고른 부품. 캔버스를 클릭하면 그 자리에 배치된다. */
  armedKind: PrimitiveKind | null;
  zoom: number;
  setArmed(kind: PrimitiveKind | null): void;
  setZoom(zoom: number): void;
}

export const useUi = create<UiState>((set) => ({
  armedKind: null,
  zoom: 1,
  setArmed: (armedKind) => set({ armedKind }),
  setZoom: (zoom) => set({ zoom }),
}));

export const PART_DRAG_MIME = 'application/x-logiclab-part';
