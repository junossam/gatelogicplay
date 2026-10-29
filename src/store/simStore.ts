import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { compile, CompileError } from '../sim/compile';
import { Engine } from '../sim/engine';
import { bitKey } from '../sim/pins';
import { Recorder } from '../sim/recorder';
import type { Bit, Circuit, Library } from '../sim/types';

/** 슬라이더 눈금 (초당 틱 수). 느린 쪽을 촘촘하게 — 0.1~1Hz를 0.1 단위로 볼 수 있게 */
export const SPEED_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 10;
export const DEFAULT_SPEED = 1;

/** 속도에 가장 가까운 눈금 번호 */
export function speedStep(hz: number): number {
  let best = 0;
  SPEED_STEPS.forEach((s, i) => {
    if (Math.abs(s - hz) < Math.abs(SPEED_STEPS[best]! - hz)) best = i;
  });
  return best;
}

export interface SimState {
  running: boolean;
  /** 초당 틱 수 (0.1~10Hz) */
  speed: number;
  tick: number;
  /** 화면 갱신 신호 — 값이 바뀐 프레임마다 1씩 증가 */
  version: number;
  oscillating: ReadonlySet<string>;
  hasFeedback: boolean;
  error: string | null;
}

export const engine = new Engine();

/** 여러 비트 스위치의 현재(다음 틱에 반영될) 값 */
export function inputNumber(path: string, bits: number): number {
  let v = 0;
  for (let k = 0; k < bits; k++) v |= engine.inputValue(bitKey(path, k)) << k;
  return v;
}

/** 핀의 N비트 값 (`${경로}.${핀}` 키) */
export function readPinNumber(key: string, bits: number): number {
  let v = 0;
  for (let k = 0; k < bits; k++) v |= engine.readPin(bitKey(key, k)) << k;
  return v;
}
/** 컴파일 오류로 실행을 멈췄는가 (사용자가 멈춘 것과 구분) */
let pausedByError = false;
export const recorder = new Recorder();
engine.onTick = (tick, values) => recorder.pushValues(tick, values);

/** 최상위 Net 외에 추가로 기록할 Net의 접두 경로 (열어 본 칩 내부) */
let extraWatchPrefix: string | null = null;

function rewatch() {
  const { netIds, topNets } = engine.netlist;
  const ids = topNets.map((i) => netIds[i]!);
  if (extraWatchPrefix) for (const id of netIds) if (id.startsWith(extraWatchPrefix)) ids.push(id);
  recorder.watch(ids);
  recorder.bind((id) => engine.indexOf(id));
  recorder.pushValues(engine.tickCount, engine.values);
}

/** 칩 내부를 열면 그 칩의 Net도 기록한다 (Recorder 메모리 절약) */
export function setRecordedPrefix(prefix: string | null) {
  if (prefix === extraWatchPrefix) return;
  extraWatchPrefix = prefix;
  rewatch();
}

export const simStore = createStore<SimState>(() => ({
  running: true,
  speed: DEFAULT_SPEED,
  tick: 0,
  version: 0,
  oscillating: new Set(),
  hasFeedback: false,
  error: null,
}));

export function useSim<T>(selector: (s: SimState) => T): T {
  return useStore(simStore, selector);
}

function publish() {
  const osc = engine.oscillating;
  const prev = simStore.getState();
  simStore.setState({
    tick: engine.tickCount,
    version: prev.version + 1,
    hasFeedback: engine.hasFeedback,
    oscillating: prev.oscillating.size === osc.length && osc.every((id) => prev.oscillating.has(id)) ? prev.oscillating : new Set(osc),
  });
}

/** 회로가 바뀌면 다시 컴파일한다. 같은 id의 Net 값과 스위치 상태는 이어받는다. */
export function loadCircuit(circuit: Circuit, library: Library): void {
  try {
    const netlist = compile(circuit, library);
    engine.load(netlist, engine.snapshot());
    engine.setTicksPerSecond(simStore.getState().speed);
    rewatch();
    // 컴파일 오류 때문에 멈췄던 것이면 오류가 풀리면서 다시 실행
    simStore.setState(pausedByError ? { error: null, running: true } : { error: null });
    pausedByError = false;
  } catch (e) {
    if (!(e instanceof CompileError)) throw e;
    engine.load(compile({ parts: [], wires: [] }));
    if (simStore.getState().running) pausedByError = true;
    simStore.setState({ error: e.message, running: false });
  }
  publish();
}

export const simActions = {
  play() {
    if (!simStore.getState().error) simStore.setState({ running: true });
  },
  pause() {
    simStore.setState({ running: false });
  },
  toggle() {
    if (simStore.getState().running) simActions.pause();
    else simActions.play();
  },
  step() {
    simStore.setState({ running: false });
    engine.tick(1);
    publish();
  },
  setSpeed(hz: number) {
    const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(hz * 10) / 10));
    engine.setTicksPerSecond(speed);
    simStore.setState({ speed });
  },
  reset() {
    engine.reset();
    recorder.reset();
    recorder.pushValues(0, engine.values);
    engine.setTicksPerSecond(simStore.getState().speed);
    publish();
  },
  clearRecording() {
    recorder.clear();
    publish();
  },
  setInput(path: string, v: Bit) {
    engine.setInput(path, v);
    publish();
  },
  toggleSwitch(path: string, bits = 1) {
    if (bits > 1) {
      // 여러 비트 스위치: 클릭마다 1씩 증가 (2^N에서 0으로)
      simActions.setInputNumber(path, (inputNumber(path, bits) + 1) % 2 ** bits, bits);
      return;
    }
    engine.setInput(path, engine.inputValue(path) ? 0 : 1);
    publish();
  },
  /** 여러 비트 스위치에 숫자 값 넣기 (0번 비트 = 가장 낮은 자리) */
  setInputNumber(path: string, value: number, bits: number) {
    for (let k = 0; k < bits; k++) engine.setInput(bitKey(path, k), ((value >> k) & 1) as Bit);
    publish();
  },
  /** 테스트·성능 측정용: 틱 n번 진행 */
  advance(n: number) {
    if (n <= 0) return;
    engine.tick(n);
    publish();
  },
};

/** requestAnimationFrame마다 `속도 / 60`만큼 틱을 돌리고 화면은 한 번만 갱신한다 (SPEC 5.2). */
export function startSimLoop(): () => void {
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    const dt = Math.min(now - last, 250);
    last = now;
    const { running, speed } = simStore.getState();
    if (running) {
      acc += (dt * speed) / 1000;
      const n = Math.floor(acc);
      if (n > 0) {
        acc -= n;
        const before = engine.tickCount;
        engine.tick(n);
        if (engine.tickCount !== before) publish();
      }
    } else {
      acc = 0;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
