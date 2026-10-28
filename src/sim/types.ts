// 회로 데이터 모델 (SPEC 4.1). 엔진과 저장 스키마가 함께 사용하는 순수 타입.

export type Bit = 0 | 1;

export type PrimitiveKind = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR' | 'NOT' | 'SWITCH' | 'PUSH' | 'LED' | 'CLOCK';

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
  props?: { hz?: number };
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

export interface Circuit {
  parts: Part[];
  wires: Wire[];
}
