import { expect, test } from '@playwright/test';
import { CircuitBuilder } from '../fixtures/circuits';
import { seed } from './helpers';

async function wire(page: import('@playwright/test').Page, from: string, to: string) {
  const a = (await page.locator(`[data-pin="${from}"]`).boundingBox())!;
  const b = (await page.locator(`[data-pin="${to}"]`).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('진리표 부품: 팔레트에서 놓고, 편집 창에서 입력 3·출력 2와 표를 정하면 그대로 동작', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 'a', 0, 2, 'A').add('SWITCH', 'b', 0, 6, 'B').add('SWITCH', 'c', 0, 10, 'C').build());
  // 기본 게이트 칸에 있다
  const btn = page.getByTestId('palette-LUT');
  await expect(btn).toHaveAttribute('title', /진리표대로 출력/);
  await btn.click();
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 300, canvas.y + 200);
  await expect(page.getByTestId('part-lut1')).toHaveCount(1);
  await expect(page.locator('[data-pin="lut1:a"]')).toHaveCount(1);
  await expect(page.locator('[data-pin="lut1:c"]')).toHaveCount(0);

  // 편집: 입력 3, 출력 2 → 다수결(Y0)과 패리티(Y1)
  await page.getByRole('button', { name: '진리표 편집' }).click();
  const dialog = page.getByRole('dialog', { name: '진리표 편집' });
  await dialog.getByLabel('진리표 입력 수').selectOption('3');
  await dialog.getByLabel('진리표 출력 수').selectOption('2');
  await dialog.getByRole('button', { name: '모두 0' }).click();
  await expect(dialog.locator('tbody tr')).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    const ones = [0, 1, 2].reduce((s, k) => s + ((i >> k) & 1), 0);
    if (ones >= 2) await dialog.getByRole('button', { name: `${i}행 Y0` }).click();
    if (ones % 2) await dialog.getByRole('button', { name: `${i}행 Y1` }).click();
  }
  await page.screenshot({ path: test.info().outputPath('lut-dialog.png') });
  await dialog.getByRole('button', { name: '적용' }).click();
  await expect(page.locator('[data-pin="lut1:c"]')).toHaveCount(1);
  await expect(page.locator('[data-pin="lut1:y1"]')).toHaveCount(1);

  // 연결하고 LED 둘
  await page.getByTestId('palette-LED').click();
  await page.mouse.click(canvas.x + 500, canvas.y + 160);
  await page.getByTestId('palette-LED').click();
  await page.mouse.click(canvas.x + 500, canvas.y + 260);
  await wire(page, 'a:y', 'lut1:a');
  await wire(page, 'b:y', 'lut1:b');
  await wire(page, 'c:y', 'lut1:c');
  await wire(page, 'lut1:y0', 'led1:a');
  await wire(page, 'lut1:y1', 'led2:a');
  const click = async (id: string) => {
    const box = (await page.getByTestId(`part-${id}`).locator('.part-hit').boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + box.height / 2);
  };
  // A=1 → 다수결 0, 패리티 1
  await click('a');
  await expect(page.getByTestId('part-led1')).toHaveAttribute('data-value', '0');
  await expect(page.getByTestId('part-led2')).toHaveAttribute('data-value', '1');
  // A=1, B=1 → 다수결 1, 패리티 0
  await click('b');
  await expect(page.getByTestId('part-led1')).toHaveAttribute('data-value', '1');
  await expect(page.getByTestId('part-led2')).toHaveAttribute('data-value', '0');
  await page.screenshot({ path: test.info().outputPath('lut.png') });

  // 실행 취소 한 번이면 편집 전으로 (입력 2개)
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
});

test('진리표 부품 최대 크기: 입력 8개(256행) · 출력 16개', async ({ page }) => {
  const b = new CircuitBuilder().add('LUT', 'lut', 4, 2);
  await seed(page, b.build());
  await page.getByTestId('part-lut').locator('.part-hit').click({ position: { x: 30, y: 10 } });
  await page.getByRole('button', { name: '진리표 편집' }).click();
  const dialog = page.getByRole('dialog', { name: '진리표 편집' });
  await dialog.getByLabel('진리표 입력 수').selectOption('8');
  await dialog.getByLabel('진리표 출력 수').selectOption('16');
  await expect(dialog.locator('tbody tr')).toHaveCount(256);
  await expect(dialog.locator('thead th')).toHaveCount(24);
  await dialog.getByRole('button', { name: '255행 Y15' }).click();
  await expect(dialog.getByRole('button', { name: '255행 Y15' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('lut-max.png') });
  await dialog.getByRole('button', { name: '적용' }).click();
  await expect(page.locator('[data-pin="lut:h"]')).toHaveCount(1);
  await expect(page.locator('[data-pin="lut:y15"]')).toHaveCount(1);
});
