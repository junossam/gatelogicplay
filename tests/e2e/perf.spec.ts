import { expect, test, type Page } from '@playwright/test';
import { bigCircuit } from '../fixtures/circuits';
import { seed } from './helpers';

// 성능은 개발 모드가 아니라 배포 빌드(vite preview)로 잰다
test.use({ baseURL: 'http://localhost:5180' });

async function runBig(page: Page, fanout: 'local' | 'input') {
  const circuit = bigCircuit(5000, 50, fanout);
  // 입력 스위치를 클럭으로 바꿔 신호가 계속 흐르게 한다
  circuit.parts[0] = { ...circuit.parts[0]!, kind: { type: 'primitive', kind: 'CLOCK' }, props: { hz: 3 } };
  await seed(page, circuit);
  await expect(page.getByTestId('statusbar')).toContainText('게이트 5000', { timeout: 20_000 });
  await page.getByLabel('시뮬레이션 속도').fill('19');
  await page.waitForTimeout(1500);
}

function measure(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ fps: number; worst: number; ticks: number }>((resolve) => {
        const tickText = () => Number(document.querySelector('[data-testid="tick"]')!.textContent!.replace(/\D/g, ''));
        const startTick = tickText();
        const times: number[] = [];
        const start = performance.now();
        const frame = (now: number) => {
          times.push(now);
          if (now - start < 3000) requestAnimationFrame(frame);
          else {
            const gaps = times.slice(1).map((t, i) => t - times[i]!);
            resolve({ fps: (times.length - 1) / ((now - times[0]!) / 1000), worst: Math.max(...gaps), ticks: tickText() - startTick });
          }
        };
        requestAnimationFrame(frame);
      }),
  );
}

const report = (name: string, r: { fps: number; worst: number; ticks: number }) =>
  console.log(`${name}: ${r.fps.toFixed(1)} fps, worst frame ${r.worst.toFixed(1)}ms, ${r.ticks} ticks in 3s`);

test.describe.configure({ mode: 'serial' });

/** 5단계 완료 기준: 게이트 5천 개에서 60fps (SPEC 13장) */
test('5단계 완료 기준: 게이트 5천 개를 최고 속도(10Hz)로 돌려도 60fps', async ({ page }) => {
  test.setTimeout(60_000);
  await runBig(page, 'local');
  const r = await measure(page);
  report('5000 gates', r);
  // 실행 중이라 틱이 실제로 진행되어야 한다 (10Hz × 3초)
  expect(r.ticks).toBeGreaterThan(25);
  expect(r.fps).toBeGreaterThanOrEqual(55);
});

test('어려운 경우(회귀 감시): 25%로 축소해 전부 보기, 출력 하나가 2500개 입력을 구동', async ({ page }) => {
  test.setTimeout(90_000);
  await runBig(page, 'local');
  // 휠로 최소 배율(25%)까지 축소
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(canvas.x + 20, canvas.y + 20);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 400);
  await expect(page.getByTestId('statusbar')).toContainText('25%');
  await page.waitForTimeout(500);
  const zoomed = await measure(page);
  report('5000 gates at 25%', zoomed);
  expect(zoomed.fps).toBeGreaterThanOrEqual(20);

  await runBig(page, 'input');
  const fan = await measure(page);
  report('5000 gates, fanout 2500', fan);
  expect(fan.fps).toBeGreaterThanOrEqual(30);
});
