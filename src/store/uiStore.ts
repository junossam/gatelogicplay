import { create } from 'zustand';
import type { Bundle } from '../model/schema';
import type { PartKind } from '../sim/types';

export interface Message {
  title: string;
  body: string;
  items?: string[];
  confirmLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
}

interface UiState {
  /** 팔레트에서 클릭해 고른 부품. 캔버스를 클릭하면 그 자리에 배치된다. */
  armed: PartKind | null;
  zoom: number;
  waveOpen: boolean;
  truthOpen: boolean;
  saveOpen: boolean;
  settingsOpen: boolean;
  challengesOpen: boolean;
  shareOpen: boolean;
  message: Message | null;
  /** 가져오기 대화상자에 띄울 파일 (검증 통과) */
  pendingImport: Bundle | null;
  setWaveOpen(open: boolean): void;
  setTruthOpen(open: boolean): void;
  setSaveOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setChallengesOpen(open: boolean): void;
  setShareOpen(open: boolean): void;
  setMessage(message: Message | null): void;
  setPendingImport(bundle: Bundle | null): void;
  setArmed(kind: PartKind | null): void;
  setZoom(zoom: number): void;
}

export const useUi = create<UiState>((set) => ({
  armed: null,
  zoom: 1,
  waveOpen: true,
  truthOpen: false,
  saveOpen: false,
  settingsOpen: false,
  challengesOpen: false,
  shareOpen: false,
  message: null,
  pendingImport: null,
  setWaveOpen: (waveOpen) => set({ waveOpen }),
  setTruthOpen: (truthOpen) => set({ truthOpen }),
  setSaveOpen: (saveOpen) => set({ saveOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setChallengesOpen: (challengesOpen) => set({ challengesOpen }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setMessage: (message) => set({ message }),
  setPendingImport: (pendingImport) => set({ pendingImport }),
  setArmed: (armed) => set({ armed }),
  setZoom: (zoom) => set({ zoom }),
}));

export const PART_DRAG_MIME = 'application/x-logiclab-part';

/** 끌어다 놓기 데이터: 'AND' 같은 기본 부품 또는 'chip:<id>' */
export function encodeKind(kind: PartKind): string {
  return kind.type === 'primitive' ? kind.kind : `chip:${kind.chipId}`;
}

export function decodeKind(raw: string): PartKind | null {
  if (!raw) return null;
  if (raw.startsWith('chip:')) return { type: 'chip', chipId: raw.slice(5) };
  return { type: 'primitive', kind: raw as never };
}

export function sameKind(a: PartKind | null, b: PartKind): boolean {
  if (!a || a.type !== b.type) return false;
  return a.type === 'primitive' ? a.kind === (b as typeof a).kind : a.chipId === (b as typeof a).chipId;
}
