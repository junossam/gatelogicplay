import type { Circuit } from '../sim/types';
import { migrate } from './migrate';
import { FORMAT, VERSION, workspaceFileSchema, type WorkspaceFile } from './schema';

export const WORKSPACE_KEY = 'logiclab:v1:workspace';
export const LIBRARY_KEY = 'logiclab:v1:library';
/** 읽을 수 없는 저장본을 덮어쓰기 전에 보관하는 키 */
export const WORKSPACE_BACKUP_KEY = 'logiclab:v1:workspace:corrupt';

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function serializeWorkspace(circuit: Circuit): string {
  const file: WorkspaceFile = { format: FORMAT, version: VERSION, workspace: circuit, openChipId: null };
  return JSON.stringify(file);
}

export type LoadResult = { ok: true; circuit: Circuit } | { ok: false; error: string };

export function parseWorkspace(json: string): LoadResult {
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
  const parsed = workspaceFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join('.') || '(루트)'}: ${issue?.message ?? '검증 실패'}` };
  }
  return { ok: true, circuit: parsed.data.workspace };
}

export function saveWorkspace(store: Pick<Storage, 'setItem'>, circuit: Circuit): void {
  store.setItem(WORKSPACE_KEY, serializeWorkspace(circuit));
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
