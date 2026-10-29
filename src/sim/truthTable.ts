import { compile } from './compile';
import { Engine, type EngineSnapshot } from './engine';
import { bitKey, partBits } from './pins';
import { INPUT_KINDS } from './primitives';
import type { Bit, Circuit, Library, Part } from './types';

export const AUTO_INPUT_LIMIT = 8;
/** 순차 회로의 이전 상태 탐색 범위 */
const SEARCH_DEPTH = 3;
const SEARCH_WIDTH = 24;

export type Cell = Bit | 'hold' | 'forbidden' | 'mixed';

export interface TruthRow {
  inputs: Bit[];
  outputs: Cell[];
  forbidden: boolean;
}

export interface TruthTable {
  inputs: string[];
  outputs: string[];
  /** 피드백 루프가 있으면 순차 회로 */
  sequential: boolean;
  rows: TruthRow[];
}

export interface PinOrder {
  inputs: string[];
  outputs: string[];
}

const byPosition = (a: Part, b: Part) => a.y - b.y || a.x - b.x;

/** 회로의 입력(SWITCH/PUSH)과 출력(LED) 부품. order에 있는 것이 먼저, 나머지는 위→아래 순. */
export function orderedIO(circuit: Circuit, order?: Partial<PinOrder>): { inputs: Part[]; outputs: Part[] } {
  const sort = (parts: Part[], ids: string[] = []) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    return [...parts].sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity) || byPosition(a, b));
  };
  const isKind = (p: Part, pred: (k: string) => boolean) => p.kind.type === 'primitive' && pred(p.kind.kind);
  return {
    inputs: sort(
      circuit.parts.filter((p) => isKind(p, (k) => INPUT_KINDS.has(k as never))),
      order?.inputs,
    ),
    outputs: sort(
      circuit.parts.filter((p) => isKind(p, (k) => k === 'LED')),
      order?.outputs,
    ),
  };
}

const MACRON = '̄';

export interface IOBit {
  /** 입력이면 엔진 입력 경로(`a`, `a[1]`), 출력이면 핀 키(`y.a`, `y.a[1]`) */
  path: string;
  /** 핀 키 (`a.y[1]`, `led.a[1]`) */
  key: string;
  /** 열 이름: 1비트는 라벨, N비트는 `A[k]` */
  name: string;
}

/** 입출력 부품을 비트 단위로 펼친다 (SPEC 13장 8단계: 진리표는 비트마다 열) */
export function ioBits(io: { inputs: Part[]; outputs: Part[] }): { inputs: IOBit[]; outputs: IOBit[] } {
  const expand = (parts: Part[], pin: string, isInput: boolean) =>
    parts.flatMap((p) => {
      const n = partBits(p);
      const label = p.label ?? p.id;
      return Array.from({ length: n }, (_, k) => {
        const key = bitKey(`${p.id}.${pin}`, k);
        return { path: isInput ? bitKey(p.id, k) : key, key, name: n > 1 ? `${label}[${k}]` : label };
      });
    });
  return { inputs: expand(io.inputs, 'y', true), outputs: expand(io.outputs, 'a', false) };
}

/** Q와 Q̄처럼 서로 반대여야 하는 출력 쌍 */
function complementPairs(names: string[]): [number, number][] {
  const pairs: [number, number][] = [];
  names.forEach((a, i) => {
    names.forEach((b, j) => {
      if (i !== j && (b === a + MACRON || b === `${a}'` || b === `${a}n` || b === `${a}_n`)) pairs.push([i, j]);
    });
  });
  return pairs;
}

function bitsOf(i: number, n: number): Bit[] {
  return Array.from({ length: n }, (_, k) => ((i >> (n - 1 - k)) & 1) as Bit);
}

/**
 * 진리표 자동 생성 (SPEC 7장).
 * - 조합 회로: 입력 2^n 조합마다 안정될 때까지 돌려 출력을 기록.
 * - 순차 회로: 다른 입력으로 만든 이전 상태(예: Q=0, Q=1)마다 같은 입력을 시험해서
 *   모두 같으면 그 값, 이전 출력을 그대로 따르면 '이전 유지', 진동하거나 Q와 Q̄가 같으면 '금지 상태'.
 */
