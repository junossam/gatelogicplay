import { useRef, useState } from 'react';
import { challengeById, isAllowedIn } from '../../model/challenges';
import { chipsUsedIn, circuitUses, usedBy, withDependencies, wouldCreateCycle } from '../../model/library';
import { parseBundle, serializeBundle } from '../../model/storage';
import type { ChipDef, PartKind, PrimitiveKind } from '../../sim/types';
import { editorStore, isChipDirty, useEditor, workspaceOf } from '../../store/editorStore';
import { useSettings } from '../../store/settingsStore';
import { encodeKind, PART_DRAG_MIME, sameKind, useUi } from '../../store/uiStore';
import { PartIcon } from './PartIcons';

interface Item {
  kind: PrimitiveKind;
  name: string;
  desc?: string;
}

const GATES: Item[] = [
  { kind: 'AND', name: 'AND' },
  { kind: 'NAND', name: 'NAND' },
  { kind: 'OR', name: 'OR' },
  { kind: 'NOR', name: 'NOR' },
  { kind: 'XOR', name: 'XOR' },
  { kind: 'XNOR', name: 'XNOR' },
  { kind: 'NOT', name: 'NOT' },
];

const IO: Item[] = [
  { kind: 'SWITCH', name: '스위치', desc: '누르면 켜짐 유지' },
  { kind: 'PUSH', name: '푸시 버튼', desc: '누르는 동안만 켜짐' },
  { kind: 'LED', name: 'LED', desc: '입력 값을 표시' },
];

const CLOCK: Item = { kind: 'CLOCK', name: '클럭', desc: '반주기마다 반전 (선택)' };

function matches(name: string, q: string, extra = ''): boolean {
  const s = q.trim().toLowerCase();
  return !s || name.toLowerCase().includes(s) || extra.toLowerCase().includes(s);
}

/** 챌린지 중이면 그 챌린지에서 쓸 수 있는 부품인지 (SPEC 13장 6단계) */
function useAllowed(kind: PartKind): boolean {
  const challengeId = useEditor((s) => s.openChallengeId);
  const library = useEditor((s) => s.library);
  const ch = challengeId ? challengeById(challengeId) : undefined;
  return !ch || isAllowedIn(ch, kind, library);
}

