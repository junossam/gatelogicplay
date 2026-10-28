# LogicLab

기본 게이트(AND/OR/XOR/NOT) + 스위치/푸시 버튼/LED로 회로를 조립하고, 만든 회로를 칩으로 저장해 중첩하는 웹 시뮬레이터.
**전체 명세는 `docs/SPEC.md`** — 기능을 구현하기 전에 해당 장을 먼저 읽을 것.

## 명령어
- `pnpm dev` — 개발 서버
- `pnpm test` — Vitest (엔진 단위 테스트)
- `pnpm test:e2e` — Playwright
- `pnpm typecheck` / `pnpm lint`
- 작업을 끝내기 전에 `pnpm typecheck && pnpm test`가 통과해야 함

## 스택
Vite + React 18 + TypeScript(strict) · Zustand + Immer · SVG 캔버스 · zod · Vitest · Playwright

## 구조
```
src/sim/     시뮬레이션 엔진 — 순수 TS, React/DOM import 금지
src/model/   저장 스키마, 칩 라이브러리, localStorage, 마이그레이션
src/store/   editorStore(문서·선택·undo), simStore(실행·속도·틱)
src/ui/      Header, Palette, Canvas, Inspector, Waveform, dialogs
src/theme/   tokens.css
```

## 꼭 지킬 규칙
1. **엔진은 UI와 분리.** `src/sim`은 `compile → setInput → tick → read` API만 노출하고, 테스트는 UI 없이 이 API로 작성.
2. **모든 게이트는 1틱 지연, 이벤트 기반.** 위상 정렬로 한 번에 계산하지 말 것 — 피드백 루프(래치)가 깨짐.
3. 초기 Net 값은 전부 0. 연결 안 된 입력도 0.
4. 진동은 멈추지 말고 표시만 (NOT 루프는 클럭으로 쓸 수 있음). 기준: 최근 32틱 중 16회 초과 변화.
5. 칩은 컴파일 시 재귀 평탄화, 노드 id는 경로(`dff1/latch/or2`). 칩 순환 참조는 컴파일 전에 차단.
6. 범위 선택 경계 계산(`sim/boundary.ts`)은 파형 패널과 "범위를 칩으로 만들기"가 **같은 함수**를 사용.
7. 저장 JSON은 `format: "logiclab"`, `version` 필드 필수. 스키마를 바꾸면 `model/migrate.ts`에 변환 단계 추가.
8. 색은 `tokens.css` 변수만 사용, 하드코딩 금지. 0/1은 색과 밝기 둘 다로 구분.
9. 클릭 영역 최소 44px, 버튼은 `<button>`, 아이콘 버튼엔 `aria-label`.
10. UI 문구는 한국어.

## 구현 순서 (각 단계 완료 기준은 SPEC 13장)
1. 편집기 뼈대 → 2. 엔진 + SR 래치 동작 → 3. 파형·인스펙터·진리표 → 4. 칩 저장/중첩 → 5. 클럭·단축키·성능

한 번에 한 단계씩 진행하고, 단계가 끝나면 완료 기준을 테스트로 확인한 뒤 커밋.

## 자주 틀리는 것
- 푸시 버튼은 `pointerup`뿐 아니라 `pointerleave`/`pointercancel`에서도 0으로.
- 입력 핀에는 전선 하나만. 출력 핀은 여러 개 가능.
- 칩 내부 Net은 그 칩을 열었을 때만 기록 (Recorder 메모리).
- 단축키는 캔버스 포커스일 때만, input 안에서는 무시.
