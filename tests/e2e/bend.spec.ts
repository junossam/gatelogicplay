import { expect, test } from '@playwright/test';
import { CircuitBuilder } from '../fixtures/circuits';
import { seed } from './helpers';

test('전선을 선택해 구간 손잡이를 끌면 꺾이고, 새로고침 후에도 남고, 되돌릴 수 있다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 'a', 2, 4, 'A').add('LED', 'y', 20, 4, 'Y').wire('a.y', 'y.a').build());
  const line = page.locator('[data-testid="wire-w1"] .wire-line');
  const straight = await line.getAttribute('d');

  // 수평 전선은 bbox 높이가 0이라 가운데를 좌표로 클릭
  const a = (await page.locator('[data-pin="a:y"]').boundingBox())!;
  const b = (await page.locator('[data-pin="y:a"]').boundingBox())!;
  await page.mouse.click((a.x + b.x) / 2 + a.width / 2, a.y + a.height / 2);
  await expect(page.getByTestId('segment-handles')).toBeVisible();

  // 유일한 구간을 아래로 3칸(60px) 끌기
  const h = (await page.getByTestId('segment-0').locator('.segment-hit').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  const bent = await line.getAttribute('d');
  expect(bent).not.toBe(straight);
  expect(bent!.split('L').length).toBe(4); // 꺾은 점 2개 → 구간 3개
  await expect(page.locator('.inspector')).toContainText('직접 꺾음');

  // 부품을 옮겨도 꺾은 모양을 유지 (가운데 수평 구간의 y가 그대로)
  const midY = (d: string) => Number(d.split('L')[1]!.trim().split(' ')[1]);
  const ledBox = (await page.getByTestId('part-y').locator('.part-hit').boundingBox())!;
  await page.mouse.move(ledBox.x + ledBox.width - 6, ledBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(ledBox.x + ledBox.width - 6 + 40, ledBox.y + 6, { steps: 4 });
  await page.mouse.up();
  expect(midY((await line.getAttribute('d'))!)).toBe(midY(bent!));

  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
  await page.reload();
  expect(midY((await line.getAttribute('d'))!)).toBe(midY(bent!));

  // 자동 경로로 되돌리기
  await page.mouse.click((a.x + b.x) / 2 + a.width / 2, a.y + a.height / 2 + 60);
  await page.getByRole('button', { name: '자동 경로로 되돌리기' }).click();
  await expect(page.locator('.inspector')).toContainText('자동');
  expect((await line.getAttribute('d'))!.split('L').length).toBeLessThan(4);
  // 실행 취소하면 다시 꺾인 모양
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+z');
  expect(midY((await line.getAttribute('d'))!)).toBe(midY(bent!));
});
