import type { Circuit, Library } from '../sim/types';
import type { z } from 'zod';
import { migrate } from './migrate';
import { bundleSchema, FORMAT, libraryFileSchema, VERSION, workspaceFileSchema, type Bundle, type WorkspaceFile } from './schema';

export const WORKSPACE_KEY = 'logiclab:v1:workspace';
export const LIBRARY_KEY = 'logiclab:v1:library';
/** 읽을 수 없는 저장본을 덮어쓰기 전에 보관하는 키 */
export const WORKSPACE_BACKUP_KEY = 'logiclab:v1:workspace:corrupt';

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function serializeWorkspace(circuit: Circuit, openChipId: string | null = null): string {
  const file: WorkspaceFile = { format: FORMAT, version: VERSION, workspace: circuit, openChipId };
  return JSON.stringify(file);
}

export function serializeLibrary(library: Library): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, library });
}

export function serializeBundle(library: Library, workspace: Circuit, openChipId: string | null): string {
  const bundle: Bundle = { format: FORMAT, version: VERSION, library, workspace, openChipId };
  return JSON.stringify(bundle, null, 2);
}

/** JSON → 마이그레이션 → zod 검증. 실패하면 어떤 필드가 문제인지 알려준다 (SPEC 10장). */
function parseWith<T>(json: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON 형식이 올바르지 않습니다' };
  }
  try {
    raw = migrate(raw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join('.') || '(루트)'}: ${issue?.message ?? '검증 실패'}` };
  }
  return { ok: true, data: parsed.data };
}

export function parseBundle(json: string) {
  return parseWith(json, bundleSchema);
}

export function parseLibrary(json: string) {
  return parseWith(json, libraryFileSchema);
}

export type LoadResult = { ok: true; circuit: Circuit; openChipId: string | null } | { ok: false; error: string };

export function parseWorkspace(json: string): LoadResult {
  const r = parseWith(json, workspaceFileSchema);
  return r.ok ? { ok: true, circuit: r.data.workspace, openChipId: r.data.openChipId } : r;
}

export function saveWorkspace(store: Pick<Storage, 'setItem'>, circuit: Circuit, openChipId: string | null = null): void {
  store.setItem(WORKSPACE_KEY, serializeWorkspace(circuit, openChipId));
}

export function saveLibrary(store: Pick<Storage, 'setItem'>, library: Library): void {
  store.setItem(LIBRARY_KEY, serializeLibrary(library));
}

export const LIBRARY_BACKUP_KEY = 'logiclab:v1:library:corrupt';

export function loadLibrary(store: KV): Library {
  const json = store.getItem(LIBRARY_KEY);
  if (json === null) return {};
  const r = parseLibrary(json);
  if (r.ok) return r.data.library;
  store.setItem(LIBRARY_BACKUP_KEY, json);
  return {};
}

export function loadOpenChipId(store: KV): string | null {
  const json = store.getItem(WORKSPACE_KEY);
  if (json === null) return null;
  const r = parseWorkspace(json);
  return r.ok ? r.openChipId : null;
}

/** 저장 용량 (UTF-16 기준 바이트) — 4MB가 넘으면 경고 (SPEC 10장) */
export const STORAGE_WARN_BYTES = 4 * 1024 * 1024;

export function storageBytes(store: KV): number {
  return ((store.getItem(WORKSPACE_KEY)?.length ?? 0) + (store.getItem(LIBRARY_KEY)?.length ?? 0)) * 2;
}

/** 저장본이 없으면 빈 회로. 깨진 저장본은 백업 키로 옮겨 두고 빈 회로로 시작한다. */
export function loadWorkspace(store: KV): Circuit {
  const json = store.getItem(WORKSPACE_KEY);
  if (json === null) return { parts: [], wires: [] };
  const result = parseWorkspace(json);
  if (result.ok) return result.circuit;
  store.setItem(WORKSPACE_BACKUP_KEY, json);
  return { parts: [], wires: [] };
}
