import { expect, test, type Page } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { harness, srLatchChip } from '../fixtures/circuits';
import { seed } from './helpers';

async function setSwitch(page: Page, id: string, v: 0 | 1) {
  const part = page.getByTestId(`part-${id}`);
  if ((await part.getAttribute('data-value')) !== String(v)) {
    const box = (await part.locator('.part-hit').boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + box.height / 2);
  }
  await expect(part).toHaveAttribute('data-value', String(v));
}

test('7단계 완료 기준: SR 래치 칩 회로의 공유 링크를 새 창에서 열면 가져와서 그대로 동작', async ({ page, browser }) => {
  const sr = srLatchChip();
  await seed(page, harness(sr, 'latch'), { 'logiclab:v1:library': serializeLibrary({ [sr.id]: sr }) });
  await page.getByRole('button', { name: '공유' }).click();
  const input = page.getByRole('textbox', { name: '공유 링크' });
  await expect(input).toHaveValue(/#share=[A-Za-z0-9_-]+$/);
  const url = await input.inputValue();
  await expect(page.getByTestId('share-length')).toContainText('자');

  // 저장소가 빈 새 창(다른 브라우저 컨텍스트)에서 연다
  const other = await (await browser.newContext()).newPage();
  await other.goto(url);
  const dialog = other.getByRole('dialog', { name: '가져오기' });
  await expect(dialog).toContainText('칩 1개');
  await dialog.getByRole('button', { name: '가져오기' }).click();
  await expect(other).toHaveURL(/^[^#]*$/); // 해시는 지운다
  await expect(other.getByTestId('chip-item-SR 래치')).toHaveCount(1);
  await expect(other.getByTestId('part-latch')).toBeVisible();

  // 래치가 잡을 만큼(몇 틱) 누르고 있다가 뗀다
  await setSwitch(other, 'in_S', 1);
  await other.waitForTimeout(600);
  await setSwitch(other, 'in_S', 0);
  await expect(other.getByTestId('part-out_Q')).toHaveAttribute('data-value', '1');
  await setSwitch(other, 'in_R', 1);
  await other.waitForTimeout(600);
  await setSwitch(other, 'in_R', 0);
  await expect(other.getByTestId('part-out_Q')).toHaveAttribute('data-value', '0');
  await expect(other.getByTestId('part-out_Q̄')).toHaveAttribute('data-value', '1');
});

test('망가진 공유 링크는 거부한다', async ({ page }) => {
  await page.goto('/#share=AAAAbroken___');
  const dialog = page.getByRole('dialog', { name: '공유 링크를 열 수 없습니다' });
  await expect(dialog).toContainText('공유 링크를 읽을 수 없습니다');
  await expect(page).toHaveURL(/^[^#]*$/);
});
