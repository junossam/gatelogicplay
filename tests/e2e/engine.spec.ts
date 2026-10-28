import { expect, test } from '@playwright/test';
import { halfAdder, notRing, srLatch } from '../fixtures/circuits';
import { pressPush, seed } from './helpers';

test('2단계 완료 기준: SR 래치가 S/R로 셋·리셋되고 버튼을 놓아도 유지됨', async ({ page }) => {
  await seed(page, srLatch());
  const q = page.getByTestId('part-q');
  const qn = page.getByTestId('part-qn');

  await pressPush(page, 's');
  await expect(q).toHaveAttribute('data-value', '1');
  await expect(qn).toHaveAttribute('data-value', '0');
  // 놓은 뒤에도 유지
  await expect(page.getByTestId('part-s')).toHaveAttribute('data-value', '0');
  await page.waitForTimeout(1000);
  await expect(q).toHaveAttribute('data-value', '1');
  await expect(page.getByTestId('sim-badge')).toHaveText('피드백 루프 감지됨 · 안정');

  await pressPush(page, 'r');
  await expect(q).toHaveAttribute('data-value', '0');
  await expect(qn).toHaveAttribute('data-value', '1');
  await page.waitForTimeout(1000);
  await expect(q).toHaveAttribute('data-value', '0');

  // 값이 1인 전선은 강조색으로 표시
  await expect(page.locator('[data-testid="wire-w8"]')).toHaveAttribute('data-value', '1');
  await expect(page.locator('[data-testid="wire-w8"]')).toHaveClass(/\bon\b/);
});

test('2단계 완료 기준: NOT 3개 루프는 "진동 중"으로 표시됨', async ({ page }) => {
  await seed(page, notRing(3));
  await expect(page.getByTestId('sim-badge')).toHaveText('진동 중');
  await expect(page.locator('.wire.osc')).not.toHaveCount(0);
});

test('스위치를 클릭하면 토글되고, 일시정지 중에는 한 틱씩 진행한다', async ({ page }) => {
  await seed(page, halfAdder());
  await page.getByRole('button', { name: '일시정지' }).click();
  const tick = page.getByTestId('tick');
  const t0 = await tick.textContent();

  await page.getByTestId('part-a').locator('.part-hit').click();
  await expect(page.getByTestId('part-a')).toHaveAttribute('data-value', '1');
  await expect(page.getByTestId('part-s')).toHaveAttribute('data-value', '0');
  await expect(tick).toHaveText(t0!);

  await page.getByRole('button', { name: '한 틱 진행' }).click(); // 입력 반영 + XOR 평가
  await page.getByRole('button', { name: '한 틱 진행' }).click();
  await expect(page.getByTestId('part-s')).toHaveAttribute('data-value', '1');
  await expect(page.getByTestId('part-c')).toHaveAttribute('data-value', '0');

  await page.getByTestId('part-b').locator('.part-hit').click();
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(page.getByTestId('part-s')).toHaveAttribute('data-value', '0');
  await expect(page.getByTestId('part-c')).toHaveAttribute('data-value', '1');
});

test('속도 슬라이더는 1~60Hz', async ({ page }) => {
  await seed(page, halfAdder());
  const slider = page.getByLabel('시뮬레이션 속도');
  await slider.fill('60');
  await expect(page.getByText('60Hz')).toBeVisible();
  await slider.fill('1');
  await expect(page.getByText('1Hz')).toBeVisible();
});
