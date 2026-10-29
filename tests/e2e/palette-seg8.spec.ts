import { expect, test, type Page } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { CircuitBuilder, nestedLibrary } from '../fixtures/circuits';
import { seed } from './helpers';

async function toggle(page: Page, id: string) {
  const box = (await page.getByTestId(`part-${id}`).locator('.part-hit').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
}

test('입력·출력, 버스, 내 칩도 한 줄에 2개씩 놓인다', async ({ page }) => {
  await seed(page, new CircuitBuilder().build(), { 'logiclab:v1:library': serializeLibrary(nestedLibrary()) });
  const sameRow = async (a: string, b: string) => {
    const ra = (await page.getByTestId(a).boundingBox())!;
    const rb = (await page.getByTestId(b).boundingBox())!;
    expect(Math.abs(ra.y - rb.y)).toBeLessThan(2);
    expect(rb.x).toBeGreaterThan(ra.x + ra.width - 1);
  };
  await page.locator('.palette').screenshot({ path: test.info().outputPath('palette.png') });
  await sameRow('palette-SWITCH', 'palette-PUSH');
  await sameRow('palette-LED', 'palette-SEG8');
  await sameRow('palette-SPLIT', 'palette-MERGE');
  const chips = page.locator('.chip-item');
  const r0 = (await chips.nth(0).boundingBox())!;
  const r1 = (await chips.nth(1).boundingBox())!;
  expect(Math.abs(r0.y - r1.y)).toBeLessThan(2);
  expect(r1.x).toBeGreaterThan(r0.x + r0.width - 1);
  await page.locator('.palette').screenshot({ path: test.info().outputPath('palette.png') });
});

test('내 칩 ⚙ 설정 메뉴: 편집·분류 바꾸기·삭제, Esc와 바깥 클릭으로 닫힘', async ({ page }) => {
  await seed(page, new CircuitBuilder().build(), { 'logiclab:v1:library': serializeLibrary(nestedLibrary()) });
  // 예전 개별 버튼은 없다
  await expect(page.getByRole('button', { name: 'SR 래치 편집' })).toHaveCount(0);

  const gear = page.getByRole('button', { name: 'SR 래치 설정', exact: true });
  await gear.click();
  const menu = page.getByRole('menu', { name: 'SR 래치 설정' });
  await expect(menu.getByRole('menuitem')).toHaveText(['✎편집', '🗀분류 바꾸기', '🗑삭제']);
  await expect(menu.getByRole('menuitem', { name: '편집' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: '분류 바꾸기' })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('chip-menu.png') });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(gear).toBeFocused();

  await gear.click();
  await page.locator('.canvas-area').click({ position: { x: 300, y: 200 } });
  await expect(menu).toHaveCount(0);

  // 편집
  await gear.click();
  await menu.getByRole('menuitem', { name: '편집' }).click();
  await expect(page.getByRole('navigation', { name: '이동 경로' })).toContainText('SR 래치');
  // 편집 중인 칩은 메뉴의 편집이 비활성
  await gear.click();
  await expect(menu.getByRole('menuitem', { name: '편집' })).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('8세그먼트: 스위치를 세그먼트 핀에 연결하면 그 세그먼트가 켜진다', async ({ page }) => {
  await seed(
    page,
    new CircuitBuilder()
      .add('SWITCH', 'a', 0, 1, 'A')
      .add('SWITCH', 'g', 0, 6, 'G')
      .add('SEG8', 'seg', 8, 0)
      .wire('a.y', 'seg.a')
      .wire('a.y', 'seg.d')
      .wire('g.y', 'seg.g')
      .build(),
  );
  const seg = page.getByTestId('part-seg');
  await expect(seg).toHaveAttribute('data-value', '0');
  await expect(page.locator('[data-pin="seg:dp"]')).toHaveCount(1);
  await toggle(page, 'a');
  await expect(seg).toHaveAttribute('data-value', String(0b1001));
  await toggle(page, 'g');
  await expect(seg).toHaveAttribute('data-value', String(0b1001001));
  await seg.screenshot({ path: test.info().outputPath('seg8.png') });

  // 팔레트에서 놓을 수 있다
  await page.getByTestId('palette-SEG8').click();
  await page.locator('.canvas-area svg').first().click({ position: { x: 500, y: 300 } });
  await expect(page.locator('[data-testid^="part-"][data-value]')).toHaveCount(4);
});
