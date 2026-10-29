import { expect, test, type Page } from '@playwright/test';
import { menuAction, seed } from './helpers';
import { halfAdder } from '../fixtures/circuits';

async function openChallenge(page: Page, id: string) {
  await menuAction(page, '도구', '챌린지');
  await page.getByTestId(`challenge-${id}`).getByRole('button').click();
  await expect(page.getByTestId('challenge-panel')).toBeVisible();
}

async function place(page: Page, kind: string, x: number, y: number) {
  await page.getByTestId(`palette-${kind}`).click();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(c.x + x, c.y + y);
}

async function wire(page: Page, from: string, to: string) {
  const a = (await page.locator(`[data-pin="${from}"]`).boundingBox())!;
  const b = (await page.locator(`[data-pin="${to}"]`).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('6단계 완료 기준: NAND로 XOR — 허용 부품만 활성, 틀린 행 표시, 통과, 새로고침 후 유지', async ({ page }) => {
  await seed(page, halfAdder());
  await openChallenge(page, 'nand-xor');
  await expect(page.getByRole('navigation', { name: '이동 경로' })).toContainText('NAND로 XOR');
  // 작업 공간은 맡겨 두고 이름 붙은 입출력만 있는 회로가 열린다
  await expect(page.getByTestId('part-xor1')).toHaveCount(0);
  await expect(page.getByTestId('part-in1')).toContainText('A');

  // NAND 외 게이트는 비활성
  await expect(page.getByTestId('palette-NAND')).toBeEnabled();
  for (const k of ['AND', 'OR', 'XOR', 'NOR', 'XNOR', 'NOT', 'CLOCK']) await expect(page.getByTestId(`palette-${k}`)).toBeDisabled();

  // 빈 회로: Y = 0 이므로 A≠B 두 행이 틀림
  await expect(page.getByTestId('grade')).toContainText('4행 중 2행이 틀렸습니다');
  await expect(page.getByTestId('grade-table').locator('tr.wrong')).toHaveCount(2);

  // NAND 4개 배치 (g1: 가운데 위, g2/g3: 그 오른쪽 위아래, g4: 맨 오른쪽)
  await place(page, 'NAND', 240, 120);
  await place(page, 'NAND', 360, 60);
  await place(page, 'NAND', 360, 200);
  await place(page, 'NAND', 480, 120);
  await wire(page, 'in1:y', 'nand1:a');
  await wire(page, 'in2:y', 'nand1:b');
  await wire(page, 'in1:y', 'nand2:a');
  await wire(page, 'nand1:y', 'nand2:b');
  await wire(page, 'nand1:y', 'nand3:a');
  await wire(page, 'in2:y', 'nand3:b');
  await wire(page, 'nand2:y', 'nand4:a');
  await wire(page, 'nand3:y', 'nand4:b');
  await wire(page, 'nand4:y', 'out1:a');

  await expect(page.getByTestId('grade')).toContainText('통과!');
  await expect(page.getByTestId('grade')).toContainText('게이트 4개');
  await expect(page.getByTestId('grade-table').locator('tr.wrong')).toHaveCount(0);

  // 새로고침해도 챌린지와 풀이가 남는다
  await page.waitForTimeout(1300);
  await page.reload();
  await expect(page.getByTestId('grade')).toContainText('통과!');
  await menuAction(page, '도구', '챌린지');
  await expect(page.getByTestId('challenge-nand-xor')).toContainText('통과 · 게이트 4개');
  await page.keyboard.press('Escape');

  // 나가면 작업 공간이 돌아온다
  await page.getByTestId('challenge-panel').getByRole('button', { name: '나가기' }).click();
  await expect(page.getByTestId('part-xor1')).toBeVisible();
  await expect(page.getByTestId('palette-AND')).toBeEnabled();
});

test('6단계 완료 기준: NOR SR 래치 챌린지는 이전 유지·금지 상태 행까지 채점', async ({ page }) => {
  await seed(page, { parts: [], wires: [] });
  await openChallenge(page, 'nor-sr');
  await expect(page.getByTestId('grade-table')).toContainText('유지');
  await expect(page.getByTestId('grade-table')).toContainText('상관없음');

  await place(page, 'NOR', 240, 80);
  await place(page, 'NOR', 240, 240);
  await wire(page, 'in1:y', 'nor1:a');
  await wire(page, 'nor2:y', 'nor1:b');
  await wire(page, 'in2:y', 'nor2:a');
  await wire(page, 'nor1:y', 'nor2:b');
  await wire(page, 'nor1:y', 'out1:a');
  await wire(page, 'nor2:y', 'out2:a');

  await expect(page.getByTestId('grade')).toContainText('통과!');
  const rows = page.getByTestId('grade-table').locator('tbody tr');
  await expect(rows.nth(0)).toContainText('유지');
  await expect(rows.nth(3)).toContainText('금지');
});

test('챌린지 중에는 칩으로 저장을 숨기고, 이름이 바뀐 입력은 채점하지 않는다', async ({ page }) => {
  await seed(page, { parts: [], wires: [] });
  await openChallenge(page, 'half-adder');
  await expect(page.getByRole('button', { name: '칩으로 저장' })).toHaveCount(0);
  await page.getByTestId('part-in1').locator('.part-hit').click({ position: { x: 4, y: 4 } });
  const label = page.getByLabel('라벨');
  await label.fill('Z');
  await label.press('Enter');
  await expect(page.getByTestId('grade')).toContainText('이름이 맞는 입력이 없습니다: A');
});
