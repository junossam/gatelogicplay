import { describe, expect, it } from 'vitest';
import type { Circuit } from '../sim/types';
import { migrate, MigrationError } from './migrate';
import { loadWorkspace, parseWorkspace, saveWorkspace, serializeWorkspace, WORKSPACE_BACKUP_KEY, WORKSPACE_KEY } from './storage';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const circuit: Circuit = {
  parts: [
    { id: 'switch1', kind: { type: 'primitive', kind: 'SWITCH' }, x: 0, y: 0, label: 'A' },
    { id: 'and1', kind: { type: 'primitive', kind: 'AND' }, x: 6, y: 0 },
    { id: 'led1', kind: { type: 'primitive', kind: 'LED' }, x: 14, y: 1, label: 'Y1' },
  ],
  wires: [
    { id: 'w1', from: { partId: 'switch1', pin: 'y' }, to: { partId: 'and1', pin: 'a' } },
    { id: 'w2', from: { partId: 'and1', pin: 'y' }, to: { partId: 'led1', pin: 'a' } },
  ],
};

describe('작업 공간 저장', () => {
  it('format, version 필드를 넣어 저장한다', () => {
    const doc = JSON.parse(serializeWorkspace(circuit));
    expect(doc.format).toBe('logiclab');
    expect(doc.version).toBe(8);
    expect(doc.openChipId).toBeNull();
    expect(doc.workspace).toEqual(circuit);
  });

  it('저장한 회로를 그대로 불러온다 (새로고침 후 유지)', () => {
    const kv = memoryStorage();
    saveWorkspace(kv, circuit);
    expect(kv.map.has(WORKSPACE_KEY)).toBe(true);
    expect(loadWorkspace(kv)).toEqual(circuit);
  });

  it('저장본이 없으면 빈 회로', () => {
    expect(loadWorkspace(memoryStorage())).toEqual({ parts: [], wires: [] });
  });

  it('깨진 저장본은 백업하고 빈 회로로 시작한다', () => {
    const kv = memoryStorage();
    kv.setItem(WORKSPACE_KEY, '{not json');
    expect(loadWorkspace(kv)).toEqual({ parts: [], wires: [] });
    expect(kv.map.get(WORKSPACE_BACKUP_KEY)).toBe('{not json');
  });
});

describe('스키마 검증', () => {
  it('format이 다르면 거부', () => {
    const r = parseWorkspace(JSON.stringify({ format: 'other', version: 1, workspace: circuit, openChipId: null }));
    expect(r.ok).toBe(false);
  });

  it('미래 버전은 거부', () => {
    const r = parseWorkspace(JSON.stringify({ format: 'logiclab', version: 99, workspace: circuit, openChipId: null }));
    expect(r).toMatchObject({ ok: false });
  });

  it('문제가 있는 필드 경로를 알려준다', () => {
    const bad = { ...circuit, parts: [{ ...circuit.parts[0], kind: { type: 'primitive', kind: 'MUX' } }] };
    const r = parseWorkspace(JSON.stringify({ format: 'logiclab', version: 1, workspace: bad, openChipId: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('workspace.parts.0.kind');
  });

  it('version 1 파일은 2로 변환해 그대로 읽는다', () => {
    const v1 = JSON.stringify({ format: 'logiclab', version: 1, workspace: circuit, openChipId: null });
    const r = parseWorkspace(v1);
    expect(r).toMatchObject({ ok: true, circuit });
  });

  it('version 2 파일도 3으로 변환해 읽는다', () => {
    const r = parseWorkspace(JSON.stringify({ format: 'logiclab', version: 2, workspace: circuit, openChipId: null }));
    expect(r).toMatchObject({ ok: true, circuit });
  });

  it('migrate는 version 없는 문서를 거부한다', () => {
    expect(() => migrate({ format: 'logiclab' })).toThrow(MigrationError);
  });
});
