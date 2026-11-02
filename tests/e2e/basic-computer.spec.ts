import { expect, test } from '@playwright/test';

test('기본 컴퓨터 예제: 열어서 RESET 후 CLK를 누르면 인출 단계가 진행된다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/#sample=${encodeURIComponent('기본 컴퓨터/명령어 인출.json')}`);
  const imp = page.getByRole('dialog', { name: '가져오기' });
  await expect(imp).toContainText('칩');
  await imp.getByRole('button', { name: '가져오기' }).click();
  // 화면 밖 부품은 그리지 않으므로 먼저 전체 보기
  await page.getByRole('button', { name: '전체 보기' }).click();
  await expect(page.getByTestId('part-bus')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('basic-computer.png') });

  const flip = async (id: string) => {
    const box = (await page.getByTestId(`part-${id}`).locator('.part-hit').boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + box.height / 2);
  };
  const push = async () => {
    const box = (await page.getByTestId('push-clk').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId('part-clk')).toHaveAttribute('data-value', '1');
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(800);
  };
  await flip('reset');
  await expect(page.getByTestId('part-reset')).toHaveAttribute('data-value', '1');
  await page.waitForTimeout(500);
  await push();
  await flip('reset');
  await expect(page.getByTestId('part-reset')).toHaveAttribute('data-value', '0');
  await expect(page.getByTestId('part-t0')).toHaveAttribute('data-value', '1');
  // RESET을 끈 뒤 회로가 자리 잡을 시간 (사람이 누르는 속도면 충분)
  await page.waitForTimeout(1000);
  await push(); // T0: AR ← PC
  await push(); // T1: DR ← M[AR], PC ← PC+1
  await expect(page.getByTestId('part-v_dr')).toHaveAttribute('data-value', String(0x2004));
  await expect(page.getByTestId('part-v_pc')).toHaveAttribute('data-value', '1');
  await push(); // T2: IR ← DR
  await expect(page.getByTestId('part-v_ir')).toHaveAttribute('data-value', String(0x2004));
  await push(); // T3: AR ← IR(0~11)
  await expect(page.getByTestId('part-v_ar')).toHaveAttribute('data-value', '4');
  await expect(page.getByTestId('part-t0')).toHaveAttribute('data-value', '1');
  await page.screenshot({ path: test.info().outputPath('basic-computer-after.png') });
});
