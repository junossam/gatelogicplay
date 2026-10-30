import { expect, test } from '@playwright/test';
import { serializeLibrary } from '../../src/model/storage';
import { busAdderWorkspace, busLibrary, CircuitBuilder } from '../fixtures/circuits';
import { seed } from './helpers';

test('칩 내부 보기: 보지 않기 → 1단계 → 전체로 펼치면 칩마다 점선 그룹, 바깥 스위치는 조작 가능, 편집은 막힘', async ({ page }) => {
  await seed(page, busAdderWorkspace(), { 'logiclab:v1:library': serializeLibrary(busLibrary()) });
  const control = page.getByRole('group', { name: '칩 내부 보기' });
  await expect(control.getByRole('button', { name: '보지 않기' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('part-add')).toHaveCount(1);

  // 1단계: 가산기 칩만 펼쳐지고 안의 전가산기는 칩으로
  await control.getByRole('button', { name: '1단계' }).click();
  await expect(page.getByTestId('part-add')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '그룹 4비트 가산기(버스) (add) 선택' })).toBeVisible();
  await expect(page.locator('[data-testid^="part-add/fa"]')).toHaveCount(4);
  await expect(page.getByTestId('statusbar')).toContainText('칩 내부를 펼쳐 보는 중');

  // 바깥 4비트 스위치는 눌러 볼 수 있고, 펼친 칩 안을 거쳐 합이 바뀐다
  const ina = page.getByTestId('part-ina');
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const box = (await ina.locator('.part-hit').boundingBox())!;
  expect(box.y).toBeGreaterThan(canvas.y);
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
  await expect(ina).toHaveAttribute('data-value', '1');
  await expect(page.getByTestId('part-sum')).toHaveAttribute('data-value', '1');

  // 전체: 기본 게이트만, 칩마다 그룹 (가산기 1 + 전가산기 4 + 반가산기 8)
  await control.getByRole('button', { name: '전체' }).click();
  await expect(page.locator('.group-rect')).toHaveCount(13);
  await expect(page.locator('[data-testid="part-add/fa0/ha1/xor1"]')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('expanded.png') });

  // 편집은 막힘: 끌어도 움직이지 않고, Delete도 안 됨
  const gate = page.locator('[data-testid="part-add/fa0/or1"]');
  const g0 = (await gate.boundingBox())!;
  await page.mouse.move(g0.x + g0.width / 2, g0.y + g0.height / 2);
  await page.mouse.down();
  await page.mouse.move(g0.x + g0.width / 2 + 80, g0.y + g0.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const g1 = (await gate.boundingBox())!;
  expect(Math.round(g1.x)).toBe(Math.round(g0.x));
  await page.keyboard.press('Delete');
  await expect(gate).toHaveCount(1);

  // 그룹 이름표를 누르면 그 칩 범위의 경계 신호가 파형에
  await page.getByRole('button', { name: '그룹 전가산기 (fa0) 선택' }).click();
  await expect(page.getByTestId('wave-summary')).toContainText('그룹 "전가산기 (fa0)" 경계');

  // 보지 않기로 돌아가면 다시 칩 하나
  await control.getByRole('button', { name: '보지 않기' }).click();
  await expect(page.getByTestId('part-add')).toHaveCount(1);
  await expect(page.locator('.group-rect')).toHaveCount(0);
});

test('칩이 없는 회로에서는 칩 내부 보기 버튼이 보이지 않는다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').build());
  await expect(page.getByRole('group', { name: '칩 내부 보기' })).toHaveCount(0);
});
