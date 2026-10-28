import type { Circuit, Library, Part, PinRef, Wire } from './types';

/** 범위 경계를 넘는 신호 하나. 같은 출처에서 갈라진 전선은 하나로 합친다. */
export interface BoundaryPin {
  /** 신호를 내보내는 출력 핀 */
  source: PinRef;
  /** 경계를 넘는 전선들 (입력이면 범위 안 도착점들, 출력이면 범위 밖 도착점들) */
  wires: Wire[];
  /** 채널/핀 이름: 바깥쪽 부품의 라벨, 없으면 `종류#번호.핀` */
  name: string;
}

export interface Boundary {
  inputs: BoundaryPin[];
  outputs: BoundaryPin[];
}

function kindName(part: Part, library: Library): string {
  return part.kind.type === 'primitive' ? part.kind.kind : (library[part.kind.chipId]?.name ?? 'CHIP');
}

/** 라벨이 없을 때의 이름: `AND#1.y` (번호는 id 끝 숫자) */
export function pinDisplayName(part: Part | undefined, pin: string, library: Library = {}): string {
  if (!part) return pin;
  if (part.label) return part.label;
  const num = /(\d+)$/.exec(part.id)?.[1] ?? part.id;
  return `${kindName(part, library)}#${num}.${pin}`;
}

function dedupeBySource(wires: Wire[], nameOf: (group: Wire[]) => string): BoundaryPin[] {
  const groups = new Map<string, Wire[]>();
  for (const w of wires) {
    const key = `${w.from.partId}.${w.from.pin}`;
    const g = groups.get(key);
    if (g) g.push(w);
    else groups.set(key, [w]);
  }
  return [...groups.values()].map((g) => ({ source: { ...g[0]!.from }, wires: g, name: nameOf(g) }));
}

/**
 * 선택된 부품 집합 S의 경계 신호 (SPEC 8장).
 * 파형 패널의 "선택 범위" 모드와 "선택 범위를 칩으로 만들기"가 반드시 이 함수를 함께 쓴다.
 */
export function boundary(circuit: Circuit, S: ReadonlySet<string>, library: Library = {}): Boundary {
  const parts = new Map(circuit.parts.map((p) => [p.id, p]));
  const inputs: Wire[] = [];
  const outputs: Wire[] = [];
  for (const w of circuit.wires) {
    const fromIn = S.has(w.from.partId);
    const toIn = S.has(w.to.partId);
    if (!fromIn && toIn) inputs.push(w); // 밖 → 안 : 입력
    if (fromIn && !toIn) outputs.push(w); // 안 → 밖 : 출력
  }
  const byPosition = (a: Wire, b: Wire, side: 'from' | 'to') => {
    const pa = parts.get(a[side].partId)!;
    const pb = parts.get(b[side].partId)!;
    return pa.y - pb.y || pa.x - pb.x;
  };
  inputs.sort((a, b) => byPosition(a, b, 'from'));
  outputs.sort((a, b) => byPosition(a, b, 'to'));
  return {
    inputs: dedupeBySource(inputs, (g) => pinDisplayName(parts.get(g[0]!.from.partId), g[0]!.from.pin, library)),
    outputs: dedupeBySource(outputs, (g) => {
      // 출력은 바깥쪽(도착) 부품의 라벨을 쓰고, 라벨 있는 도착점을 우선한다
      const labelled = g.find((w) => parts.get(w.to.partId)?.label);
      const w = labelled ?? g[0]!;
      return labelled ? parts.get(w.to.partId)!.label! : pinDisplayName(parts.get(w.from.partId), w.from.pin, library);
    }),
  };
}
