import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { CircuitBuilder } from '../fixtures/circuits';
import { menuAction, seed } from './helpers';

test('상단 메뉴바: 파일·편집·시뮬레이션·도구 메뉴와 핵심 버튼만 남은 헤더', async ({ page }) => {
  await seed(page, new CircuitBuilder().add('SWITCH', 's', 0, 0, 'A').add('NOT', 'n', 5, 0).wire('s.y', 'n.a').build());
  const bar = page.getByRole('menubar');
  await expect(bar.getByRole('menuitem')).toHaveText(['파일', '편집', '시뮬레이션', '도구']);
  // 헤더 버튼: 실행 조작, 실행 취소/다시 실행, 가져오기/내보내기, 칩으로 저장
  const header = page.locator('.header');
  for (const name of ['가져오기', '내보내기', '칩으로 저장', '공유', '실행 취소', '다시 실행', '한 틱 진행', '초기화']) {
    await expect(header.getByRole('button', { name, exact: true })).toBeVisible();
  }
  for (const name of ['챌린지', '진리표', '예제', '설정']) await expect(header.getByRole('button', { name, exact: true })).toHaveCount(0);

  // 마우스로 열고, 다른 메뉴 이름에 올리면 그 메뉴로 바뀐다
  await bar.getByRole('menuitem', { name: '파일' }).click();
  const file = page.getByRole('menu', { name: '파일' });
  await expect(file.getByRole('menuitem')).toHaveText(['가져오기', '내보내기', '내 칩 모두 내보내기', '예제', '공유 링크', '작업 공간 비우기', '모두 초기화 (내 칩까지)']);
  await bar.getByRole('menuitem', { name: '도구' }).hover();
  await expect(page.getByRole('menu', { name: '도구' })).toBeVisible();
  await expect(file).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('menubar.png') });

  // 바깥을 누르면 닫힌다
  await page.locator('.canvas-area').click({ position: { x: 400, y: 300 } });
  await expect(page.getByRole('menu')).toHaveCount(0);

  // 키보드: Enter로 열면 첫 항목에 포커스, ↓·→·Esc
  await bar.getByRole('menuitem', { name: '파일' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: '파일' }).getByRole('menuitem', { name: '가져오기' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: '파일' }).getByRole('menuitem', { name: '내보내기', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  // 선택한 것이 없으면 선택 삭제는 비활성
  await expect(page.getByRole('menu', { name: '편집' }).getByRole('menuitem', { name: '선택 삭제' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu', { name: '시뮬레이션' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(bar.getByRole('menuitem', { name: '시뮬레이션' })).toBeFocused();

  // 메뉴 항목 실행: 일시정지 → 실행 버튼 표시가 바뀜
  await menuAction(page, '시뮬레이션', '일시정지');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', '실행');

  // 편집 메뉴로 선택 삭제
  await page.getByTestId('part-n').locator('.part-hit').click({ position: { x: 40, y: 10 } });
  await menuAction(page, '편집', '선택 삭제');
  await expect(page.getByTestId('part-n')).toHaveCount(0);
});

test('파일 메뉴 가져오기는 파일 선택 창을 연다', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), menuAction(page, '파일', '가져오기')]);
  await chooser.setFiles(resolve('samples/연산/4비트 가산기.json'));
  await expect(page.getByRole('dialog', { name: '가져오기' })).toContainText('칩 3개');
});
