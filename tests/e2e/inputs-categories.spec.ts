import { expect, test, type Page } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { CircuitBuilder, nestedLibrary } from '../fixtures/circuits';
import { seed } from './helpers';

async function toggle(page: Page, id: string) {
  const box = (await page.getByTestId(`part-${id}`).locator('.part-hit').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
}

async function wire(page: Page, from: string, to: string) {
  const a = (await page.locator(`[data-pin="${from}"]`).boundingBox())!;
  const b = (await page.locator(`[data-pin="${to}"]`).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('게이트 입력 수: AND를 3입력으로 바꾸면 핀 c가 생기고 세 입력이 모두 1일 때만 1', async ({ page }) => {
  const c = new CircuitBuilder()
    .add('SWITCH', 'a', 0, 2, 'A')
    .add('SWITCH', 'b', 0, 6, 'B')
    .add('SWITCH', 'c', 0, 10, 'C')
    .add('AND', 'and1', 8, 3)
    .add('LED', 'y', 18, 5, 'Y')
    .build();
  await seed(page, c);
  await page.getByTestId('part-and1').locator('.part-hit').click({ position: { x: 40, y: 40 } });
  await expect(page.locator('[data-pin="and1:c"]')).toHaveCount(0);
  await page.getByLabel('입력 수').selectOption('3');
  await expect(page.locator('[data-pin="and1:c"]')).toHaveCount(1);

  await wire(page, 'a:y', 'and1:a');
  await wire(page, 'b:y', 'and1:b');
  await wire(page, 'c:y', 'and1:c');
  await wire(page, 'and1:y', 'y:a');
  const y = page.getByTestId('part-y');
  await toggle(page, 'a');
  await toggle(page, 'b');
  await page.waitForTimeout(400);
  await expect(y).toHaveAttribute('data-value', '0');
  await toggle(page, 'c');
  await expect(y).toHaveAttribute('data-value', '1');
  await page.screenshot({ path: test.info().outputPath('and3.png') });

  // 다시 2입력으로 줄이면 c에 꽂힌 전선은 지워진다
  await page.getByTestId('part-and1').locator('.part-hit').click({ position: { x: 40, y: 10 } });
  await page.getByLabel('입력 수').selectOption('2');
  await expect(page.locator('[data-pin="and1:c"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="wire-"]')).toHaveCount(3);
});

test('칩 분류: 저장할 때 분류를 넣으면 팔레트에서 분류별로 묶이고, 바꾸기·이름 바꾸기·접기가 된다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').add('NOT', 'n', 5, 0).add('LED', 'l', 11, 0, 'Y').wire('s.y', 'n.a').wire('n.y', 'l.a').build(), {
    'logiclab:v1:library': serializeLibrary(nestedLibrary()),
  });

  // 처음에는 분류가 없어 평평한 목록
  await expect(page.getByTestId('chip-group-분류 없음')).toHaveCount(0);

  await page.getByRole('button', { name: '칩으로 저장' }).click();
  const dialog = page.getByRole('dialog', { name: '칩으로 저장' });
  await dialog.getByLabel('칩 이름').fill('인버터');
  await dialog.getByLabel('칩 분류').fill('기본');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();

  const basic = page.getByTestId('chip-group-기본');
  await expect(basic).toContainText('인버터');
  await expect(page.getByTestId('chip-group-분류 없음')).toContainText('SR 래치');

  // 분류 바꾸기 대화상자
  await page.getByRole('button', { name: 'SR 래치 분류 바꾸기' }).click();
  await page.getByRole('dialog').getByLabel('분류').fill('래치');
  await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('chip-group-래치')).toContainText('SR 래치');

  // 칩을 분류 머리글로 끌어다 놓기
  await page.getByTestId('chip-item-D 래치').locator('.chip-button').dragTo(page.getByTestId('chip-group-래치').locator('.chip-group-head'));
  await expect(page.getByTestId('chip-group-래치')).toContainText('D 래치');

  // 분류 이름 바꾸기
  await page.getByRole('button', { name: '래치 분류 이름 바꾸기' }).click();
  await page.getByRole('dialog').getByLabel('분류').fill('기억 소자');
  await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
  const memory = page.getByTestId('chip-group-기억 소자');
  await expect(memory).toContainText('SR 래치');
  await expect(memory).toContainText('D 래치');
  await page.screenshot({ path: test.info().outputPath('categories.png') });

  // 접기는 새로고침 후에도 기억
  await memory.locator('.chip-group-toggle').click();
  await expect(memory.locator('.chip-list')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
  await page.reload();
  await expect(page.getByTestId('chip-group-기억 소자').locator('.chip-list')).toHaveCount(0);
  await expect(page.getByTestId('chip-group-기억 소자').locator('.chip-group-toggle')).toHaveAttribute('aria-expanded', 'false');
});
