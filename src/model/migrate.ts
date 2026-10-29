import { VERSION } from './schema';

/**
 * 저장 JSON을 현재 VERSION으로 단계별 변환한다.
 * 스키마를 바꾸면 `steps[이전버전]`에 변환 함수를 추가할 것.
 */
const steps: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: 다중 비트 버스 추가. 기존 문서는 모두 1비트라 구조는 그대로 두고 버전만 올린다.
  1: (doc) => ({ ...doc, version: 2 }),
  // 2 → 3: 게이트 입력 수와 칩 분류 추가. 둘 다 없으면 기존과 같으므로 버전만 올린다.
  2: (doc) => ({ ...doc, version: 3 }),
  // 3 → 4: 8세그먼트 표시기(SEG8) 부품 추가. 기존 문서에는 없으므로 버전만 올린다.
  3: (doc) => ({ ...doc, version: 4 }),
};

export class MigrationError extends Error {}

export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) throw new MigrationError('JSON 객체가 아닙니다');
  let doc = raw as Record<string, unknown>;
  if (doc.format !== 'logiclab') throw new MigrationError('format 필드가 "logiclab"이 아닙니다');
  if (typeof doc.version !== 'number') throw new MigrationError('version 필드가 없습니다');
  if (doc.version > VERSION) throw new MigrationError(`지원하지 않는 최신 버전입니다 (v${doc.version})`);
  while ((doc.version as number) < VERSION) {
    const step = steps[doc.version as number];
    if (!step) throw new MigrationError(`v${doc.version}에서 변환하는 단계가 없습니다`);
    doc = step(doc);
  }
  return doc;
}
