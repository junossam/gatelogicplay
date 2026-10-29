import { expect, test } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { CircuitBuilder, halfAdder, nestedLibrary } from '../fixtures/circuits';
import { menuAction, seed } from './helpers';

test('그룹: 범위 선택한 부품을 이름 붙여 묶으면 점선 사각형이 생기고, 이름표로 선택·이동·이름 바꾸기, 파형은 그룹 경계 신호', async ({ page }) => {
  await seed(page, halfAdder());
  // 반가산기의 XOR·AND만 범위 선택 (스위치·LED는 빼고)
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const xor = (await page.getByTestId('part-xor1').boundingBox())!;
  const and = (await page.getByTestId('part-and1').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(Math.min(xor.x, and.x) - 10, Math.min(xor.y, and.y) - 10);
  await page.mouse.down();
  await page.mouse.move(Math.max(xor.x + xor.width, and.x + and.width) + 10, Math.max(xor.y + xor.height, and.y + and.height) + 10, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(canvas.width).toBeGreaterThan(0);

  await page.getByRole('button', { name: '그룹으로 묶기' }).click();
  const dialog = page.getByRole('dialog', { name: '그룹으로 묶기' });
  await dialog.getByLabel('그룹 이름').fill('덧셈부');
  await dialog.getByRole('button', { name: '묶기' }).click();

  const label = page.getByRole('button', { name: '그룹 덧셈부 선택' });
  await expect(label).toBeVisible();
  await expect(page.locator('.group-rect')).toHaveCount(1);
  // 묶은 직후 그룹 전체가 선택된 상태 → 파형은 그룹 경계(입력 A·B, 출력 S·C)
  await expect(page.getByTestId('wave-summary')).toHaveText('그룹 "덧셈부" 경계 · 채널 4개');
  await page.screenshot({ path: test.info().outputPath('group.png') });

  // 바닥을 눌러 선택 해제 → 이름표를 누르면 다시 그룹 선택
  await page.mouse.click(canvas.x + 600, canvas.y + 350);
  await expect(page.getByTestId('wave-summary')).toHaveText('모든 입력과 출력');
  await label.click();
  await expect(page.getByTestId('wave-summary')).toContainText('그룹 "덧셈부" 경계');
  await expect(page.getByLabel('그룹 이름')).toHaveValue('덧셈부');

  // 이름표를 끌면 그룹 전체가 움직인다
  const before = (await page.getByTestId('part-xor1').boundingBox())!;
  const lb = (await label.boundingBox())!;
  await page.mouse.move(lb.x + 10, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + 10, lb.y + lb.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  const after = (await page.getByTestId('part-xor1').boundingBox())!;
  expect(after.y - before.y).toBeGreaterThan(40);

  // 인스펙터에서 이름 바꾸기
  await page.getByLabel('그룹 이름').fill('가산부');
  await page.getByLabel('그룹 이름').press('Enter');
  await expect(page.getByRole('button', { name: '그룹 가산부 선택' })).toBeVisible();

  // 새로고침해도 남고, 그룹 풀기
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
  await page.reload();
  await page.getByRole('button', { name: '그룹 가산부 선택' }).click();
  await page.getByRole('button', { name: '그룹 풀기' }).click();
  await expect(page.locator('.group-rect')).toHaveCount(0);
});

test('메모: 편집 메뉴로 추가해 바로 쓰고, 끌어 옮기고, 두 번 눌러 고치고, Delete로 지운다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').build());
  await menuAction(page, '편집', '메모 추가');
  const edit = page.getByLabel('메모 내용', { exact: true });
  await expect(edit).toBeFocused();
  await edit.fill('여기는 입력부\nA를 켜 보세요');
  // 쓰는 중에는 캔버스 단축키(R, Delete)가 동작하지 않는다
  await edit.press('r');
  await edit.press('Escape');
  const note = page.locator('.note');
  await expect(note).toContainText('여기는 입력부');
  await expect(note).toContainText('A를 켜 보세요r');
  await page.screenshot({ path: test.info().outputPath('note.png') });

  // 끌어서 옮기기
  const b0 = (await note.boundingBox())!;
  await page.mouse.move(b0.x + 20, b0.y + 10);
  await page.mouse.down();
  await page.mouse.move(b0.x + 120, b0.y + 50, { steps: 5 });
  await page.mouse.up();
  const b1 = (await note.boundingBox())!;
  expect(b1.x - b0.x).toBeGreaterThan(80);

  // 두 번 눌러 고치기
  await note.dblclick();
  await page.getByLabel('메모 내용', { exact: true }).fill('고친 메모');
  await page.getByLabel('메모 내용', { exact: true }).press('Control+Enter');
  await expect(note).toHaveText('고친 메모');

  // 새로고침 후에도 남고, 선택해서 Delete
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
  await page.reload();
  await page.locator('.note').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.note')).toHaveCount(0);
});

test('파일 메뉴: 작업 공간 비우기(실행 취소 가능)와 모두 초기화(내 칩까지)', async ({ page }) => {
  await seed(page, halfAdder(), { 'logiclab:v1:library': serializeLibrary(nestedLibrary()) });
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(6);
  await menuAction(page, '파일', '작업 공간 비우기');
  const confirm = page.getByRole('dialog', { name: '작업 공간 비우기' });
  await expect(confirm).toContainText('부품 6개');
  await confirm.getByRole('button', { name: '비우기' }).click();
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(0);
  await expect(page.locator('.chip-item')).not.toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(6);

  await menuAction(page, '파일', '모두 초기화');
  const all = page.getByRole('dialog', { name: '모두 초기화' });
  await expect(all).toContainText('되돌릴 수 없으니');
  await all.getByRole('button', { name: '모두 지우기' }).click();
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(0);
  await expect(page.locator('.chip-item')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
  await page.reload();
  await expect(page.locator('.chip-item')).toHaveCount(0);
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(0);
});
