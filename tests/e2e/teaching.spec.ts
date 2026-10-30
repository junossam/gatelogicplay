import { expect, test } from '@playwright/test';

const FILES = [
  '기본/NAND로 만든 게이트.json',
  '선택/멀티플렉서.json',
  '선택/디코더·인코더.json',
  '연산/비교기.json',
  '연산/전감산기.json',
  '연산/4비트 ALU.json',
  '기억 소자/레지스터.json',
  '기억 소자/카운터.json',
  '표시/0~99 카운터.json',
  '기타/부호·검사.json',
];

test('수업용 예제: 예제 창에 모두 보이고, 열면 칩 없이 게이트와 블록 그룹으로 펼쳐져 있다', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('menubar').getByRole('menuitem', { name: '파일', exact: true }).click();
  await page.getByRole('menu', { name: '파일' }).getByRole('menuitem', { name: '예제', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '예제' });
  for (const f of FILES) await expect(dialog.getByTestId(`sample-${f}`)).toBeVisible();

  for (const [i, f] of FILES.entries()) {
    const p = await context.newPage();
    await p.goto(`/#sample=${encodeURIComponent(f)}`);
    await p.getByRole('dialog', { name: '가져오기' }).getByRole('button', { name: '가져오기' }).click();
    await expect(p.locator('.group-rect').first()).toBeVisible();
    await expect(p.locator('.chip-body')).toHaveCount(0);
    await expect(p.getByRole('group', { name: '칩 내부 보기' })).toHaveCount(0);
    await p.getByRole('button', { name: '전체 보기' }).click();
    await p.screenshot({ path: test.info().outputPath(`sample-${i}.png`) });
    await p.close();
  }
});