export function truthTable(circuit: Circuit, library: Library = {}, order?: Partial<PinOrder>): TruthTable {
  const io = orderedIO(circuit, order);
  const netlist = compile(circuit, library);
  const engine = new Engine(netlist);
  const { inputs: inBits, outputs: outBits } = ioBits(io);
  const inPaths = inBits.map((b) => b.path);
  const outKeys = outBits.map((b) => b.key);
  const outNames = outBits.map((b) => b.name);
  const pairs = complementPairs(outNames);
  const n = inPaths.length;

  /** 지금 상태에서 입력을 넣고 안정시킨 뒤의 출력. 안정되지 않으면 null. */
  const apply = (combo: Bit[]): Bit[] | null => {
    combo.forEach((v, k) => engine.setInput(inPaths[k]!, v));
    if (!engine.settle()) return null;
    return outKeys.map((k) => engine.readPin(k));
  };
  const forbiddenOutputs = (out: Bit[]) => pairs.some(([i, j]) => out[i] === out[j]);

  const combos = Array.from({ length: 2 ** n }, (_, i) => bitsOf(i, n));
  const fromReset = (combo: Bit[]) => {
    engine.reset();
    return apply(combo);
  };

  if (!engine.hasFeedback) {
    return {
      inputs: inBits.map((b) => b.name),
      outputs: outNames,
      sequential: false,
      rows: combos.map((c) => {
        const out = fromReset(c);
        return { inputs: c, outputs: out ?? outNames.map(() => 'forbidden' as const), forbidden: out === null };
      }),
    };
  }

  // 이전 상태 후보: 초기 상태에서 입력 조합을 차례로 넣어 도달하는 상태 중 안정되고 정상인 것.
  // 플립플롭처럼 처음(모두 0)에는 안정되지 않는 회로도 "클럭 0 → 1"처럼 두세 번 넣으면 정상 상태에 닿는다.
  // 출력 벡터(Q)가 같은 상태는 하나로 본다.
  const priors = new Map<string, { snap: EngineSnapshot; out: Bit[] }>();
  engine.reset();
  let frontier: EngineSnapshot[] = [engine.snapshot()];
  const seen = new Set<string>();
  for (let depth = 0; depth < SEARCH_DEPTH && frontier.length; depth++) {
    const next: EngineSnapshot[] = [];
    for (const state of frontier) {
      for (const c of combos) {
        engine.restore(state);
        const out = apply(c);
        const snap = engine.snapshot();
        const key = snap.values.join('');
        if (seen.has(key)) continue;
        seen.add(key);
        if (out && !forbiddenOutputs(out) && !priors.has(out.join(''))) priors.set(out.join(''), { snap, out });
        next.push(snap);
      }
    }
    // 앞쪽 조합에만 치우치지 않게 고르게 골라 다음 단계로
    frontier = next.length <= SEARCH_WIDTH ? next : Array.from({ length: SEARCH_WIDTH }, (_, i) => next[Math.floor((i * next.length) / SEARCH_WIDTH)]!);
  }

  const rows = combos.map((c): TruthRow => {
    const results: { prior: Bit[]; out: Bit[] | null }[] = [];
    for (const prior of priors.values()) {
      engine.restore(prior.snap);
      results.push({ prior: prior.out, out: apply(c) });
    }
    if (results.length === 0) results.push({ prior: [], out: fromReset(c) });
    const forbidden = results.some((r) => r.out === null || forbiddenOutputs(r.out));
    const outputs = outNames.map((_, k): Cell => {
      if (forbidden) return 'forbidden';
      const vals = results.map((r) => r.out![k]!);
      if (vals.every((v) => v === vals[0])) return vals[0]!;
      if (results.every((r) => r.out![k] === r.prior[k])) return 'hold';
      return 'mixed';
    });
    return { inputs: c, outputs, forbidden };
  });

  return { inputs: inBits.map((b) => b.name), outputs: outNames, sequential: true, rows };
}
