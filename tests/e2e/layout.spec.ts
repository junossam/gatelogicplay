import { expect, test } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { busAdderWorkspace, busLibrary } from '../fixtures/circuits';
import { seed } from './helpers';

test('왼쪽·오른쪽 창: 숨기기·펼치기, 경계를 끌어(또는 ←→) 폭 조절, 새로고침 후에도 기억', async ({ page }) => {
  await seed(page, busAdderWorkspace(), { 'logiclab:v1:library': serializeLibrary(busLibrary()) });
  const palette = page.getByRole('complementary', { name: '부품 팔레트' });
  const inspector = page.getByRole('complementary', { name: '인스펙터' });
  const canvasW = async () => (await page.getByTestId('canvas').boundingBox())!.width;

  // 칩 내부 보기 버튼은 인스펙터 맨 위(선택한 부품 위)
  const control = inspector.getByRole('group', { name: '칩 내부 보기' });
  await expect(control).toBeVisible();
  const cy = (await control.boundingBox())!.y;
  const ty = (await inspector.getByRole('heading', { name: '선택한 부품' }).boundingBox())!.y;
  expect(cy).toBeLessThan(ty);
  await page.screenshot({ path: test.info().outputPath('layout.png') });

  // 왼쪽 경계를 오른쪽으로 끌면 팔레트가 넓어진다
  const w0 = (await palette.boundingBox())!.width;
  const left = page.getByRole('separator', { name: '부품 팔레트 폭 조절' });
  const lb = (await left.boundingBox())!;
  await page.mouse.move(lb.x + lb.width / 2, lb.y + 200);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width / 2 + 100, lb.y + 200, { steps: 5 });
  await page.mouse.up();
  const w1 = (await palette.boundingBox())!.width;
  expect(Math.round(w1 - w0)).toBe(100);

  // 팔레트를 넓혀도 부품 버튼 크기는 그대로이고, 한 줄에 들어가는 개수가 늘어난다
  const perRow = async () => {
    const ys = await palette.locator('.palette-grid').first().locator('.palette-item').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    return ys.filter((y) => y === ys[0]).length;
  };
  const btnW = async () => (await palette.getByTestId('palette-AND').boundingBox())!.width;
  expect(await perRow()).toBe(4);
  const bw = await btnW();

  // 오른쪽 경계는 키보드로 (← = 넓게)
  const right = page.getByRole('separator', { name: '인스펙터 폭 조절' });
  const r0 = (await inspector.boundingBox())!.width;
  await right.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(Math.round((await inspector.boundingBox())!.width - r0)).toBe(32);

  // 최소 폭보다 줄지 않는다
  await left.focus();
  await page.keyboard.press('Home');
  await expect(left).toHaveAttribute('aria-valuenow', '180');
  expect(await perRow()).toBe(2);
  expect(await btnW()).toBe(bw);
  await page.keyboard.press('End');
  expect(await perRow()).toBe(6);
  expect(await btnW()).toBe(bw);
  await page.keyboard.press('Home');

  // 숨기기 → 캔버스가 넓어지고, 펼치기 버튼으로 되돌린다
  const c0 = await canvasW();
  await palette.getByRole('button', { name: '부품 팔레트 숨기기' }).click();
  await inspector.getByRole('button', { name: '인스펙터 숨기기' }).click();
  await expect(palette).toHaveCount(0);
  await expect(inspector).toHaveCount(0);
  expect(await canvasW()).toBeGreaterThan(c0 + 300);
  await page.screenshot({ path: test.info().outputPath('collapsed.png') });

  // 새로고침해도 숨긴 상태와 폭을 기억
  await page.reload();
  await expect(palette).toHaveCount(0);
  await page.getByRole('button', { name: '부품 팔레트 펼치기' }).click();
  await page.getByRole('button', { name: '인스펙터 펼치기' }).click();
  await expect(page.getByRole('separator', { name: '부품 팔레트 폭 조절' })).toHaveAttribute('aria-valuenow', '180');
  expect(Math.round((await inspector.boundingBox())!.width)).toBe(Math.round(r0 + 32));

  // 두 번 누르면 기본 폭
  await page.getByRole('separator', { name: '부품 팔레트 폭 조절' }).dblclick();
  await expect(page.getByRole('separator', { name: '부품 팔레트 폭 조절' })).toHaveAttribute('aria-valuenow', '240');
});
