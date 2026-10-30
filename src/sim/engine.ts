import type { Netlist } from './compile';
import { evalGateCount } from './primitives';
import type { Bit } from './types';

/** 재컴파일할 때 이어받을 상태 */
export interface EngineSnapshot {
  netIds: readonly string[];
  values: Uint8Array;
  tickCount: number;
  inputs: [string, Bit][];
}

export interface TickResult {
  tick: number;
  /** 이번 호출 동안 값이 바뀐 Net id */
  changed: string[];
  /** 지금 진동 중인 Net id */
  oscillating: string[];
}

/** 진동 판정 창 (CLAUDE.md 규칙 4) */
const OSC_WINDOW = 32;
const OSC_CHANGES = 16;

// VCC는 입력 없이 1을 내는 노드 — 다른 게이트처럼 첫 틱이 지나면 1이 된다 (초기 Net은 모두 0)
const KIND_CODE = { AND: 1, OR: 2, XOR: 3, NAND: 4, NOR: 5, XNOR: 6, NOT: 7, VCC: 8, LUT: 9 } as const;
type GateCode = (typeof KIND_CODE)[keyof typeof KIND_CODE];
const CODE_KIND = ['', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT', 'VCC', 'LUT'] as const;
const LUT_CODE = KIND_CODE.LUT;

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * 이벤트 기반 단위 지연 엔진 (SPEC 5.2).
 * 한 틱: (1) 사용자 입력·클럭 반영 → (2) 바뀐 Net의 팬아웃 노드 평가 → (3) 바뀐 출력을 적용하고 틱 증가.
 * 따라서 게이트 출력은 입력이 바뀐 다음 틱에 보인다.
 */
export class Engine {
  netlist: Netlist = { netIds: [], nodes: [], pinNet: new Map(), inputs: new Map(), topNets: [] };
  /** 매 틱이 끝난 뒤 호출 (파형 기록용) */
  onTick: ((tick: number, values: Uint8Array) => void) | null = null;
  values = new Uint8Array(0);
  tickCount = 0;

  private netIndex = new Map<string, number>();
  // 게이트 노드 (구조체 배열 대신 타입 배열)
  private gateCode = new Uint8Array(0);
  // 게이트 입력 Net (CSR: gateInStart[g] ~ gateInStart[g+1]) — 입력 2~8개 게이트
  private gateInStart = new Int32Array(1);
  private gateIns = new Int32Array(0);
  private gateOut = new Int32Array(0);
  private gateStamp = new Int32Array(0);
  // 진리표 부품: 게이트별 표 시작 위치 (lutBits[lutStart[g] + 입력 조합 번호])
  private lutStart = new Int32Array(0);
  private lutBits = new Uint8Array(0);
  // Net → 그 Net을 읽는 게이트 (CSR)
  private fanStart = new Int32Array(1);
  private fan = new Int32Array(0);
  // 클럭
  private clockNet = new Int32Array(0);
  private clockHz = new Float64Array(0);
  private clockHalf = new Int32Array(0);
  private ticksPerSecond = 10;
  // 작업 버퍼
  private dirty = new Int32Array(0);
  private dirtyLen = 0;
  private evalAll = true;
  private schedNet = new Int32Array(0);
  private schedVal = new Uint8Array(0);
  private pending = new Map<number, Bit>();
  // 진동 감지: Net별 최근 32틱 변화 비트맵, 강연결요소(피드백 루프)별 마지막 외부/내부 변화
  private hist = new Uint32Array(0);
  private histTick = new Int32Array(0);
  private netScc = new Int32Array(0);
  private sccNets: number[][] = [];
  private sccLastExt = new Int32Array(0);
  private sccLastInt = new Int32Array(0);
  private sccOsc = new Uint8Array(0);
  private oscList: string[] = [];

  constructor(netlist?: Netlist) {
    if (netlist) this.load(netlist);
  }

  /** 넷리스트를 올린다. carry가 있으면 같은 id의 Net 값과 입력 상태를 이어받는다(편집 중 재컴파일). */
  load(netlist: Netlist, carry?: EngineSnapshot): void {
    this.netlist = netlist;
    const nNets = netlist.netIds.length;
    this.netIndex = new Map(netlist.netIds.map((id, i) => [id, i]));
    this.values = new Uint8Array(nNets);

    const gates = netlist.nodes.filter((n) => n.kind in KIND_CODE);
    const clocks = netlist.nodes.filter((n) => n.kind === 'CLOCK' && n.out >= 0);
    const nG = gates.length;
    this.gateCode = new Uint8Array(nG);
    this.gateInStart = new Int32Array(nG + 1);
    gates.forEach((g, i) => (this.gateInStart[i + 1] = this.gateInStart[i]! + g.ins.length));
    this.gateIns = new Int32Array(this.gateInStart[nG]!);
    this.gateOut = new Int32Array(nG);
    this.gateStamp = new Int32Array(nG).fill(-1);
    const fanCount = new Int32Array(nNets + 1);
    gates.forEach((g, i) => {
      this.gateCode[i] = KIND_CODE[g.kind as keyof typeof KIND_CODE];
      g.ins.forEach((n, k) => (this.gateIns[this.gateInStart[i]! + k] = n));
      this.gateOut[i] = g.out;
      for (const n of new Set(g.ins)) if (n >= 0) fanCount[n + 1]!++;
    });
    this.lutStart = new Int32Array(nG).fill(-1);
    const lutSize = gates.reduce((s, g) => s + (g.lut?.length ?? 0), 0);
    this.lutBits = new Uint8Array(lutSize);
    let lutAt = 0;
    gates.forEach((g, i) => {
      if (!g.lut) return;
      this.lutStart[i] = lutAt;
      this.lutBits.set(g.lut, lutAt);
      lutAt += g.lut.length;
    });
    for (let i = 0; i < nNets; i++) fanCount[i + 1]! += fanCount[i]!;
    this.fanStart = fanCount;
    this.fan = new Int32Array(fanCount[nNets]!);
    const fill = fanCount.slice();
    gates.forEach((g, i) => {
      for (const n of new Set(g.ins)) if (n >= 0) this.fan[fill[n]!++] = i;
    });

    this.clockNet = Int32Array.from(clocks.map((c) => c.out));
    this.clockHz = Float64Array.from(clocks.map((c) => c.hz ?? 1));
    this.clockHalf = new Int32Array(clocks.length);
    this.updateClockHalf();

    this.dirty = new Int32Array(nNets);
    this.schedNet = new Int32Array(nG);
    this.schedVal = new Uint8Array(nG);
    this.hist = new Uint32Array(nNets);
    this.histTick = new Int32Array(nNets);
    this.computeScc(gates.length);

    this.tickCount = 0;
    this.pending.clear();
    this.dirtyLen = 0;
    this.evalAll = true;
    this.sccLastExt.fill(0);
    this.sccLastInt.fill(-1_000_000);
    this.sccOsc.fill(0);
    this.oscList = [];

    if (carry) {
      this.tickCount = carry.tickCount;
      this.sccLastExt.fill(this.tickCount);
      const prevIndex = new Map(carry.netIds.map((id, i) => [id, i]));
      for (let i = 0; i < nNets; i++) {
        const prev = prevIndex.get(netlist.netIds[i]!);
        if (prev !== undefined) this.values[i] = carry.values[prev]!;
      }
      for (const [path, v] of carry.inputs) this.setInput(path, v);
    }
  }

  /** 같은 넷리스트에서 찍어 둔 상태로 되돌린다 (진리표 탐색용) */
  restore(snap: EngineSnapshot): void {
    this.values.set(snap.values);
    this.tickCount = snap.tickCount;
    // 틱을 되감으므로 "이번 틱에 평가함" 표시도 지운다
    this.gateStamp.fill(-1);
    this.pending.clear();
    this.dirtyLen = 0;
    this.evalAll = true;
    for (const [path, v] of snap.inputs) this.setInput(path, v);
  }

  snapshot(): EngineSnapshot {
    return {
      netIds: this.netlist.netIds,
      values: this.values.slice(),
      tickCount: this.tickCount,
      inputs: [...this.netlist.inputs.keys()].map((path) => [path, this.inputValue(path)]),
    };
  }

  /** 초기 상태로 되돌린다: 모든 Net 0, 틱 0 (SPEC 5.3). */
  reset(): void {
    this.load(this.netlist);
  }

  setTicksPerSecond(tps: number): void {
    this.ticksPerSecond = tps;
    this.updateClockHalf();
  }

  private updateClockHalf() {
    for (let i = 0; i < this.clockHz.length; i++) {
      this.clockHalf[i] = Math.max(1, Math.round(this.ticksPerSecond / (2 * this.clockHz[i]!)));
    }
  }

  /** 사용자 입력(SWITCH/PUSH 경로)을 다음 틱 시작에 반영한다. */
  setInput(partPath: string, v: Bit): void {
    const input = this.netlist.inputs.get(partPath);
    if (input) this.pending.set(input.net, v);
  }

  /** 다음 틱에 반영될 값까지 포함한 입력 값 */
  inputValue(partPath: string): Bit {
    const input = this.netlist.inputs.get(partPath);
    if (!input) return 0;
    return this.pending.get(input.net) ?? (this.values[input.net] as Bit);
  }

  read(netId: string): Bit {
    const i = this.netIndex.get(netId);
    return i === undefined ? 0 : (this.values[i] as Bit);
  }

  readNet(i: number): Bit {
    return i < 0 ? 0 : (this.values[i] as Bit);
  }

  readPin(key: string): Bit {
    return this.readNet(this.netlist.pinNet.get(key) ?? -1);
  }

  /** 다음 틱에 할 일이 없으면 true */
  get idle(): boolean {
    return this.dirtyLen === 0 && !this.evalAll && this.pending.size === 0;
  }

  get hasFeedback(): boolean {
    return this.sccNets.length > 0;
  }

  /** Net이 속한 피드백 루프 번호, 루프가 아니면 -1 */
  loopOf(netId: string): number {
    const i = this.netIndex.get(netId);
    return i === undefined ? -1 : this.netScc[i]!;
  }

  indexOf(netId: string): number {
    return this.netIndex.get(netId) ?? -1;
  }

  get oscillating(): readonly string[] {
    return this.oscList;
  }

  tick(n = 1): TickResult {
    const changed = new Set<number>();
    for (let i = 0; i < n; i++) this.step(changed);
    return { tick: this.tickCount, changed: [...changed].map((c) => this.netlist.netIds[c]!), oscillating: this.oscList };
  }

  /**
   * 입력이 바뀌지 않는다고 보고 변화가 멈출 때까지 돌린다.
   * 안정 판정은 `2 × 노드 수` 틱 (SPEC 5.3). 그 안에 멈추면 true.
   */
  settle(maxTicks = 2 * this.netlist.nodes.length + 4): boolean {
    for (let i = 0; i < maxTicks; i++) {
      if (this.idle && this.clockNet.length === 0) return true;
      this.step(null);
    }
    return this.idle;
  }

  private markDirty(net: number) {
    this.dirty[this.dirtyLen++] = net;
  }

  private step(changed: Set<number> | null) {
    const t = this.tickCount;
    const values = this.values;

    // 1. 사용자 입력과 클럭은 틱 시작에 Net 값으로 바로 반영
    for (const [net, v] of this.pending) {
      if (values[net] !== v) {
        values[net] = v;
        this.markDirty(net);
        this.recordChange(net, t);
        changed?.add(net);
      }
    }
    this.pending.clear();
    for (let c = 0; c < this.clockNet.length; c++) {
      if (t > 0 && t % this.clockHalf[c]! === 0) {
        const net = this.clockNet[c]!;
        values[net] = values[net] ? 0 : 1;
        this.markDirty(net);
        this.recordChange(net, t);
        changed?.add(net);
      }
    }

    // 2. 영향 받는 노드 평가
    let sched = 0;
    const evaluate = (g: number) => {
      if (this.gateStamp[g] === t) return;
      this.gateStamp[g] = t;
      const code = this.gateCode[g] as GateCode;
      const s0 = this.gateInStart[g]!;
      const s1 = this.gateInStart[g + 1]!;
      let v: Bit;
      if (code === LUT_CODE) {
        // 진리표: 입력을 A부터 높은 자리로 읽은 번호의 행
        let idx = 0;
        for (let k = s0; k < s1; k++) {
          const n = this.gateIns[k]!;
          idx = (idx << 1) | (n >= 0 ? values[n]! : 0);
        }
        v = this.lutBits[this.lutStart[g]! + idx] as Bit;
      } else {
        let ones = 0;
        for (let k = s0; k < s1; k++) {
          const n = this.gateIns[k]!;
          if (n >= 0) ones += values[n]!;
        }
        v = evalGateCount(CODE_KIND[code], ones, s1 - s0);
      }
      const out = this.gateOut[g]!;
      if (out >= 0 && values[out] !== v) {
        this.schedNet[sched] = out;
        this.schedVal[sched] = v;
        sched++;
      }
    };
    if (this.evalAll) {
      this.evalAll = false;
      for (let g = 0; g < this.gateCode.length; g++) evaluate(g);
    }
    const nDirty = this.dirtyLen;
    for (let d = 0; d < nDirty; d++) {
      const net = this.dirty[d]!;
      const srcScc = this.netScc[net]!;
      for (let k = this.fanStart[net]!; k < this.fanStart[net + 1]!; k++) {
        const g = this.fan[k]!;
        const scc = this.netScc[this.gateOut[g]!] ?? -1;
        if (scc >= 0 && scc !== srcScc) this.sccLastExt[scc] = t;
        evaluate(g);
      }
    }

    // 3. 다음 틱 값 적용
    this.dirtyLen = 0;
    for (let s = 0; s < sched; s++) {
      const net = this.schedNet[s]!;
      values[net] = this.schedVal[s]!;
      this.markDirty(net);
      this.recordChange(net, t);
      changed?.add(net);
      const scc = this.netScc[net]!;
      if (scc >= 0) this.sccLastInt[scc] = t;
    }
    this.tickCount = t + 1;
    this.updateOscillation();
    this.onTick?.(this.tickCount, values);
  }

  private recordChange(net: number, t: number) {
    const shift = t - this.histTick[net]!;
    this.hist[net] = shift >= OSC_WINDOW ? 1 : ((this.hist[net]! << shift) | 1) >>> 0;
    this.histTick[net] = t;
  }

  private changesInWindow(net: number): number {
    const shift = this.tickCount - 1 - this.histTick[net]!;
    if (shift >= OSC_WINDOW) return 0;
    return popcount((this.hist[net]! << shift) >>> 0);
  }

  /**
   * 진동 판정 (SPEC 5.3 + CLAUDE.md 규칙 4)
   * - 피드백 루프 안의 Net이 최근 32틱 동안 16번 넘게 바뀌었거나,
   * - 루프 바깥에서 들어오는 신호가 멈춘 뒤 `2 × 루프 노드 수` 틱이 지나도 루프 안에서 변화가 계속되면 진동.
   * 두 번째 조건이 없으면 NOT 3개 루프(주기 6틱, 32틱에 약 11번 변화)를 잡지 못한다.
   */
  private updateOscillation() {
    const t = this.tickCount - 1;
    let dirty = false;
    for (let c = 0; c < this.sccNets.length; c++) {
      const nets = this.sccNets[c]!;
      const limit = 2 * nets.length + 2;
      let osc = this.sccLastInt[c]! - this.sccLastExt[c]! > limit && t - this.sccLastInt[c]! <= limit;
      if (!osc && t - this.sccLastInt[c]! < OSC_WINDOW) {
        for (const net of nets) {
          if (this.changesInWindow(net) > OSC_CHANGES) {
            osc = true;
            break;
          }
        }
      }
      const v = osc ? 1 : 0;
      if (this.sccOsc[c] !== v) {
        this.sccOsc[c] = v;
        dirty = true;
      }
    }
    if (dirty) {
      const list: string[] = [];
      for (let c = 0; c < this.sccNets.length; c++) {
        if (this.sccOsc[c]) for (const net of this.sccNets[c]!) list.push(this.netlist.netIds[net]!);
      }
      this.oscList = list;
    }
  }

  /** 게이트 그래프의 강연결요소 중 루프(크기 2 이상 또는 자기 루프)를 찾는다 — 반복형 Tarjan. */
  private computeScc(nG: number) {
    const nNets = this.values.length;
    this.netScc = new Int32Array(nNets).fill(-1);
    const index = new Int32Array(nG).fill(-1);
    const low = new Int32Array(nG);
    const onStack = new Uint8Array(nG);
    const stack: number[] = [];
    const sccs: number[][] = [];
    let counter = 0;
    const succ = (g: number, k: number): number => this.fan[this.fanStart[this.gateOut[g]!]! + k]!;
    const succCount = (g: number) => (this.gateOut[g]! < 0 ? 0 : this.fanStart[this.gateOut[g]! + 1]! - this.fanStart[this.gateOut[g]!]!);

    for (let root = 0; root < nG; root++) {
      if (index[root] !== -1) continue;
      const work: [number, number][] = [[root, 0]];
      index[root] = low[root] = counter++;
      stack.push(root);
      onStack[root] = 1;
      while (work.length) {
        const frame = work[work.length - 1]!;
        const [v, k] = frame;
        if (k < succCount(v)) {
          frame[1]++;
          const w = succ(v, k);
          if (index[w] === -1) {
            index[w] = low[w] = counter++;
            stack.push(w);
            onStack[w] = 1;
            work.push([w, 0]);
          } else if (onStack[w]) {
            low[v] = Math.min(low[v]!, index[w]!);
          }
        } else {
          work.pop();
          const parent = work[work.length - 1];
          if (parent) low[parent[0]] = Math.min(low[parent[0]]!, low[v]!);
          if (low[v] === index[v]) {
            const comp: number[] = [];
            let w: number;
            do {
              w = stack.pop()!;
              onStack[w] = 0;
              comp.push(w);
            } while (w !== v);
            const selfLoop = comp.length === 1 && this.gateIns.subarray(this.gateInStart[v]!, this.gateInStart[v + 1]!).includes(this.gateOut[v]!);
            if (comp.length > 1 || selfLoop) sccs.push(comp);
          }
        }
      }
    }

    this.sccNets = sccs.map((comp, c) => {
      const nets = comp.map((g) => this.gateOut[g]!).filter((n) => n >= 0);
      for (const n of nets) this.netScc[n] = c;
      return nets;
    });
    this.sccLastExt = new Int32Array(sccs.length);
    this.sccLastInt = new Int32Array(sccs.length);
    this.sccOsc = new Uint8Array(sccs.length);
  }
}
