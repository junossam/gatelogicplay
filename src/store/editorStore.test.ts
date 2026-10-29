import { beforeEach, describe, expect, it } from 'vitest';
import { createEditorStore, type EditorStore } from './editorStore';

let store: EditorStore;
const s = () => store.getState();

beforeEach(() => {
  store = createEditorStore();
});

/** 스위치 → AND → LED (13장 1단계 완료 기준 회로) */
function buildSwitchAndLed() {
  const sw = s().addPart('SWITCH', 0, 0);
  const and = s().addPart('AND', 6, 0);
  const led = s().addPart('LED', 14, 1);
  s().connect({ partId: sw, pin: 'y' }, { partId: and, pin: 'a' });
  s().connect({ partId: and, pin: 'y' }, { partId: led, pin: 'a' });
  return { sw, and, led };
}

describe('부품 배치', () => {
  it('종류별 경로형 id와 입출력 라벨을 붙인다', () => {
    expect(s().addPart('AND', 1, 2)).toBe('and1');
    expect(s().addPart('AND', 1, 2)).toBe('and2');
    s().addPart('SWITCH', 0, 0);
    s().addPart('PUSH', 0, 0);
    s().addPart('LED', 0, 0);
    const labels = s().circuit.parts.map((p) => p.label);
    expect(labels).toEqual([undefined, undefined, 'A', 'B', 'Y1']);
  });

  it('NAND/NOR/XNOR도 2입력 게이트로 배치하고 연결한다', () => {
    const sw = s().addPart('SWITCH', 0, 0);
    for (const kind of ['NAND', 'NOR', 'XNOR'] as const) {
      const id = s().addPart(kind, 6, 0);
      expect(id).toBe(`${kind.toLowerCase()}1`);
      expect(s().connect({ partId: sw, pin: 'y' }, { partId: id, pin: 'b' })).not.toBeNull();
    }
    expect(s().circuit.wires).toHaveLength(3);
  });

  it('격자 좌표는 정수로 맞춘다', () => {
    const id = s().addPart('NOT', 1.4, 2.6);
    expect(s().circuit.parts.find((p) => p.id === id)).toMatchObject({ x: 1, y: 3 });
  });

  it('배치한 부품을 선택한다', () => {
    const id = s().addPart('OR', 0, 0);
    expect(s().selection).toEqual({ parts: [id], wires: [] });
  });
});

describe('이동', () => {
  it('선택한 부품을 함께 옮기고 실행 취소 한 번으로 되돌린다', () => {
    const a = s().addPart('AND', 0, 0);
    const b = s().addPart('OR', 10, 0);
    const c = s().addPart('NOT', 20, 0);
    s().setSelection({ parts: [a, b] });
    const historyBefore = s().past.length;

    s().beginDrag();
    s().dragBy(1, 1);
    s().dragBy(3, 2); // 드래그 시작점 기준 누적 이동
    s().endDrag();

    const pos = (id: string) => s().circuit.parts.find((p) => p.id === id)!;
    expect(pos(a)).toMatchObject({ x: 3, y: 2 });
    expect(pos(b)).toMatchObject({ x: 13, y: 2 });
    expect(pos(c)).toMatchObject({ x: 20, y: 0 });
    expect(s().past.length).toBe(historyBefore + 1);

    s().undo();
    expect(pos(a)).toMatchObject({ x: 0, y: 0 });
    expect(pos(b)).toMatchObject({ x: 10, y: 0 });
  });

  it('제자리 드래그는 기록을 남기지 않는다', () => {
    s().addPart('AND', 0, 0);
    const before = s().past.length;
    s().beginDrag();
    s().dragBy(0, 0);
    s().endDrag();
    expect(s().past.length).toBe(before);
  });
});

