import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { challengeById, isAllowedIn } from '../../model/challenges';
import { chipsUsedIn, groupByCategory, circuitUses, usedBy, withDependencies, wouldCreateCycle } from '../../model/library';
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
  { kind: 'SEG8', name: '8세그먼트', desc: 'a~g와 점(dp) 표시' },
];

const CLOCK: Item = { kind: 'CLOCK', name: '클럭', desc: '반주기마다 반전 (선택)' };

const BUS: Item[] = [
  { kind: 'SPLIT', name: '나누기', desc: '버스 → 비트 (기본 4비트)' },
  { kind: 'MERGE', name: '묶기', desc: '비트 → 버스 (기본 4비트)' },
];

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

function PaletteButton({ item }: { item: Item }) {
  const kind: PartKind = { type: 'primitive', kind: item.kind };
  const allowed = useAllowed(kind);
  const armed = useUi((s) => sameKind(s.armed, kind));
  const setArmed = useUi((s) => s.setArmed);
  return (
    <button
      type="button"
      className={`palette-item${item.kind === 'CLOCK' ? ' optional' : ''}`}
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
      <span className="palette-name">{item.name}</span>
      {item.desc && <span className="palette-desc">{item.desc}</span>}
    </button>
  );
}

interface MenuAction {
  label: string;
  icon: string;
  disabled?: boolean;
  danger?: boolean;
  run(): void;
}

