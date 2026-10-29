import { describe, expect, it } from 'vitest';
import { bigCircuit } from '../../tests/fixtures/circuits';
import { compile } from './compile';
import { Engine } from './engine';
import { Recorder } from './recorder';

describe('성능 (5단계): 게이트 5천 개', () => {
  it('컴파일과 틱이 한 프레임(16.7ms) 예산 안에 들어간다', () => {
    const circuit = bigCircuit(5000);
    const t0 = performance.now();
    const netlist = compile(circuit);
    const compileMs = performance.now() - t0;
    expect(netlist.nodes.filter((n) => n.kind !== 'SWITCH')).toHaveLength(5000);

    const e = new Engine(netlist);
    const rec = new Recorder();
    rec.watch(netlist.topNets.map((i) => netlist.netIds[i]!));
    rec.bind((id) => e.indexOf(id));
    e.onTick = (t, v) => rec.pushValues(t, v);
    e.settle();

    // 입력을 10틱마다 바꿔 사슬 전체에 변화가 계속 흐르게 한다 (60Hz로 10초 분량)
    const ticks = 600;
    const t1 = performance.now();
    let changed = 0;
    for (let i = 0; i < ticks; i++) {
      if (i % 10 === 0) e.setInput('in', (i / 10) % 2 ? 1 : 0);
      changed += e.tick().changed.length;
    }
    const perTick = (performance.now() - t1) / ticks;
    console.log(`compile ${compileMs.toFixed(1)}ms, tick 평균 ${perTick.toFixed(3)}ms, 변화 ${changed}건`);
    expect(changed).toBeGreaterThan(ticks * 50);
    expect(compileMs).toBeLessThan(1000);
    // 60Hz에서는 프레임당 1틱. 렌더링 몫을 남기려고 틱은 2ms 안쪽이어야 한다
    expect(perTick).toBeLessThan(2);
  });
});