describe('전선 연결', () => {
  it('출력 → 입력으로 연결한다', () => {
    const { sw, and, led } = buildSwitchAndLed();
    expect(s().circuit.wires).toEqual([
      { id: 'w1', from: { partId: sw, pin: 'y' }, to: { partId: and, pin: 'a' } },
      { id: 'w2', from: { partId: and, pin: 'y' }, to: { partId: led, pin: 'a' } },
    ]);
  });

  it('입력 핀에서 시작해도 방향을 출력 → 입력으로 맞춘다', () => {
    const sw = s().addPart('SWITCH', 0, 0);
    const led = s().addPart('LED', 5, 0);
    s().connect({ partId: led, pin: 'a' }, { partId: sw, pin: 'y' });
    expect(s().circuit.wires[0]).toMatchObject({ from: { partId: sw, pin: 'y' }, to: { partId: led, pin: 'a' } });
  });

  it('출력끼리, 입력끼리, 없는 핀은 연결하지 않는다', () => {
    const sw1 = s().addPart('SWITCH', 0, 0);
    const sw2 = s().addPart('SWITCH', 0, 4);
    const and = s().addPart('AND', 6, 0);
    expect(s().connect({ partId: sw1, pin: 'y' }, { partId: sw2, pin: 'y' })).toBeNull();
    expect(s().connect({ partId: and, pin: 'a' }, { partId: and, pin: 'b' })).toBeNull();
    expect(s().connect({ partId: sw1, pin: 'y' }, { partId: and, pin: 'zz' })).toBeNull();
    expect(s().connect({ partId: 'ghost', pin: 'y' }, { partId: and, pin: 'a' })).toBeNull();
    expect(s().circuit.wires).toHaveLength(0);
  });

  it('입력 핀에는 전선 하나만: 새 전선이 기존 전선을 대체한다', () => {
    const sw1 = s().addPart('SWITCH', 0, 0);
    const sw2 = s().addPart('SWITCH', 0, 4);
    const and = s().addPart('AND', 6, 0);
    s().connect({ partId: sw1, pin: 'y' }, { partId: and, pin: 'a' });
    s().connect({ partId: sw2, pin: 'y' }, { partId: and, pin: 'a' });
    const into = s().circuit.wires.filter((w) => w.to.partId === and && w.to.pin === 'a');
    expect(into).toHaveLength(1);
    expect(into[0]!.from.partId).toBe(sw2);
  });

  it('출력 핀은 여러 입력으로 갈라질 수 있다', () => {
    const sw = s().addPart('SWITCH', 0, 0);
    const and = s().addPart('AND', 6, 0);
    s().connect({ partId: sw, pin: 'y' }, { partId: and, pin: 'a' });
    s().connect({ partId: sw, pin: 'y' }, { partId: and, pin: 'b' });
    expect(s().circuit.wires).toHaveLength(2);
  });

  it('같은 전선을 다시 그리면 무시한다', () => {
    const sw = s().addPart('SWITCH', 0, 0);
    const led = s().addPart('LED', 5, 0);
    s().connect({ partId: sw, pin: 'y' }, { partId: led, pin: 'a' });
    const before = s().past.length;
    expect(s().connect({ partId: sw, pin: 'y' }, { partId: led, pin: 'a' })).toBeNull();
    expect(s().past.length).toBe(before);
  });

  it('피드백 루프(자기 출력 → 자기 입력)도 허용한다', () => {
    const not = s().addPart('NOT', 0, 0);
    expect(s().connect({ partId: not, pin: 'y' }, { partId: not, pin: 'a' })).not.toBeNull();
  });
});

describe('삭제', () => {
  it('부품을 지우면 연결된 전선도 지운다', () => {
    const { and } = buildSwitchAndLed();
    s().setSelection({ parts: [and] });
    s().deleteSelection();
    expect(s().circuit.parts.map((p) => p.id)).toEqual(['switch1', 'led1']);
    expect(s().circuit.wires).toHaveLength(0);
    expect(s().selection).toEqual({ parts: [], wires: [] });
  });

  it('전선만 지울 수 있다', () => {
    buildSwitchAndLed();
    s().setSelection({ wires: ['w1'] });
    s().deleteSelection();
    expect(s().circuit.parts).toHaveLength(3);
    expect(s().circuit.wires.map((w) => w.id)).toEqual(['w2']);
  });

  it('선택이 없으면 기록을 남기지 않는다', () => {
    buildSwitchAndLed();
    s().clearSelection();
    const before = s().past.length;
    s().deleteSelection();
    expect(s().past.length).toBe(before);
  });
});

