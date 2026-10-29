import { expect, test, type Page } from '@playwright/test';
import { halfAdder, srLatch } from '../fixtures/circuits';
import { menuAction, pressPush, seed } from './helpers';

const channels = (page: Page) => page.getByTestId('wave-channel');

async function clickPart(page: Page, id: string, modifiers: ('Shift')[] = []) {
  // 부품 몸체(핀이 아닌 곳) 클릭
  const box = (await page.getByTestId(`part-${id}`).locator('.part-hit').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.down();
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

test('3단계 완료 기준: SR 래치의 OR 하나를 선택하면 입력 2개와 출력 1개 파형', async ({ page }) => {
  await seed(page, srLatch());
  await clickPart(page, 'or1');
  await expect(page.getByRole('button', { name: '선택한 부품', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(channels(page)).toHaveCount(3);
  // 입력 a는 R에서, b는 NOT#2에서 되돌아오는 피드백
  await expect(channels(page).nth(0)).toHaveAttribute('data-kind', 'in');
  await expect(channels(page).nth(0)).toContainText('a · R');
  await expect(channels(page).nth(1)).toHaveAttribute('data-kind', 'fb');
  await expect(channels(page).nth(1)).toContainText('피드백');
  await expect(channels(page).nth(2)).toHaveAttribute('data-kind', 'out');
});

test('3단계 완료 기준: 래치 전체를 범위로 선택하면 R, S, Q, Q̄ 네 채널만', async ({ page }) => {
  await seed(page, srLatch());
  // 빈 곳에서 Shift+드래그해 OR/NOT 네 개만 감싸는 범위 선택 (핀 히트 영역 바깥에서 시작)
  const boxes = await Promise.all(['or1', 'or2', 'not1', 'not2'].map(async (id) => (await page.getByTestId(`part-${id}`).locator('.part-hit').boundingBox())!));
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  await page.mouse.move(left - 2, top - 30);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(right + 30, bottom + 10, { steps: 6 });
  await expect(page.getByText('범위 선택 · 부품 4개')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect(page.getByRole('button', { name: '선택 범위', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(channels(page)).toHaveCount(4);
  await expect(page.locator('.wave-name')).toHaveText(['R', 'S', 'Q', 'Q̄']);
  for (const [i, kind] of ['in', 'in', 'out', 'out'].entries()) await expect(channels(page).nth(i)).toHaveAttribute('data-kind', kind);
});

test('아무것도 선택하지 않으면 모든 스위치·푸시 버튼·LED, 누른 기록이 파형에 남는다', async ({ page }) => {
  await seed(page, srLatch());
  await expect(page.locator('.wave-name')).toHaveText(['R', 'S', 'Q', 'Q̄']);
  await pressPush(page, 's', 400);
  await page.waitForTimeout(300);
  // S 채널 파형에 변화(H/V 명령)가 있다
  const d = await channels(page).nth(1).locator('path').getAttribute('d');
  expect(d).toMatch(/V3/);
  await page.getByRole('button', { name: '기록 지우기' }).click();
  await page.getByRole('button', { name: '일시정지' }).click();
  const cleared = await channels(page).nth(1).locator('path').getAttribute('d');
  expect(cleared).not.toMatch(/V3/);
});

test('진리표: 반가산기 4행, 현재 입력 행 강조, 헤더 버튼으로 크게 보기', async ({ page }) => {
  await seed(page, halfAdder());
  const table = page.locator('.inspector').getByTestId('truth-table');
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(table.locator('tr.current td')).toHaveText(['0', '0', '0', '0']);
  await page.getByTestId('part-a').locator('.part-hit').click();
  await expect(table.locator('tr.current td')).toHaveText(['1', '0', '1', '0']);

  await menuAction(page, '도구', '진리표');
  const dialog = page.getByRole('dialog', { name: '진리표' });
  await expect(dialog.getByTestId('truth-table').locator('tbody tr')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('진리표: SR 래치는 이전 유지와 금지 상태를 보여준다', async ({ page }) => {
  await seed(page, srLatch());
  const table = page.locator('.inspector').getByTestId('truth-table');
  await expect(table).toContainText('이전 유지');
  await expect(table).toContainText('금지 상태');
});

test('인스펙터에서 라벨을 바꾸면 채널 이름과 진리표에 반영된다', async ({ page }) => {
  await seed(page, halfAdder());
  await page.getByTestId('part-a').locator('.part-hit').click({ position: { x: 4, y: 4 } });
  const label = page.getByLabel('라벨');
  await label.fill('X');
  await label.press('Enter');
  await page.getByTestId('canvas').click({ position: { x: 700, y: 500 } });
  await expect(page.locator('.wave-name').first()).toHaveText('X');
  await expect(page.locator('.inspector').getByTestId('truth-table').locator('th').first()).toHaveText('X');
});
