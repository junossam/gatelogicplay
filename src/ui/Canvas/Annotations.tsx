import { memo, type PointerEvent } from 'react';
import type { Group, Note } from '../../sim/types';
import { GRID, type Rect } from './geometry';

/** 그룹 사각형이 부품보다 바깥으로 나오는 여백 (px) */
const GROUP_PAD = 14;
const LABEL_H = 24;
/** 메모 폭 (px). 높이는 글 길이에 따라 늘어난다. */
export const NOTE_W = 200;

/** 그룹이 차지하는 사각형: 묶은 부품들을 감싸고 여백을 둔다 */
export function groupRect(group: Group, rects: Map<string, Rect>): Rect | null {
  const rs = group.parts.map((id) => rects.get(id)).filter((r): r is Rect => !!r);
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x)) - GROUP_PAD;
  const y0 = Math.min(...rs.map((r) => r.y)) - GROUP_PAD - 8;
  const x1 = Math.max(...rs.map((r) => r.x + r.w)) + GROUP_PAD;
  const y1 = Math.max(...rs.map((r) => r.y + r.h)) + GROUP_PAD;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 메모가 차지하는 대략의 사각형 (범위 선택용) */
export function noteRect(note: Note): Rect {
  const lines = Math.max(1, note.text.split('\n').length);
  return { x: note.x * GRID, y: note.y * GRID, w: NOTE_W, h: 20 + lines * 18 };
}

interface GroupsProps {
  groups: Group[];
  rects: Map<string, Rect>;
  selectedId: string | null;
  onLabelDown(e: PointerEvent, groupId: string): void;
}

/** 그룹: 점선 사각형과 왼쪽 위 이름표. 이름표를 누르면 그룹 전체 선택(끌면 이동), 두 번 누르면 이름 바꾸기. */
export const GroupsLayer = memo(function GroupsLayer({ groups, rects, selectedId, onLabelDown }: GroupsProps) {
  return (
    <g className="groups">
      {groups.map((g) => {
        const r = groupRect(g, rects);
        if (!r) return null;
        const selected = g.id === selectedId;
        const labelW = Math.max(48, g.name.length * 13 + 20);
        return (
          <g key={g.id} className={`group${selected ? ' selected' : ''}`} data-testid={`group-${g.id}`}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={8} className="group-rect" pointerEvents="none" />
            <g
              className="group-label"
              data-group-id={g.id}
              role="button"
              aria-label={`그룹 ${g.name} 선택`}
              onPointerDown={(e) => onLabelDown(e, g.id)}
            >
              <rect x={r.x} y={r.y - LABEL_H - 2} width={labelW} height={LABEL_H} rx={5} className="group-label-bg" />
              <text x={r.x + 10} y={r.y - 9} className="group-label-text">
                {g.name}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
});

interface NotesProps {
  notes: Note[];
  selected: Set<string>;
  editingId: string | null;
  readOnly: boolean;
  onNoteDown(e: PointerEvent, noteId: string): void;
  onEditDone(noteId: string, text: string): void;
}

/** 메모: 캔버스 위 글 상자. 두 번 누르면 바로 고칠 수 있다. */
export function NotesLayer({ notes, selected, editingId, readOnly, onNoteDown, onEditDone }: NotesProps) {
  return (
    <g className="notes">
      {notes.map((n) => (
        // 높이는 넉넉히 잡고 바깥 영역은 포인터를 통과시킨다 (안의 상자만 받는다)
        <foreignObject key={n.id} x={n.x * GRID} y={n.y * GRID} width={NOTE_W} height={1000} pointerEvents="none" style={{ overflow: 'visible' }}>
          <div
            className={`note${selected.has(n.id) ? ' selected' : ''}`}
            data-note-id={n.id}
            data-testid={`note-${n.id}`}
            onPointerDown={(e) => onNoteDown(e, n.id)}
          >
            {editingId === n.id && !readOnly ? (
              <textarea
                className="note-edit"
                aria-label="메모 내용"
                autoFocus
                defaultValue={n.text}
                rows={Math.max(3, n.text.split('\n').length + 1)}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  // 캔버스 단축키로 넘기지 않는다. Esc나 Ctrl+Enter로 마침.
                  e.stopPropagation();
                  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => onEditDone(n.id, e.currentTarget.value)}
              />
            ) : n.text ? (
              <div className="note-text">{n.text}</div>
            ) : (
              <div className="note-text muted">메모 (두 번 눌러 쓰기)</div>
            )}
          </div>
        </foreignObject>
      ))}
    </g>
  );
}