describe('선택', () => {
  it('toggleSelection은 추가/제거를 번갈아 한다 (Shift+클릭)', () => {
    const a = s().addPart('AND', 0, 0);
    const b = s().addPart('OR', 5, 0);
    s().setSelection({ parts: [a] });
    s().toggleSelection({ parts: [b] });
    expect(s().selection.parts).toEqual([a, b]);
    s().toggleSelection({ parts: [a] });
    expect(s().selection.parts).toEqual([b]);
  });
});

describe('실행 취소 / 다시 실행', () => {
  it('모든 편집 단계를 되돌리고 다시 적용한다', () => {
    buildSwitchAndLed();
    const full = s().circuit;
    expect(s().past).toHaveLength(5); // 배치 3 + 연결 2

    s().undo();
    expect(s().circuit.wires).toHaveLength(1);
    s().undo();
    s().undo();
    expect(s().circuit.parts).toHaveLength(2);
    expect(s().circuit.wires).toHaveLength(0);

    s().redo();
    s().redo();
    s().redo();
    expect(s().circuit).toEqual(full);
    expect(s().future).toHaveLength(0);
  });

  it('새 편집을 하면 다시 실행 기록을 버린다', () => {
    s().addPart('AND', 0, 0);
    s().undo();
    expect(s().future).toHaveLength(1);
    s().addPart('OR', 0, 0);
    expect(s().future).toHaveLength(0);
  });

  it('되돌린 뒤 사라진 항목은 선택에서 빠진다', () => {
    const id = s().addPart('AND', 0, 0);
    expect(s().selection.parts).toEqual([id]);
    s().undo();
    expect(s().selection.parts).toEqual([]);
  });

  it('기록이 비어 있으면 아무것도 하지 않는다', () => {
    s().undo();
    s().redo();
    expect(s().circuit).toEqual({ parts: [], wires: [] });
  });

  it('삭제를 되돌리면 부품과 전선이 함께 돌아온다', () => {
    const { and } = buildSwitchAndLed();
    const full = s().circuit;
    s().setSelection({ parts: [and] });
    s().deleteSelection();
    s().undo();
    expect(s().circuit).toEqual(full);
  });
});

describe('load', () => {
  it('회로를 불러오면 기록과 선택을 초기화한다', () => {
    buildSwitchAndLed();
    const saved = s().circuit;
    const other = createEditorStore();
    other.getState().addPart('AND', 0, 0);
    other.getState().load(saved);
    expect(other.getState().circuit).toEqual(saved);
    expect(other.getState().past).toHaveLength(0);
    expect(other.getState().selection).toEqual({ parts: [], wires: [] });
  });
});