/** ⚙ 버튼을 누르면 뜨는 팝업 메뉴. 바깥 클릭·Esc로 닫히고, ↑↓로 항목을 옮긴다. 스크롤하면 버튼을 따라간다. */
function ChipMenu({ name, actions }: { name: string; actions: MenuAction[] }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  // 메뉴 폭 168px — 화면 밖으로 나가지 않게 버튼 아래(모자라면 위)에 놓는다
  const place = () => {
    const r = buttonRef.current!.getBoundingClientRect();
    const h = 44 * actions.length + 10;
    const top = r.bottom + 4 + h <= window.innerHeight - 8 ? r.bottom + 4 : Math.max(8, r.top - 4 - h);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 176)), top });
  };
  const close = (focusButton = false) => {
    setPos(null);
    if (focusButton) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
    // place는 매 렌더 새로 만들어지지만 버튼 위치만 읽으므로 열릴 때 한 번 등록하면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = () => (open ? close() : place());

  const onKey = (e: KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      items[(i + d + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') close();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="chip-menu-button"
        aria-label={`${name} 설정`}
        title="설정"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {pos && (
        <div ref={menuRef} className="chip-menu" role="menu" aria-label={`${name} 설정`} style={pos} onKeyDown={onKey}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className={`chip-menu-item${a.danger ? ' danger' : ''}`}
              disabled={a.disabled}
              onClick={() => {
                close(true);
                a.run();
              }}
            >
              <span aria-hidden="true" className="chip-menu-icon">
                {a.icon}
              </span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
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
        className="palette-item chip-button"
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
        <span className="palette-name">{def.name}</span>
        <span className="palette-desc mono">
          {def.inputs.length}→{def.outputs.length}
        </span>
      </button>
      <ChipMenu
        name={def.name}
        actions={[
          { label: '편집', icon: '✎', disabled: isOpen || inChallenge, run: () => confirmLeaveChip(() => editorStore.getState().openChip(def.id)) },
          { label: '분류 바꾸기', icon: '🗀', run: () => useUi.getState().setCategoryEdit({ chipId: def.id }) },
          { label: '삭제', icon: '🗑', danger: true, run: remove },
        ]}
      />
    </li>
  );
}

const COLLAPSED_KEY = 'logiclab:v1:palette-collapsed';

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** 접은 분류 (브라우저에 기억) */
function useCollapsed(): [Set<string>, (category: string) => void] {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = (category: string) => {
    const next = new Set(collapsed);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // 저장 실패는 무시 (이번 세션에만 적용)
    }
  };
  return [collapsed, toggle];
}

/** 분류 하나: 머리글(접기/펼치기, 이름 바꾸기, 칩을 끌어다 놓으면 이 분류로)과 칩 목록 */
function ChipGroup({
  category,
  defs,
  showHeader,
  forceOpen,
  collapsed,
  toggle,
}: {
  category: string;
  defs: ChipDef[];
  showHeader: boolean;
  forceOpen: boolean;
  collapsed: Set<string>;
  toggle(category: string): void;
}) {
  const [dropping, setDropping] = useState(false);
  const label = category || '분류 없음';
  const open = forceOpen || !collapsed.has(category);
  const list = (
    <ul className="chip-list">
      {defs.map((d) => (
        <ChipItem key={d.id} def={d} />
      ))}
    </ul>
  );
  if (!showHeader) return list;
  return (
    <div
      className={`chip-group${dropping ? ' dropping' : ''}`}
      data-testid={`chip-group-${label}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PART_DRAG_MIME)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        setDropping(false);
        const raw = e.dataTransfer.getData(PART_DRAG_MIME);
        if (!raw.startsWith('chip:')) return;
        e.preventDefault();
        editorStore.getState().setChipCategory(raw.slice(5), category || null);
      }}
    >
      <div className="chip-group-head">
        <button type="button" className="chip-group-toggle" aria-expanded={open} onClick={() => toggle(category)}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {label} <span className="muted small">{defs.length}</span>
        </button>
        {category && (
          <button type="button" className="icon-button" aria-label={`${label} 분류 이름 바꾸기`} title="분류 이름 바꾸기" onClick={() => useUi.getState().setCategoryEdit({ rename: category })}>
            ✎
          </button>
        )}
      </div>
      {open && list}
    </div>
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
/**
 * 지금 회로를 4.3절 파일로 묶는다. 칩 편집 중이면 그 칩과 의존 칩.
 * 작업 공간이면 내보내기는 라이브러리 전체, 공유는 작업 공간이 쓰는 칩만 (링크를 짧게).
 */
export function currentBundle(purpose: 'export' | 'share'): { filename: string; json: string } {
  const st = editorStore.getState();
  if (st.openChipId) {
    const def = st.library[st.openChipId]!;
    return { filename: `${def.name}.gatelogicplay.json`, json: serializeBundle(withDependencies([def.id], st.library), { parts: [], wires: [] }, def.id) };
  }
  const ws = workspaceOf(st);
  const used = withDependencies(chipsUsedIn(ws), st.library);
  return { filename: 'workspace.gatelogicplay.json', json: serializeBundle(purpose === 'export' ? { ...st.library, ...used } : used, ws, null) };
}

export function exportCurrent() {
  const { filename, json } = currentBundle('export');
  download(filename, json);
}

export function Palette() {
  const [query, setQuery] = useState('');
  const library = useEditor((s) => s.library);
  const fileRef = useRef<HTMLInputElement>(null);
  const gates = GATES.filter((i) => matches(i.name, query));
  const clockEnabled = useSettings((s) => s.clockEnabled);
  const io = [...IO, ...(clockEnabled ? [CLOCK] : [])].filter((i) => matches(i.name, query, `${i.kind} ${i.desc ?? ''}`));
  const bus = BUS.filter((i) => matches(i.name, query, `${i.kind} ${i.desc ?? ''} 버스`));
  const chips = Object.values(library)
    .filter((d) => matches(d.name, query, d.category ?? ''))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const groups = groupByCategory(chips);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const hasCategories = groups.some(([c]) => c !== '');

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
          <div className="palette-grid">
            {io.map((item) => (
              <PaletteButton key={item.kind} item={item} />
            ))}
          </div>
        </section>
      )}
      {bus.length > 0 && (
        <section>
          <h2 className="panel-title">버스</h2>
          <div className="palette-grid">
            {bus.map((item) => (
              <PaletteButton key={item.kind} item={item} />
            ))}
          </div>
          <p className="muted small">스위치·LED·게이트의 비트 수는 인스펙터에서 바꿉니다.</p>
        </section>
      )}
      <section>
        <h2 className="panel-title">내 칩</h2>
        {chips.length === 0 ? (
          <p className="muted small">{Object.keys(library).length ? '검색 결과가 없습니다.' : '아직 저장한 칩이 없습니다.'}</p>
        ) : (
          groups.map(([category, defs]) => (
            <ChipGroup
              key={category}
              category={category}
              defs={defs}
              showHeader={hasCategories}
              forceOpen={!!query.trim()}
              collapsed={collapsed}
              toggle={toggleCollapsed}
            />
          ))
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