function PaletteButton({ item, wide }: { item: Item; wide?: boolean }) {
  const kind: PartKind = { type: 'primitive', kind: item.kind };
  const allowed = useAllowed(kind);
  const armed = useUi((s) => sameKind(s.armed, kind));
  const setArmed = useUi((s) => s.setArmed);
  return (
    <button
      type="button"
      className={`palette-item${wide ? ' wide' : ''}${item.kind === 'CLOCK' ? ' optional' : ''}`}
      aria-pressed={armed}
      data-testid={`palette-${item.kind}`}
      disabled={!allowed}
      draggable={allowed}
      onDragStart={(e) => {
        e.dataTransfer.setData(PART_DRAG_MIME, encodeKind(kind));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => setArmed(armed ? null : kind)}
      title={!allowed ? '이 챌린지에서는 쓸 수 없습니다' : armed ? '캔버스를 클릭하면 배치됩니다' : '클릭한 뒤 캔버스를 클릭하거나, 끌어다 놓으세요'}
    >
      <PartIcon kind={item.kind} />
      <span className="palette-text">
        <span className="palette-name">{item.name}</span>
        {item.desc && <span className="palette-desc">{item.desc}</span>}
      </span>
    </button>
  );
}

/** 편집 중인 칩을 떠날 때 저장 안 된 변경이 있으면 확인 */
export function confirmLeaveChip(then: () => void) {
  const st = editorStore.getState();
  if (!isChipDirty(st)) return then();
  useUi.getState().setMessage({
    title: '저장하지 않은 변경 사항',
    body: '편집 중인 칩에 저장하지 않은 변경 사항이 있습니다. 버리고 나갈까요?',
    confirmLabel: '버리고 나가기',
    danger: true,
    onConfirm: then,
  });
}

function ChipItem({ def }: { def: ChipDef }) {
  const library = useEditor((s) => s.library);
  const openChipId = useEditor((s) => s.openChipId);
  const kind: PartKind = { type: 'chip', chipId: def.id };
  const armed = useUi((s) => sameKind(s.armed, kind));
  const setArmed = useUi((s) => s.setArmed);
  const isOpen = openChipId === def.id;
  // 칩 A를 편집하는 동안 A와 A를 포함하는 칩은 넣을 수 없다 (SPEC 9.1)
  const allowed = useAllowed(kind);
  const inChallenge = useEditor((s) => s.openChallengeId !== null);
  const blocked = wouldCreateCycle(openChipId, def.id, library) || !allowed;

  const remove = () => {
    // 쓰는 곳이 있으면 목록을 보여주고 삭제를 막는다 (SPEC 9.1)
    const st = editorStore.getState();
    const users = [...usedBy(def.id, st.library).map((d) => d.name), ...(circuitUses(workspaceOf(st), def.id) ? ['작업 공간'] : [])];
    if (users.length) {
      useUi.getState().setMessage({ title: '삭제할 수 없습니다', body: `"${def.name}" 칩을 쓰는 곳이 있습니다. 먼저 여기서 빼 주세요.`, items: users });
      return;
    }
    useUi.getState().setMessage({
      title: '칩 삭제',
      body: `"${def.name}" 칩을 삭제할까요? 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      danger: true,
      onConfirm: () => {
        const r = editorStore.getState().deleteChip(def.id);
        if (!r.ok) {
          useUi.getState().setMessage({ title: '삭제할 수 없습니다', body: `"${def.name}" 칩을 쓰는 곳이 있습니다. 먼저 여기서 빼 주세요.`, items: r.users });
        }
      },
    });
  };

  return (
    <li className={`chip-item${isOpen ? ' open' : ''}`} data-testid={`chip-item-${def.name}`}>
      <button
        type="button"
        className="palette-item wide chip-button"
        aria-pressed={armed}
        aria-current={isOpen ? 'true' : undefined}
        disabled={blocked}
        draggable={!blocked}
        title={
          !allowed
            ? '이 챌린지에서 쓸 수 없는 게이트가 들어 있습니다'
            : blocked
              ? isOpen
                ? '지금 편집 중인 칩입니다'
                : '이 칩은 편집 중인 칩을 포함하므로 넣을 수 없습니다'
              : '클릭한 뒤 캔버스를 클릭하거나, 끌어다 놓으세요'
        }
        onDragStart={(e) => {
          e.dataTransfer.setData(PART_DRAG_MIME, encodeKind(kind));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => setArmed(armed ? null : kind)}
      >
        <span className="chip-swatch" style={{ background: `var(--${def.color})` }} aria-hidden="true" />
        <span className="palette-text">
          <span className="palette-name">{def.name}</span>
          <span className="palette-desc mono">
            {def.inputs.length}→{def.outputs.length}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={`${def.name} 편집`}
        title="칩 편집"
        disabled={isOpen || inChallenge}
        onClick={() => confirmLeaveChip(() => editorStore.getState().openChip(def.id))}
      >
        ✎
      </button>
      <button type="button" className="icon-button" aria-label={`${def.name} 삭제`} title="칩 삭제" onClick={remove}>
        🗑
      </button>
    </li>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 작업 공간이면 작업 공간과 쓰는 칩 전체, 칩 편집 중이면 그 칩과 의존하는 칩 (SPEC 4.3) */
export function exportCurrent() {
  const st = editorStore.getState();
  if (st.openChipId) {
    const def = st.library[st.openChipId]!;
    download(`${def.name}.logiclab.json`, serializeBundle(withDependencies([def.id], st.library), { parts: [], wires: [] }, def.id));
  } else {
    const ws = workspaceOf(st);
    const used = withDependencies(chipsUsedIn(ws), st.library);
    download('workspace.logiclab.json', serializeBundle({ ...st.library, ...used }, ws, null));
  }
}

export function Palette() {
  const [query, setQuery] = useState('');
  const library = useEditor((s) => s.library);
  const fileRef = useRef<HTMLInputElement>(null);
  const gates = GATES.filter((i) => matches(i.name, query));
  const clockEnabled = useSettings((s) => s.clockEnabled);
  const io = [...IO, ...(clockEnabled ? [CLOCK] : [])].filter((i) => matches(i.name, query, `${i.kind} ${i.desc ?? ''}`));
  const chips = Object.values(library)
    .filter((d) => matches(d.name, query))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const onFile = async (file: File) => {
    const r = parseBundle(await file.text());
    if (!r.ok) {
      useUi.getState().setMessage({ title: '가져올 수 없는 파일', body: `파일 검증에 실패했습니다. ${r.error}` });
      return;
    }
    useUi.getState().setPendingImport(r.data);
  };

  return (
    <aside className="palette" aria-label="부품 팔레트">
      <input
        className="palette-search"
        type="search"
        placeholder="부품 검색"
        aria-label="부품 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {gates.length > 0 && (
        <section>
          <h2 className="panel-title">기본 게이트</h2>
          <div className="palette-grid">
            {gates.map((item) => (
              <PaletteButton key={item.kind} item={item} />
            ))}
          </div>
        </section>
      )}
      {io.length > 0 && (
        <section>
          <h2 className="panel-title">입력 · 출력</h2>
          <div className="palette-list">
            {io.map((item) => (
              <PaletteButton key={item.kind} item={item} wide />
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="panel-title">내 칩</h2>
        {chips.length === 0 ? (
          <p className="muted small">{Object.keys(library).length ? '검색 결과가 없습니다.' : '아직 저장한 칩이 없습니다.'}</p>
        ) : (
          <ul className="chip-list">
            {chips.map((d) => (
              <ChipItem key={d.id} def={d} />
            ))}
          </ul>
        )}
      </section>
      <div className="palette-footer">
        <button type="button" className="text-button" onClick={() => fileRef.current?.click()}>
          가져오기
        </button>
        <button type="button" className="text-button" onClick={exportCurrent}>
          내보내기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </aside>
  );
}
