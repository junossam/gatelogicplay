import { expect, test, type Page } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { CircuitBuilder, halfAdder, harness, nestedLibrary, srLatchChip } from '../fixtures/circuits';
import { seed } from './helpers';

const tickOf = async (page: Page) => Number((await page.getByTestId('tick').textContent())!.replace(/\D/g, ''));

test('Space: 실행/일시정지, Space+드래그: 화면 이동만', async ({ page }) => {
  await seed(page, halfAdder());
  await page.getByTestId('canvas').focus();
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: '실행', exact: true })).toBeVisible();
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();

  const before = (await page.getByTestId('part-xor1').boundingBox())!;
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.down(' ');
  await page.mouse.move(canvas.x + 600, canvas.y + 400);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 680, canvas.y + 460, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  const after = (await page.getByTestId('part-xor1').boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(80);
  expect(Math.round(after.y - before.y)).toBe(60);
  // 끌어서 이동했으므로 실행 상태는 그대로
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
});

test('. : 한 틱 진행 (일시정지)', async ({ page }) => {
  await seed(page, halfAdder());
  await page.getByTestId('canvas').focus();
  await page.keyboard.press(' ');
  const t0 = await tickOf(page);
  await page.keyboard.press('.');
  await page.keyboard.press('.');
  await page.keyboard.press('.');
  await expect.poll(() => tickOf(page)).toBe(t0 + 3);
});

test('R: 선택 부품 회전, 핀도 함께 돈다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('NOT', 'not1', 4, 4).build());
  await page.getByTestId('part-not1').locator('.part-hit').click();
  const pin = page.locator('[data-pin="not1:y"]');
  const before = (await page.getByTestId('part-not1').locator('.part-hit').boundingBox())!;
  const pinBefore = (await pin.boundingBox())!;
  await page.keyboard.press('r');
  const after = (await page.getByTestId('part-not1').locator('.part-hit').boundingBox())!;
  // 4×2칸 → 2×4칸
  expect(Math.round(after.width)).toBe(Math.round(before.height));
  expect(Math.round(after.height)).toBe(Math.round(before.width));
  const pinAfter = (await pin.boundingBox())!;
  // 출력 핀이 오른쪽 변 → 아래 변으로
  expect(pinAfter.y).toBeGreaterThan(pinBefore.y + 20);
  await page.keyboard.press('Control+z');
  const undone = (await page.getByTestId('part-not1').locator('.part-hit').boundingBox())!;
  expect(Math.round(undone.width)).toBe(Math.round(before.width));
});

test('Enter: 선택한 칩 안으로 들어가기, Esc: 위로', async ({ page }) => {
  const lib = nestedLibrary();
  await seed(page, harness(srLatchChip(), 'latch'), { 'logiclab:v1:library': serializeLibrary(lib) });
  await page.getByTestId('part-latch').locator('.part-hit').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('view-banner')).toContainText('SR 래치');
  await expect(page.getByTestId('part-or1')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('view-banner')).toHaveCount(0);
});

test('클럭: 팔레트에서 놓고 주파수를 바꾸면 LED가 깜빡인다, 설정에서 끌 수 있다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('LED', 'led1', 14, 4, 'Y').build());
  await page.getByLabel('시뮬레이션 속도').fill('60');
  await expect(page.getByTestId('palette-CLOCK')).toHaveClass(/optional/);
  await page.getByTestId('palette-CLOCK').click();
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 150, canvas.y + 140);
  await expect(page.getByTestId('part-clock1')).toBeVisible();

  const a = (await page.locator('[data-pin="clock1:y"]').boundingBox())!;
  const b = (await page.locator('[data-pin="led1:a"]').boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();

  await page.getByTestId('part-clock1').locator('.part-hit').click({ position: { x: 4, y: 4 } });
  const hz = page.getByLabel('클럭 주파수(Hz)');
  await hz.fill('4');
  await hz.press('Enter');

  // 4Hz 클럭: 1초 안에 LED가 켜졌다 꺼졌다 한다
  const led = page.getByTestId('part-led1');
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    seen.add((await led.getAttribute('data-value'))!);
    await page.waitForTimeout(60);
  }
  expect([...seen].sort()).toEqual(['0', '1']);
  // 클럭이 있는 회로의 진리표는 만들지 않는다
  await expect(page.locator('.inspector')).toContainText('클럭이 있는 회로는 진리표를 만들 수 없습니다');

  await page.getByRole('button', { name: '설정' }).click();
  await page.getByRole('checkbox', { name: '클럭 부품 사용' }).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('palette-CLOCK')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('palette-CLOCK')).toHaveCount(0);
});

test('검색 입력 중에는 Space·R·. 단축키가 동작하지 않는다', async ({ page }) => {
  await seed(page, halfAdder());
  const search = page.getByLabel('부품 검색');
  await search.click();
  await page.keyboard.type(' r.');
  await expect(search).toHaveValue(' r.');
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
});
