import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pressPush } from './helpers';

async function setSwitch(page: Page, id: string, v: 0 | 1) {
  const part = page.getByTestId(`part-${id}`);
  if ((await part.getAttribute('data-value')) !== String(v)) {
    const box = (await part.locator('.part-hit').boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + box.height / 2);
  }
  await expect(part).toHaveAttribute('data-value', String(v));
}

test('플립플롭 예제 파일을 가져오면 T 플립플롭이 CLR 후 클럭마다 반전한다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('import-file').setInputFiles(resolve('samples/기억 소자/플립플롭 모음.json'));
  const dialog = page.getByRole('dialog', { name: '가져오기' });
  await expect(dialog).toContainText('칩 6개');
  await dialog.getByRole('button', { name: '가져오기' }).click();
  await page.getByLabel('시뮬레이션 속도').fill('60');

  // T 구역이 보이도록 아래로 이동 (Space + 드래그)
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.getByTestId('canvas').focus();
  await page.keyboard.down(' ');
  await page.mouse.move(canvas.x + 600, canvas.y + 500);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 600, canvas.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up(' ');

  const q = page.getByTestId('part-t_q');
  await setSwitch(page, 't_clr', 1);
  await pressPush(page, 't_clk', 500);
  await setSwitch(page, 't_clr', 0);
  await expect(q).toHaveAttribute('data-value', '0');

  await setSwitch(page, 't_t', 1);
  for (const expected of ['1', '0', '1']) {
    await pressPush(page, 't_clk', 500);
    await expect(q).toHaveAttribute('data-value', expected);
  }
  await expect(page.getByTestId('part-t_qn')).toHaveAttribute('data-value', '0');
  await page.screenshot({ path: test.info().outputPath('flipflops.png') });
});