describe('칩 편집 (4단계)', () => {
  it('작업 공간을 칩으로 저장하고, 칩을 열어 고친 뒤 저장하면 같은 id로 갱신된다', () => {
    const sw = s().addPart('SWITCH', 0, 0);
    const not = s().addPart('NOT', 5, 0);
    const led = s().addPart('LED', 10, 0);
    s().connect({ partId: sw, pin: 'y' }, { partId: not, pin: 'a' });
    s().connect({ partId: not, pin: 'y' }, { partId: led, pin: 'a' });
    const r = s().saveChip({ name: '인버터', color: 'chip-2', names: { [sw]: 'IN', [led]: 'OUT' }, order: { inputs: [], outputs: [] }, propagate: true });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    expect(s().library[id]).toMatchObject({ name: '인버터', revision: 1, inputs: [{ name: 'IN' }], outputs: [{ name: 'OUT' }] });
    // 핀 이름은 내부 부품 라벨로 저장된다
    expect(s().circuit.parts.find((p) => p.id === sw)!.label).toBe('IN');

    const workspace = s().circuit;
    s().addChip(id, 20, 0);
    s().openChip(id);
    expect(s().openChipId).toBe(id);
    s().addPart('NOT', 7, 6);
    const r2 = s().saveChip({ name: '인버터', color: 'chip-2', names: {}, order: { inputs: [], outputs: [] }, propagate: true });
    expect(r2).toEqual({ ok: true, id });
    expect(s().library[id]!.revision).toBe(2);
    expect(s().library[id]!.circuit.parts).toHaveLength(4);
    s().closeChip();
    expect(s().openChipId).toBeNull();
    expect(s().circuit.parts).toHaveLength(workspace.parts.length + 1);
  });

  it('반영을 끄면 "이름 (2)" 새 칩으로 저장하고 그 칩을 편집하는 상태가 된다', () => {
    s().addPart('SWITCH', 0, 0);
    const r = s().saveChip({ name: 'X', color: 'chip-1', names: {}, order: { inputs: [], outputs: [] }, propagate: true });
    const id = (r as { id: string }).id;
    s().openChip(id);
    const r2 = s().saveChip({ name: 'X', color: 'chip-1', names: {}, order: { inputs: [], outputs: [] }, propagate: false });
    expect(r2.ok).toBe(true);
    const copy = (r2 as { id: string }).id;
    expect(copy).not.toBe(id);
    expect(s().library[copy]!.name).toBe('X (2)');
    expect(s().openChipId).toBe(copy);
  });

  it('편집 중인 칩 자신이나 그 칩을 포함하는 칩은 넣을 수 없다', () => {
    s().addPart('SWITCH', 0, 0);
    const a = (s().saveChip({ name: 'A', color: 'chip-1', names: {}, order: { inputs: [], outputs: [] }, propagate: true }) as { id: string }).id;
    s().load({ parts: [], wires: [] });
    s().setLibrary(s().library);
    s().addChip(a, 0, 0);
    s().addPart('SWITCH', 0, 6);
    const b = (s().saveChip({ name: 'B', color: 'chip-1', names: {}, order: { inputs: [], outputs: [] }, propagate: true }) as { id: string }).id;
    s().openChip(a);
    expect(s().addChip(a, 0, 0)).toBeNull();
    expect(s().addChip(b, 0, 0)).toBeNull();
  });

  it('쓰는 곳이 있으면 삭제를 막는다', () => {
    s().addPart('SWITCH', 0, 0);
    const a = (s().saveChip({ name: 'A', color: 'chip-1', names: {}, order: { inputs: [], outputs: [] }, propagate: true }) as { id: string }).id;
    s().addChip(a, 5, 5);
    expect(s().deleteChip(a)).toEqual({ ok: false, users: ['작업 공간'] });
    s().undo();
    expect(s().deleteChip(a)).toEqual({ ok: true });
    expect(s().library[a]).toBeUndefined();
  });

  it('R: 선택 부품을 90°씩 회전, 네 번이면 원래대로', () => {
    const id = s().addPart('AND', 0, 0);
    s().rotateSelection();
    expect(s().circuit.parts[0]!.rotation).toBe(90);
    s().rotateSelection();
    s().rotateSelection();
    s().rotateSelection();
    expect(s().circuit.parts.find((p) => p.id === id)!.rotation).toBeUndefined();
  });
});

describe('가져오기', () => {
  it('칩을 쓰는 작업 공간을 가져오면 칩 정의가 먼저 들어간다', () => {
    const seen: number[] = [];
    const unsub = store.subscribe((st) => seen.push(Object.keys(st.library).length * 10 + st.circuit.parts.length));
    const lib = {
      c1: {
        id: 'c1',
        name: 'X',
        color: 'chip-1',
        inputs: [],
        outputs: [],
        circuit: { parts: [], wires: [] },
        createdAt: '',
        updatedAt: '',
        revision: 1,
      },
    };
    s().importLibrary(lib, 'copy', { parts: [{ id: 'x1', kind: { type: 'chip', chipId: 'c1' }, x: 0, y: 0 }], wires: [] });
    unsub();
    // 라이브러리(10)가 먼저, 그다음 작업 공간(+1)
    expect(seen).toEqual([10, 11]);
  });
});
