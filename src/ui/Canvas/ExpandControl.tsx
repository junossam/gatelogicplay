import { useUi } from '../../store/uiStore';
import { useDisplayView } from './expand';

const LEVELS = [
  [0, '보지 않기'],
  [1, '1단계'],
  [Infinity, '전체'],
] as const;

/** 칩 내부 보기 단계 (인스펙터 맨 위). 보는 회로에 칩이 있을 때만. */
export function ExpandControl() {
  const depth = useUi((s) => s.expandDepth);
  const { hasChips, expanded } = useDisplayView();
  if (!hasChips && !expanded) return null;
  return (
    <div className="expand-control" role="group" aria-label="칩 내부 보기">
      <span className="expand-label">칩 내부</span>
      {LEVELS.map(([d, label]) => (
        <button key={label} type="button" aria-pressed={depth === d} onClick={() => useUi.getState().setExpandDepth(d)}>
          {label}
        </button>
      ))}
    </div>
  );
}
