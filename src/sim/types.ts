// 회로 데이터 모델 (SPEC 4.1). 엔진과 저장 스키마가 함께 사용하는 순수 타입.

export type Bit = 0 | 1;

export type PrimitiveKind = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR' | 'NOT' | 'SWITCH' | 'PUSH' | 'LED' | 'CLOCK' | 'SPLIT' | 'MERGE' | 'SEG8' | 'VCC' | 'GND';

export type PartKind = { type: 'primitive'; kind: PrimitiveKind } | { type: 'chip'; chipId: string };

export type Rotation = 0 | 90 | 180 | 270;

export interface Part {
  id: string;
  kind: PartKind;
  /** 격자 좌표 (20px 단위) */
  x: number;
  y: number;
  rotation?: Rotation;
  label?: string;
  /** hz: 클럭 주파수, bits: 비트 수 (8단계 버스, 없으면 1. 나누기·묶기는 4), inputs: 게이트 입력 수 (2~8, 없으면 2) */
  props?: { hz?: number; bits?: number; inputs?: number };
}

export interface PinRef {
  partId: string;
  pin: string;
}

export interface Wire {
  id: string;
  /** 출력 핀 */
  from: PinRef;
  /** 입력 핀 — 입력 핀 하나에는 전선 하나만 */
  to: PinRef;
  points?: { x: number; y: number }[];
}

/** 부품 묶음: 캔버스에 점선 사각형과 이름으로 표시. 시뮬레이션에는 영향 없음. */
export interface Group {
  id: string;
  name: string;
  /** 묶은 부품 id */
  parts: string[];
}

/** 캔버스 메모 (격자 좌표). 시뮬레이션에는 영향 없음. */
export interface Note {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface Circuit {
  parts: Part[];
  wires: Wire[];
  groups?: Group[];
  notes?: Note[];
}

/** 칩 정의 (SPEC 4.2). 입력 핀은 내부 SWITCH/PUSH, 출력 핀은 내부 LED. */
export interface ChipDef {
  id: string;
  name: string;
  /** 팔레트 스와치 키 (예: 'chip-1' → var(--chip-1)) */
  color: string;
  /** 팔레트 "내 칩"에서 묶어 보여 줄 분류 (없으면 분류 없음) */
  category?: string;
  inputs: { name: string; partId: string }[];
  outputs: { name: string; partId: string }[];
  circuit: Circuit;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export type Library = Record<string, ChipDef>;
