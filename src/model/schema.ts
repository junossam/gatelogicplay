import { z } from 'zod';
import type { Circuit } from '../sim/types';

export const FORMAT = 'logiclab';
export const VERSION = 1;

const primitiveKind = z.enum(['AND', 'OR', 'XOR', 'NOT', 'SWITCH', 'PUSH', 'LED', 'CLOCK']);

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
  props: z.object({ hz: z.number().positive().optional() }).optional(),
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
