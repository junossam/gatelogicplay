import { useEffect, useRef } from 'react';
import { allowedGates, challengeById, grade, type Grade, type Target } from '../../model/challenges';
import type { Cell } from '../../sim/truthTable';
import type { Circuit, Library } from '../../sim/types';
import { challengeStore, updateProgress } from '../../store/challengeStore';
import { useEditor } from '../../store/editorStore';
import { sameTopology } from '../../store/simBinding';
import { useUi } from '../../store/uiStore';
import { exitChallenge, restartChallenge } from './actions';

function TargetCell({ t }: { t: Target }) {
  if (t === 'hold') return <span className="cell-hold">유지</span>;
  if (t === 'x') return <span className="muted">상관없음</span>;
  return <span className={`bit bit-${t}`}>{t}</span>;
}

function ActualCell({ c }: { c: Cell }) {
  if (c === 'hold') return <span className="cell-hold">유지</span>;
  if (c === 'forbidden') return <span className="warn">금지</span>;
  if (c === 'mixed') return <span className="muted">?</span>;
  return <span className={`bit bit-${c}`}>{c}</span>;
}

/** 구조(연결·라벨)가 바뀔 때만 다시 채점 */
function useGrade(id: string): Grade | null {
  const circuit = useEditor((s) => s.circuit);
  const library = useEditor((s) => s.library);
  const cache = useRef<{ id: string; circuit: Circuit; library: Library; grade: Grade } | null>(null);
  const ch = challengeById(id);
  if (!ch) return null;
  const c = cache.current;
  if (c && c.id === id && c.library === library && sameTopology(c.circuit, circuit) && c.circuit.parts.every((p, i) => p.label === circuit.parts[i]!.label)) {
    return c.grade;
  }
  const g = grade(ch, circuit, library);
  cache.current = { id, circuit, library, grade: g };
  return g;
}

export function ChallengePanel({ id }: { id: string }) {
  const ch = challengeById(id)!;
  const g = useGrade(id);

  // 통과하면 진행 기록에 남긴다 (최소 게이트 수)
  useEffect(() => {
    if (g?.status !== 'pass') return;
    const best = challengeStore.getState().progress[id]?.bestGates;
    updateProgress(id, { solved: true, bestGates: best == null ? g.gates : Math.min(best, g.gates) });
  }, [g, id]);

  return (
    <section className="challenge-panel" aria-label="챌린지" data-testid="challenge-panel">
      <h2 className="panel-title">챌린지 · {ch.title}</h2>
      <p className="small">{ch.description}</p>
      <p className="muted small">쓸 수 있는 게이트: {ch.allowed ? allowedGates(ch).join(', ') : '기본 게이트 전부'}</p>

      <div className={`grade ${g?.status ?? ''}`} role="status" data-testid="grade">
        {g?.status === 'pass' && (
          <>
            <strong>통과!</strong> 게이트 {g.gates}개 {g.gates <= ch.par ? '· 모범 답안과 같아요' : `· 모범 답안은 ${ch.par}개`}
          </>
        )}
        {g?.status === 'fail' && (
          <>
            <strong>
              {g.rows.length}행 중 {g.wrong}행이 틀렸습니다
            </strong>
          </>
        )}
        {g?.status === 'invalid' && <span>{g.message}</span>}
      </div>

      {g && g.status !== 'invalid' && (
        <div className="truth-wrap">
          <table className="truth-table mono grade-table" data-testid="grade-table">
            <thead>
              <tr>
                {ch.inputs.map((n) => (
                  <th key={`i${n}`} className="in" scope="col">
                    {n}
                  </th>
                ))}
                {ch.outputs.map((n) => (
                  <th key={`t${n}`} className="out" scope="col">
                    목표 {n}
                  </th>
                ))}
                {ch.outputs.map((n) => (
                  <th key={`a${n}`} scope="col">
                    결과 {n}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">채점</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i} className={r.ok ? 'ok' : 'wrong'} data-ok={r.ok}>
                  {r.inputs.map((b, k) => (
                    <td key={`i${k}`} className="in">
                      <span className={`bit bit-${b}`}>{b}</span>
                    </td>
                  ))}
                  {r.expected.map((t, k) => (
                    <td key={`t${k}`} className="out">
                      <TargetCell t={t} />
                    </td>
                  ))}
                  {r.actual.slice(0, ch.outputs.length).map((c, k) => (
                    <td key={`a${k}`}>
                      <ActualCell c={c} />
                    </td>
                  ))}
                  <td aria-label={r.ok ? '맞음' : '틀림'}>{r.ok ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="challenge-actions">
        <button type="button" className="text-button" onClick={() => useUi.getState().setChallengesOpen(true)}>
          목록
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            useUi.getState().setMessage({
              title: '처음부터 다시',
              body: '이 챌린지의 회로를 지우고 시작 상태로 되돌릴까요?',
              confirmLabel: '다시 시작',
              danger: true,
              onConfirm: () => restartChallenge(id),
            })
          }
        >
          처음부터
        </button>
        <button type="button" className="text-button" onClick={exitChallenge}>
          나가기
        </button>
      </div>
    </section>
  );
}
