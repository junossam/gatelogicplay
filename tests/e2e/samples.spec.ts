import { expect, test } from '@playwright/test';
import { CircuitBuilder } from '../fixtures/circuits';
import { seed } from './helpers';

test('예제: 헤더의 예제 창에서 분류별 목록을 보고, 열면 가져오기 창을 거쳐 작업 공간에 들어온다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').build());
  await page.getByRole('button', { name: '예제', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '예제' });
  await expect(dialog.getByTestId('sample-group-기억 소자')).toContainText('플립플롭 모음');
  await expect(dialog.getByTestId('sample-group-연산')).toContainText('4비트 가산기 (버스)');
  await expect(dialog.getByTestId('sample-연산/4비트 가산기.json')).toContainText('칩 3개 · 부품 5개');
  await page.screenshot({ path: test.info().outputPath('samples.png') });

  await dialog.getByTestId('sample-연산/4비트 가산기.json').getByRole('button', { name: '열기' }).click();
  const imp = page.getByRole('dialog', { name: '가져오기' });
  await expect(imp).toContainText('칩 3개');
  await imp.getByRole('button', { name: '가져오기' }).click();
  await expect(page.getByTestId('chip-item-4비트 가산기(버스)')).toHaveCount(1);
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(5);
  // 스위치 A를 1 올리면 합 S가 1
  const box = (await page.getByTestId('part-ina').locator('.part-hit').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
  await expect(page.getByTestId('part-sum')).toHaveAttribute('data-value', '1');
});

test('예제 링크(#sample=)로 열면 바로 가져오기 창이 뜨고, 잘못된 경로는 안내한다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/#sample=${encodeURIComponent('기억 소자/플립플롭 모음.json')}`);
  await page.reload();
  const imp = page.getByRole('dialog', { name: '가져오기' });
  await expect(imp).toContainText('칩 6개');
  await expect(page).toHaveURL(/\/$/);
  await imp.getByRole('button', { name: '취소' }).click();

  await page.goto('/#sample=..%2Fpackage.json');
  await page.reload();
  await expect(page.getByRole('dialog', { name: '예제를 열 수 없습니다' })).toBeVisible();
});
