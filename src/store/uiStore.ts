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

type Side = 'left' | 'right';

/** 패널 폭 범위 (px) */
export const LAYOUT_LIMITS: Record<Side, { min: number; max: number; initial: number }> = {
  left: { min: 180, max: 480, initial: 240 },
  right: { min: 220, max: 560, initial: 280 },
};

const LAYOUT_KEY = 'logiclab:v1:layout';

interface Layout {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const clampWidth = (side: Side, w: number) => Math.round(Math.min(LAYOUT_LIMITS[side].max, Math.max(LAYOUT_LIMITS[side].min, w)));

function loadLayout(): Layout {
  const base: Layout = { leftWidth: LAYOUT_LIMITS.left.initial, rightWidth: LAYOUT_LIMITS.right.initial, leftCollapsed: false, rightCollapsed: false };
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>;
    return {
      leftWidth: typeof raw.leftWidth === 'number' ? clampWidth('left', raw.leftWidth) : base.leftWidth,
      rightWidth: typeof raw.rightWidth === 'number' ? clampWidth('right', raw.rightWidth) : base.rightWidth,
      leftCollapsed: raw.leftCollapsed === true,
      rightCollapsed: raw.rightCollapsed === true,
    };
  } catch {
    return base;
  }
}

function saveLayout(l: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    // 저장 실패는 무시 (이번 세션에만 적용)
  }
}

interface UiState extends Layout {
  /** 팔레트에서 클릭해 고른 부품. 캔버스를 클릭하면 그 자리에 배치된다. */
  armed: PartKind | null;
  /** 메모 도구를 골랐으면 캔버스를 클릭한 자리에 메모를 놓는다 */
  armedNote: boolean;
  /** 바닥을 끌 때: 이동(손) = 화면 이동, 선택 = 범위 선택 */
  tool: 'hand' | 'select';
  /** 칩 펼쳐 보기: 0 = 안 함, 1 = 한 단계, Infinity = 전부 */
  expandDepth: number;
  zoom: number;
  waveOpen: boolean;
  truthOpen: boolean;
  saveOpen: boolean;
  settingsOpen: boolean;
  challengesOpen: boolean;
  shareOpen: boolean;
  samplesOpen: boolean;
  builtinChipsOpen: boolean;
  /** 진리표 편집 창을 연 부품 id */
  lutEdit: string | null;
  /** 그룹 대화상자: 선택을 새 그룹으로, 또는 그룹 이름 바꾸기 */
  groupEdit: { create: true } | { id: string } | null;
  /** 지금 글을 고치고 있는 메모 */
  editingNote: string | null;
  /** 캔버스가 지금 보여 주는 가운데 (격자 칸). 메뉴에서 메모를 놓을 때 쓴다. */
  canvasCenter: () => { x: number; y: number };
  /** 분류 대화상자: 칩 하나의 분류 바꾸기, 또는 분류 이름 바꾸기 */
  categoryEdit: { chipId: string } | { rename: string } | null;
  message: Message | null;
  /** 가져오기 대화상자에 띄울 파일 (검증 통과) */
  pendingImport: Bundle | null;
  setWaveOpen(open: boolean): void;
  setTruthOpen(open: boolean): void;
  setSaveOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setChallengesOpen(open: boolean): void;
  setShareOpen(open: boolean): void;
  setSamplesOpen(open: boolean): void;
  setBuiltinChipsOpen(open: boolean): void;
  setLutEdit(partId: string | null): void;
  setGroupEdit(edit: { create: true } | { id: string } | null): void;
  setEditingNote(id: string | null): void;
  setCategoryEdit(edit: { chipId: string } | { rename: string } | null): void;
  setMessage(message: Message | null): void;
  setPendingImport(bundle: Bundle | null): void;
  setArmed(kind: PartKind | null): void;
  setArmedNote(on: boolean): void;
  setTool(tool: 'hand' | 'select'): void;
  setExpandDepth(depth: number): void;
  setPanelWidth(side: Side, width: number): void;
  setPanelCollapsed(side: Side, collapsed: boolean): void;
  setZoom(zoom: number): void;
}

export const useUi = create<UiState>((set, get) => ({
  ...(typeof localStorage === 'undefined'
    ? { leftWidth: LAYOUT_LIMITS.left.initial, rightWidth: LAYOUT_LIMITS.right.initial, leftCollapsed: false, rightCollapsed: false }
    : loadLayout()),
  armed: null,
  armedNote: false,
  tool: 'hand',
  expandDepth: 0,
  zoom: 1,
  waveOpen: true,
  truthOpen: false,
  saveOpen: false,
  settingsOpen: false,
  challengesOpen: false,
  shareOpen: false,
  samplesOpen: false,
  builtinChipsOpen: false,
  lutEdit: null,
  groupEdit: null,
  editingNote: null,
  canvasCenter: () => ({ x: 10, y: 10 }),
  categoryEdit: null,
  message: null,
  pendingImport: null,
  setWaveOpen: (waveOpen) => set({ waveOpen }),
  setTruthOpen: (truthOpen) => set({ truthOpen }),
  setSaveOpen: (saveOpen) => set({ saveOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setChallengesOpen: (challengesOpen) => set({ challengesOpen }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setSamplesOpen: (samplesOpen) => set({ samplesOpen }),
  setBuiltinChipsOpen: (builtinChipsOpen) => set({ builtinChipsOpen }),
  setLutEdit: (lutEdit) => set({ lutEdit }),
  setGroupEdit: (groupEdit) => set({ groupEdit }),
  setEditingNote: (editingNote) => set({ editingNote }),
  setCategoryEdit: (categoryEdit) => set({ categoryEdit }),
  setMessage: (message) => set({ message }),
  setPendingImport: (pendingImport) => set({ pendingImport }),
  // 부품과 메모 도구는 하나만 고른 상태가 된다
  setArmed: (armed) => set(armed ? { armed, armedNote: false } : { armed }),
  setArmedNote: (armedNote) => set(armedNote ? { armedNote, armed: null } : { armedNote }),
  setTool: (tool) => set({ tool }),
  setExpandDepth: (expandDepth) => set({ expandDepth }),
  setPanelWidth: (side, width) => {
    set(side === 'left' ? { leftWidth: clampWidth('left', width) } : { rightWidth: clampWidth('right', width) });
    const { leftWidth, rightWidth, leftCollapsed, rightCollapsed } = get();
    saveLayout({ leftWidth, rightWidth, leftCollapsed, rightCollapsed });
  },
  setPanelCollapsed: (side, collapsed) => {
    set(side === 'left' ? { leftCollapsed: collapsed } : { rightCollapsed: collapsed });
    const { leftWidth, rightWidth, leftCollapsed, rightCollapsed } = get();
    saveLayout({ leftWidth, rightWidth, leftCollapsed, rightCollapsed });
  },
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
