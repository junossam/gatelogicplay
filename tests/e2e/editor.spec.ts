import { expect, test, type Page } from '@playwright/test';

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`보이지 않음: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 팔레트 버튼을 누른 뒤 캔버스의 (dx, dy) 지점을 클릭해 배치 */
async function placeByClick(page: Page, kind: string, dx: number, dy: number) {
  await page.getByTestId(`palette-${kind}`).click();
  const canvas = await page.getByTestId('canvas').boundingBox();
  await page.mouse.click(canvas!.x + dx, canvas!.y + dy);
}

async function dragWire(page: Page, from: string, to: string) {
  const a = await center(page, `[data-pin="${from}"]`);
  const b = await center(page, `[data-pin="${to}"]`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('1단계 완료 기준: 스위치 → AND → LED를 연결하고 새로고침해도 회로가 남아 있음', async ({ page }) => {
  await placeByClick(page, 'SWITCH', 120, 200);
  await placeByClick(page, 'AND', 340, 200);
  await placeByClick(page, 'LED', 560, 180);

  await expect(page.getByTestId('part-switch1')).toBeVisible();
  await expect(page.getByTestId('part-and1')).toBeVisible();
  await expect(page.getByTestId('part-led1')).toBeVisible();

  await dragWire(page, 'switch1:y', 'and1:a');
  await dragWire(page, 'and1:y', 'led1:a');

  await expect(page.getByTestId('wire-w1')).toHaveCount(1);
  await expect(page.getByTestId('wire-w2')).toHaveCount(1);
  await expect(page.getByTestId('statusbar')).toContainText('게이트 1 · 전선 2');
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');

  await page.reload();

  await expect(page.getByTestId('part-switch1')).toBeVisible();
  await expect(page.getByTestId('part-and1')).toBeVisible();
  await expect(page.getByTestId('part-led1')).toBeVisible();
  await expect(page.getByTestId('wire-w1')).toHaveCount(1);
  await expect(page.getByTestId('wire-w2')).toHaveCount(1);
  await expect(page.getByTestId('statusbar')).toContainText('게이트 1 · 전선 2');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('logiclab:v1:workspace')!));
  expect(saved).toMatchObject({ format: 'logiclab', version: 7 });
  expect(saved.workspace.wires).toEqual([
    { id: 'w1', from: { partId: 'switch1', pin: 'y' }, to: { partId: 'and1', pin: 'a' } },
    { id: 'w2', from: { partId: 'and1', pin: 'y' }, to: { partId: 'led1', pin: 'a' } },
  ]);
});

test('끌어다 놓기로 배치, 이동, 삭제, 실행 취소', async ({ page }) => {
  const canvas = page.getByTestId('canvas');
  await page.getByTestId('palette-NOT').dragTo(canvas, { targetPosition: { x: 200, y: 200 } });
  const part = page.getByTestId('part-not1');
  await expect(part).toBeVisible();

  // 이동
  const before = (await part.boundingBox())!;
  const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 100, start.y + 60, { steps: 5 });
  await page.mouse.up();
  const after = (await part.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(100);
  expect(Math.round(after.y - before.y)).toBe(60);

  // 삭제 (캔버스 포커스 + Delete)
  await page.keyboard.press('Delete');
  await expect(part).toHaveCount(0);

  // 실행 취소: 삭제 → 이동 순서로 되돌린다
  await page.keyboard.press('Control+z');
  await expect(part).toBeVisible();
  expect(Math.round((await part.boundingBox())!.x)).toBe(Math.round(after.x));
  await page.keyboard.press('Control+z');
  expect(Math.round((await part.boundingBox())!.x)).toBe(Math.round(before.x));

  // 다시 실행
  await page.keyboard.press('Control+Shift+z');
  expect(Math.round((await part.boundingBox())!.x)).toBe(Math.round(after.x));
});

test('범위 선택 후 일괄 삭제하면 연결된 전선도 지워진다', async ({ page }) => {
  await placeByClick(page, 'SWITCH', 120, 200);
  await placeByClick(page, 'LED', 360, 200);
  await dragWire(page, 'switch1:y', 'led1:a');
  await expect(page.getByTestId('wire-w1')).toHaveCount(1);

  // Shift+드래그 = 범위 선택
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(canvas.x + 20, canvas.y + 20);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(canvas.x + 300, canvas.y + 400, { steps: 5 });
  await expect(page.getByText('범위 선택 · 부품 1개')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await page.keyboard.press('Delete');
  await expect(page.getByTestId('part-switch1')).toHaveCount(0);
  await expect(page.getByTestId('part-led1')).toBeVisible();
  await expect(page.getByTestId('wire-w1')).toHaveCount(0);
});

test('팔레트에서 NAND, NOR, XNOR를 배치하고 연결할 수 있다', async ({ page }) => {
  await placeByClick(page, 'SWITCH', 100, 200);
  await placeByClick(page, 'NAND', 300, 120);
  await placeByClick(page, 'NOR', 300, 260);
  await placeByClick(page, 'XNOR', 300, 400);
  for (const id of ['nand1', 'nor1', 'xnor1']) {
    await expect(page.getByTestId(`part-${id}`)).toBeVisible();
    await dragWire(page, 'switch1:y', `${id}:a`);
  }
  await expect(page.getByTestId('statusbar')).toContainText('게이트 3 · 전선 3');
  await page.getByTestId('part-nor1').click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId('inspector-part')).toContainText('NOR 게이트');
});

test('입력 필드에서는 단축키가 동작하지 않는다', async ({ page }) => {
  await placeByClick(page, 'AND', 200, 200);
  await page.getByLabel('부품 검색').fill('xor');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('part-and1')).toBeVisible();
  await expect(page.getByLabel('부품 검색')).toHaveValue('xo');
});

test('바닥을 끌면 화면 전체가 이동하고 부품 위치는 그대로, 클릭만 하면 선택 해제', async ({ page }) => {
  await placeByClick(page, 'AND', 200, 200);
  await placeByClick(page, 'NOT', 400, 200);
  await expect(page.getByTestId('part-not1').locator('.part-hit')).toHaveClass(/selected/);
  const before = (await page.getByTestId('part-and1').boundingBox())!;
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
  const saved = await page.evaluate(() => localStorage.getItem('logiclab:v1:workspace'));

  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(canvas.x + 600, canvas.y + 450);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 500, canvas.y + 350, { steps: 5 });
  await page.mouse.up();
  const after = (await page.getByTestId('part-and1').boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(-100);
  expect(Math.round(after.y - before.y)).toBe(-100);
  // 화면만 움직였고 회로(부품 좌표)는 바뀌지 않았다
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => localStorage.getItem('logiclab:v1:workspace'))).toBe(saved);
  await expect(page.getByRole('button', { name: '실행 취소' })).toBeEnabled(); // 배치 기록만 있음

  // 끌지 않고 클릭만 하면 선택 해제
  await page.mouse.click(canvas.x + 600, canvas.y + 450);
  await expect(page.getByTestId('part-not1').locator('.part-hit')).not.toHaveClass(/selected/);
});

test('전체 보기: 화면 밖으로 나간 부품을 다시 보이게 맞춘다', async ({ page }) => {
  await placeByClick(page, 'AND', 200, 200);
  await page.keyboard.press('Escape'); // 선택한 부품은 화면 밖이어도 그리므로 선택 해제
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  // 화면을 크게 밀어 부품을 밖으로 보낸다
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(canvas.x + 100, canvas.y + 100);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 800, canvas.y + 500, { steps: 3 });
    await page.mouse.up();
  }
  await expect(page.getByTestId('part-and1')).toHaveCount(0); // 화면 밖이라 그리지 않음
  await page.getByRole('button', { name: '전체 보기' }).click();
  await expect(page.getByTestId('part-and1')).toBeInViewport();
});
