import { z } from 'zod';
import type { Circuit } from '../sim/types';

export const FORMAT = 'logiclab';
/** 2: 다중 비트 버스 (SPLIT/MERGE, props.bits), 3: 게이트 입력 수(props.inputs)와 칩 분류(category) */
export const VERSION = 3;

const primitiveKind = z.enum(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT', 'SWITCH', 'PUSH', 'LED', 'CLOCK', 'SPLIT', 'MERGE']);

const partKind = z.discriminatedUnion('type', [
  z.object({ type: z.literal('primitive'), kind: primitiveKind }),
  z.object({ type: z.literal('chip'), chipId: z.string().min(1) }),
]);

const point = z.object({ x: z.number(), y: z.number() });

export const partSchema = z.object({
  id: z.string().min(1),
  kind: partKind,
  x: z.number().int(),
  y: z.number().int(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  label: z.string().optional(),
  props: z
    .object({
      hz: z.number().positive().optional(),
      bits: z.number().int().min(1).max(16).optional(),
      inputs: z.number().int().min(2).max(8).optional(),
    })
    .optional(),
});

const pinRef = z.object({ partId: z.string().min(1), pin: z.string().min(1) });

export const wireSchema = z.object({
  id: z.string().min(1),
  from: pinRef,
  to: pinRef,
  points: z.array(point).optional(),
});

export const circuitSchema: z.ZodType<Circuit> = z.object({
  parts: z.array(partSchema),
  wires: z.array(wireSchema),
});

/** localStorage `logiclab:v1:workspace`에 저장하는 문서 */
export const workspaceFileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  workspace: circuitSchema,
  openChipId: z.string().nullable(),
});

export type WorkspaceFile = z.infer<typeof workspaceFileSchema>;

const pinSpec = z.object({ name: z.string().min(1), partId: z.string().min(1) });

export const chipDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string(),
  category: z.string().optional(),
  inputs: z.array(pinSpec),
  outputs: z.array(pinSpec),
  circuit: circuitSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().nonnegative(),
});

const librarySchema = z.record(z.string(), chipDefSchema).superRefine((lib, ctx) => {
  for (const [key, def] of Object.entries(lib)) {
    if (def.id !== key) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key, 'id'], message: `키(${key})와 id(${def.id})가 다릅니다` });
  }
});

/** localStorage `logiclab:v1:library` */
export const libraryFileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  library: librarySchema,
});

/** 내보내기/가져오기 파일 (SPEC 4.3) */
export const bundleSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  library: librarySchema,
  workspace: circuitSchema,
  openChipId: z.string().nullable(),
});

export type Bundle = z.infer<typeof bundleSchema>;
