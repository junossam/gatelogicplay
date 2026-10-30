import { expect, test } from '@playwright/test';
import { halfAdder } from '../fixtures/circuits';
import { seed } from './helpers';

test('팔레트 맨 위 도구: 이동(손)은 바닥 끌기로 화면 이동, 선택은 바닥 끌기로 범위 선택', async ({ page }) => {
  await seed(page, halfAdder());
  const tools = page.getByRole('toolbar', { name: '캔버스 도구' });
  const hand = tools.getByRole('button', { name: '이동' });
  const select = tools.getByRole('button', { name: '선택' });
  await expect(hand).toHaveAttribute('aria-pressed', 'true');
  await expect(tools.getByRole('button')).toHaveText(['✋이동', '⬚선택', '📝메모']);

  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const drag = async (dx: number, dy: number) => {
    await page.mouse.move(canvas.x + 20, canvas.y + 20);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 20 + dx, canvas.y + 20 + dy, { steps: 6 });
    await page.mouse.up();
  };

  // 이동: 부품이 화면에서 함께 움직이고 선택은 없음
  const before = (await page.getByTestId('part-xor1').boundingBox())!;
  await drag(100, 50);
  const after = (await page.getByTestId('part-xor1').boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(100);
  await expect(page.locator('.part-hit.selected')).toHaveCount(0);

  // 선택: 같은 끌기가 범위 선택이 된다 (Shift 없이)
  await select.click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('statusbar')).toContainText('드래그: 범위 선택');
  await drag(700, 500);
  await expect(page.locator('.part-hit.selected')).toHaveCount(6);
  const moved = (await page.getByTestId('part-xor1').boundingBox())!;
  expect(Math.round(moved.x)).toBe(Math.round(after.x));
  await page.screenshot({ path: test.info().outputPath('tools.png') });

  // 단축키 H / V
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('h');
  await expect(hand).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(select).toHaveAttribute('aria-pressed', 'true');
});

test('메모 도구: 누른 뒤 캔버스를 클릭한 자리에 메모가 생기고 바로 쓴다, Esc로 도구 취소', async ({ page }) => {
  await seed(page, halfAdder());
  const memo = page.getByRole('toolbar', { name: '캔버스 도구' }).getByRole('button', { name: '메모' });
  const canvas = (await page.getByTestId('canvas').boundingBox())!;

  await memo.click();
  await expect(memo).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('statusbar')).toContainText('클릭한 자리에 메모를 놓습니다');
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  await expect(memo).toHaveAttribute('aria-pressed', 'false');

  await memo.click();
  await page.mouse.click(canvas.x + 500, canvas.y + 300);
  await expect(memo).toHaveAttribute('aria-pressed', 'false');
  const edit = page.getByLabel('메모 내용', { exact: true });
  await expect(edit).toBeFocused();
  await edit.fill('여기에 메모');
  await edit.press('Escape');
  const note = page.locator('.note');
  await expect(note).toHaveText('여기에 메모');
  const box = (await note.boundingBox())!;
  // 클릭한 칸이 메모의 왼쪽 위
  expect(Math.abs(box.x - (canvas.x + 500))).toBeLessThan(21);
  expect(Math.abs(box.y - (canvas.y + 300))).toBeLessThan(21);
});
