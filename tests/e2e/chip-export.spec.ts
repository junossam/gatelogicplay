import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { serializeLibrary } from '../../src/model/storage';
import { CircuitBuilder, nestedLibrary } from '../fixtures/circuits';
import { chipAction, seed } from './helpers';

const json = async (d: Download) => JSON.parse(readFileSync((await d.path())!, 'utf8'));

async function download(page: Page, action: () => Promise<void>) {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  return d;
}

test('공유 버튼은 칩으로 저장 옆에 있다', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').build());
  const buttons = page.locator('.header-actions > button');
  const names = await buttons.allInnerTexts();
  const i = names.indexOf('칩으로 저장');
  expect(names[i + 1]).toBe('공유');
  await page.locator('.header-actions').getByRole('button', { name: '공유', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '공유 링크' })).toBeVisible();
});

test('칩 내보내기: 하나(쓰는 칩 포함)·모두 내보내기, 그 파일을 칩 가져오기로 다른 곳에 추가', async ({ page, context }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').build(), {
    'logiclab:v1:library': serializeLibrary(nestedLibrary()),
  });

  // ⚙ → 내보내기: D 래치와 그 안의 SR 래치만, 작업 공간은 비어 있음
  const one = await download(page, () => chipAction(page, 'D 래치', '내보내기'));
  expect(one.suggestedFilename()).toBe('D 래치.gatelogicplay.json');
  const oneDoc = await json(one);
  expect(Object.values(oneDoc.library).map((d) => (d as { name: string }).name).sort()).toEqual(['D 래치', 'SR 래치']);
  expect(oneDoc.workspace).toEqual({ parts: [], wires: [] });
  expect(oneDoc.openChipId).toBeNull();

  // 모두 내보내기
  const all = await download(page, () => page.getByRole('button', { name: '모두 내보내기' }).click());
  expect(all.suggestedFilename()).toBe('내 칩 모음.gatelogicplay.json');
  expect(Object.keys((await json(all)).library)).toHaveLength(Object.keys(nestedLibrary()).length);

  // 다른 사람(빈 브라우저)이 칩 가져오기로 추가 → 작업 공간은 그대로, 내 칩에만 추가
  const other = await context.browser()!.newPage();
  await seed(other, new CircuitBuilder().add('LED', 'y', 0, 0, 'Y').build());
  await expect(other.locator('.chip-item')).toHaveCount(0);
  await other.getByTestId('import-chip-file').setInputFiles((await one.path())!);
  const dialog = other.getByRole('dialog', { name: '가져오기' });
  await expect(dialog).toContainText('칩 2개');
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: '가져오기' }).click();
  await expect(other.getByTestId('chip-item-D 래치')).toHaveCount(1);
  await expect(other.getByTestId('chip-item-SR 래치')).toHaveCount(1);
  await expect(other.getByTestId('part-y')).toHaveCount(1);
  await expect(other.getByRole('navigation', { name: '이동 경로' })).toContainText('작업 공간');
  await other.screenshot({ path: test.info().outputPath('imported.png') });
  await other.close();
});

test('기본 제공 칩: 아이콘 버튼으로 열어 chips/ 폴더의 칩 묶음을 내 칩에 추가 (작업 공간은 그대로)', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').build());
  const actions = page.locator('.chip-file-actions');
  await expect(actions.getByRole('button')).toHaveCount(3);
  for (const name of ['칩 가져오기', '모두 내보내기', '기본 제공 칩']) await expect(actions.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: '모두 내보내기' })).toBeDisabled();

  await actions.getByRole('button', { name: '기본 제공 칩' }).click();
  const dialog = page.getByRole('dialog', { name: '기본 제공 칩' });
  const adder = dialog.getByTestId('builtin-연산/가산기.json');
  await expect(adder).toContainText('칩 3개 · 반가산기, 전가산기, 4비트 가산기(버스)');
  await expect(dialog.getByTestId('builtin-기억 소자/플립플롭.json')).toContainText('칩 6개');
  await page.screenshot({ path: test.info().outputPath('builtin.png') });
  await adder.getByRole('button', { name: '내 칩에 추가' }).click();

  const imp = page.getByRole('dialog', { name: '가져오기' });
  await expect(imp).toContainText('칩 3개가 들어 있습니다');
  await imp.getByRole('button', { name: '가져오기' }).click();
  await expect(page.getByTestId('chip-item-4비트 가산기(버스)')).toHaveCount(1);
  await expect(page.getByTestId('part-s')).toHaveCount(1);

  // 다시 열면 "이미 있음"
  await actions.getByRole('button', { name: '기본 제공 칩' }).click();
  await expect(page.getByTestId('builtin-연산/가산기.json')).toContainText('이미 있음');
});
