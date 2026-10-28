import type { Bit } from './types';

export const RECORD_SIZE = 512;

/**
 * 파형 링 버퍼 (SPEC 6.5). Net마다 512칸 Uint8Array.
 * 칸 하나는 그 틱이 끝난 뒤의 값이다.
 */
export class Recorder {
  private buffers = new Map<string, Uint8Array>();
  /** Net별 기록 시작 틱 (이전 값은 모름) */
  private since = new Map<string, number>();
  private order: string[] = [];
  private bound: { idx: Int32Array; bufs: Uint8Array[] } = { idx: new Int32Array(0), bufs: [] };
  lastTick = -1;

  /** 기록할 Net 목록. 이미 기록 중인 Net의 과거 값은 유지한다. */
  watch(netIds: string[]): void {
    const keep = new Set(netIds);
    for (const id of [...this.buffers.keys()]) {
      if (!keep.has(id)) {
        this.buffers.delete(id);
        this.since.delete(id);
      }
    }
    for (const id of netIds) {
      if (!this.buffers.has(id)) {
        this.buffers.set(id, new Uint8Array(RECORD_SIZE));
        this.since.set(id, this.lastTick + 1);
      }
    }
    this.order = netIds;
    this.bound = { idx: new Int32Array(0), bufs: [] };
  }

  watching(netId: string): boolean {
    return this.buffers.has(netId);
  }

  push(tick: number, values: Map<string, Bit>): void {
    const slot = ((tick % RECORD_SIZE) + RECORD_SIZE) % RECORD_SIZE;
    this.fillGap(tick);
    for (const [id, buf] of this.buffers) buf[slot] = values.get(id) ?? 0;
    this.lastTick = tick;
  }

  /** 엔진 Net 인덱스 배열로 묶어 두고 빠르게 기록 (매 틱 호출) */
  bind(indexOf: (netId: string) => number): void {
    const ids = this.order.filter((id) => this.buffers.has(id));
    this.bound = { idx: Int32Array.from(ids.map(indexOf)), bufs: ids.map((id) => this.buffers.get(id)!) };
  }

  pushValues(tick: number, values: Uint8Array): void {
    const slot = tick % RECORD_SIZE;
    this.fillGap(tick);
    const { idx, bufs } = this.bound;
    for (let i = 0; i < idx.length; i++) bufs[i]![slot] = idx[i]! >= 0 ? values[idx[i]!]! : 0;
    this.lastTick = tick;
  }

  /** 틱을 건너뛰었으면 그 사이는 직전 값으로 채운다 */
  private fillGap(tick: number) {
    if (this.lastTick < 0 || tick <= this.lastTick + 1) return;
    const from = Math.max(this.lastTick + 1, tick - RECORD_SIZE);
    for (const buf of this.buffers.values()) {
      const prev = buf[this.lastTick % RECORD_SIZE]!;
      for (let t = from; t < tick; t++) buf[t % RECORD_SIZE] = prev;
    }
  }

  /** [from, to] 틱의 값. 기록이 없는 틱은 0. */
  window(netId: string, from: number, to: number): Bit[] {
    const buf = this.buffers.get(netId);
    const out: Bit[] = [];
    const since = Math.max(this.since.get(netId) ?? Infinity, this.lastTick - RECORD_SIZE + 1);
    for (let t = from; t <= to; t++) out.push(buf && t >= since && t <= this.lastTick ? (buf[t % RECORD_SIZE] as Bit) : 0);
    return out;
  }

  /** 가장 오래된 기록 틱 */
  get firstTick(): number {
    return Math.max(0, this.lastTick - RECORD_SIZE + 1);
  }

  /** 틱이 처음부터 다시 시작할 때 (초기화) */
  reset(): void {
    for (const buf of this.buffers.values()) buf.fill(0);
    this.lastTick = -1;
    for (const id of this.since.keys()) this.since.set(id, 0);
  }

  clear(): void {
    for (const buf of this.buffers.values()) buf.fill(0);
    for (const id of this.since.keys()) this.since.set(id, this.lastTick + 1);
  }
}
