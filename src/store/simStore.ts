import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { compile, CompileError } from '../sim/compile';
import { Engine } from '../sim/engine';
import type { Bit, Circuit, Library } from '../sim/types';

export const MIN_SPEED = 1;
export const MAX_SPEED = 60;

export interface SimState {
  running: boolean;
  /** 초당 틱 수 (1~60Hz) */
  speed: number;
  tick: number;
  /** 화면 갱신 신호 — 값이 바뀐 프레임마다 1씩 증가 */
  version: number;
  oscillating: ReadonlySet<string>;
  hasFeedback: boolean;
  error: string | null;
}

export const engine = new Engine();

export const simStore = createStore<SimState>(() => ({
  running: true,
  speed: 10,
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
    simStore.setState({ error: null });
  } catch (e) {
    if (!(e instanceof CompileError)) throw e;
    engine.load(compile({ parts: [], wires: [] }));
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
    const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(hz)));
    engine.setTicksPerSecond(speed);
    simStore.setState({ speed });
  },
  reset() {
    engine.reset();
    engine.setTicksPerSecond(simStore.getState().speed);
    publish();
  },
  setInput(path: string, v: Bit) {
    engine.setInput(path, v);
    publish();
  },
  toggleSwitch(path: string) {
    engine.setInput(path, engine.inputValue(path) ? 0 : 1);
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
