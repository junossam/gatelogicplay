import { expect, test, type Page } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { busAdderWorkspace, busLibrary } from '../fixtures/circuits';
import { seed } from './helpers';

async function setValue(page: Page, id: string, value: number) {
  await page.getByTestId(`part-${id}`).locator('.part-hit').click({ position: { x: 4, y: 4 } });
  const field = page.getByLabel('스위치 값');
  await field.fill(String(value));
  await field.press('Enter');
}

test('8단계 완료 기준: 4비트 스위치 두 개를 버스로 가산기 칩에 연결하면 합이 숫자 LED에 표시', async ({ page }) => {
  await seed(page, busAdderWorkspace(), { 'logiclab:v1:library': serializeLibrary(busLibrary()) });
  await page.getByLabel('시뮬레이션 속도').fill('19');

  // 버스 전선은 굵게, 칩 핀에는 비트 수 표시
  await expect(page.locator('[data-testid="wire-w1"]')).toHaveClass(/\bbus\b/);
  await expect(page.getByTestId('part-add')).toContainText('[4]');

  await setValue(page, 'ina', 5);
  await setValue(page, 'inb', 6);
  await expect(page.getByTestId('part-sum')).toHaveAttribute('data-value', '11');
  await expect(page.getByTestId('part-sum')).toContainText('11');
  await expect(page.getByTestId('part-carry')).toHaveAttribute('data-value', '0');

  // 클릭하면 1씩 증가: 6 → 7, 합 12
  const b = (await page.getByTestId('part-inb').locator('.part-hit').boundingBox())!;
  await page.mouse.click(b.x + 10, b.y + b.height / 2);
  await expect(page.getByTestId('part-inb')).toHaveAttribute('data-value', '7');
  await expect(page.getByTestId('part-sum')).toHaveAttribute('data-value', '12');

  await setValue(page, 'ina', 15);
  await setValue(page, 'inb', 3);
  await expect(page.getByTestId('part-sum')).toHaveAttribute('data-value', '2');
  await expect(page.getByTestId('part-carry')).toHaveAttribute('data-value', '1');

  // 파형: 버스 채널은 값이 적힌 버스 모양
  await page.getByTestId('canvas').click({ position: { x: 700, y: 500 } });
  await expect(page.getByTestId('bus-wave').first()).toBeVisible();
  await expect(page.locator('.bus-seg').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('bus.png') });
});

test('비트 수가 다른 핀은 끌어도 연결되지 않는다, 나누기를 팔레트에서 놓을 수 있다', async ({ page }) => {
  await seed(page, busAdderWorkspace(), { 'logiclab:v1:library': serializeLibrary(busLibrary()) });
  await page.getByTestId('palette-LED').click();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(c.x + 600, c.y + 400);
  const wires = await page.locator('[data-testid^="wire-"]').count();
  const a = (await page.locator('[data-pin="ina:y"]').boundingBox())!;
  const l = (await page.locator('[data-pin="led1:a"]').boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid^="wire-"]')).toHaveCount(wires);

  await page.getByTestId('palette-SPLIT').click();
  await page.mouse.click(c.x + 500, c.y + 300);
  await expect(page.getByTestId('part-split1')).toHaveAttribute('data-bits', '4');
  await expect(page.locator('[data-pin="split1:y3"]')).toHaveCount(1);
  // 비트 수를 8로 바꾸면 출력 핀도 8개
  const field = page.getByLabel('비트 수');
  await field.fill('8');
  await field.press('Enter');
  await expect(page.locator('[data-pin="split1:y7"]')).toHaveCount(1);
});
