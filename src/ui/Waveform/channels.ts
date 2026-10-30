import { boundary, pinDisplayName } from '../../sim/boundary';
import { partBits, partPinSpecs, pinSpec, pinLabel } from '../../sim/pins';
import { orderedIO } from '../../sim/truthTable';
import type { Circuit, Library } from '../../sim/types';

export type ChannelKind = 'in' | 'out' | 'fb';
export type WaveMode = 'part' | 'range';

export interface Channel {
  key: string;
  kind: ChannelKind;
  name: string;
  /** 비트별 Net id (0번 비트부터). 연결이 없으면 null(항상 0). 2개 이상이면 버스 채널 */
  netIds: (string | null)[];
}

export interface NetLookup {
  /** `${부품 id}.${핀}`의 k번 비트 → Net id */
  pinNetId(partId: string, pin: string, bit?: number): string | null;
  /** Net이 속한 피드백 루프 번호 (-1 = 루프 아님) */
  loopOf(netId: string): number;
}

const bitsOfPin = (nets: NetLookup, partId: string, pin: string, width: number) =>
  Array.from({ length: width }, (_, k) => nets.pinNetId(partId, pin, k));

/** 아무것도 선택하지 않으면 모든 SWITCH, PUSH, LED */
function ioChannels(circuit: Circuit, nets: NetLookup, order?: { inputs: string[]; outputs: string[] }): Channel[] {
  const io = orderedIO(circuit, order);
  return [
    ...io.inputs.map((p) => ({ key: `in:${p.id}`, kind: 'in' as const, name: p.label ?? p.id, netIds: bitsOfPin(nets, p.id, 'y', partBits(p)) })),
    ...io.outputs.map((p) => ({ key: `out:${p.id}`, kind: 'out' as const, name: p.label ?? p.id, netIds: bitsOfPin(nets, p.id, 'a', partBits(p)) })),
  ];
}

/** 선택한 부품: 입력 핀마다 하나, 출력 핀마다 하나. 피드백으로 돌아오는 입력은 'fb'. */
function partChannels(circuit: Circuit, partId: string, nets: NetLookup, library: Library): Channel[] {
  const part = circuit.parts.find((p) => p.id === partId);
  if (!part) return [];
  const parts = new Map(circuit.parts.map((p) => [p.id, p]));
  const pins = partPinSpecs(part, library);
  const outLoops = new Set(
    pins
      .filter((p) => p.dir === 'out')
      .flatMap((p) => bitsOfPin(nets, part.id, p.name, p.width))
      .filter((id): id is string => id !== null)
      .map((id) => nets.loopOf(id))
      .filter((l) => l >= 0),
  );
  return pins.map((pin) => {
    const netIds = bitsOfPin(nets, part.id, pin.name, pin.width);
    if (pin.dir === 'out') return { key: `out:${pin.name}`, kind: 'out', name: pinLabel(part, pin.name), netIds };
    const wire = circuit.wires.find((w) => w.to.partId === part.id && w.to.pin === pin.name);
    const source = wire ? pinDisplayName(parts.get(wire.from.partId), wire.from.pin, library) : '연결 없음';
    const fb = netIds.some((id) => id !== null && outLoops.has(nets.loopOf(id)));
    return { key: `in:${pin.name}`, kind: fb ? 'fb' : 'in', name: `${pinLabel(part, pin.name)} · ${source}`, netIds };
  });
}

/** 선택 범위: 경계를 넘는 전선만 (boundary와 같은 함수 — 규칙 6) */
function rangeChannels(circuit: Circuit, ids: string[], nets: NetLookup, library: Library): Channel[] {
  const b = boundary(circuit, new Set(ids), library);
  const parts = new Map(circuit.parts.map((p) => [p.id, p]));
  const width = (partId: string, pin: string) => {
    const part = parts.get(partId);
    return (part && pinSpec(part, pin, library)?.width) ?? 1;
  };
  const toChannel = (kind: 'in' | 'out') => (p: (typeof b.inputs)[number]) => ({
    key: `${kind}:${p.source.partId}.${p.source.pin}`,
    kind,
    name: p.name,
    netIds: bitsOfPin(nets, p.source.partId, p.source.pin, width(p.source.partId, p.source.pin)),
  });
  return [...b.inputs.map(toChannel('in')), ...b.outputs.map(toChannel('out'))];
}

export function effectiveMode(selected: number, override: WaveMode | null): WaveMode | null {
  if (selected === 0) return null;
  return override ?? (selected === 1 ? 'part' : 'range');
}

export function channelsFor(
  circuit: Circuit,
  selectedParts: string[],
  mode: WaveMode | null,
  nets: NetLookup,
  library: Library = {},
  order?: { inputs: string[]; outputs: string[] },
): Channel[] {
  if (mode === null) return ioChannels(circuit, nets, order);
  if (mode === 'part') return partChannels(circuit, selectedParts[0]!, nets, library);
  return rangeChannels(circuit, selectedParts, nets, library);
}
