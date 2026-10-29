import { expect, test, type Page } from '@playwright/test';
import { serializeBundle, serializeLibrary } from '../../src/model/storage';
import { harness, nestedLibrary, register4Chip, srLatch } from '../fixtures/circuits';
import { pressPush, seed } from './helpers';

const LIB_KEY = 'logiclab:v1:library';

async function seedRegister(page: Page) {
  await seed(page, harness(register4Chip(), 'reg'), { [LIB_KEY]: serializeLibrary(nestedLibrary()) });
  await page.getByLabel('시뮬레이션 속도').fill('60');
}

async function toggle(page: Page, id: string) {
  const box = (await page.getByTestId(`part-${id}`).locator('.part-hit').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
}

async function setSwitch(page: Page, id: string, v: 0 | 1) {
  const part = page.getByTestId(`part-${id}`);
  if ((await part.getAttribute('data-value')) !== String(v)) await toggle(page, id);
  await expect(part).toHaveAttribute('data-value', String(v));
}

async function clockPulse(page: Page) {
  await setSwitch(page, 'in_CLK', 1);
  await page.waitForTimeout(700);
  await setSwitch(page, 'in_CLK', 0);
  await page.waitForTimeout(700);
}

async function outputs(page: Page) {
  return Promise.all([0, 1, 2, 3].map((i) => page.getByTestId(`part-out_Q${i}`).getAttribute('data-value')));
}

/** 두 핀 사이 전선의 가운데를 클릭 (수평 전선은 bbox 높이가 0이라 locator.click을 못 쓴다) */
async function clickWireBetween(page: Page, from: string, to: string) {
  const a = (await page.locator(`[data-pin="${from}"]`).boundingBox())!;
  const b = (await page.locator(`[data-pin="${to}"]`).boundingBox())!;
  await page.mouse.click((a.x + a.width / 2 + b.x + b.width / 2) / 2, a.y + a.height / 2);
}

test('4단계 완료 기준: SR 래치 → D 플립플롭 → 4비트 레지스터 중첩 동작, 래치 수정이 레지스터에 반영', async ({ page }) => {
  // 클럭을 여러 번 기다리는 긴 테스트 (병렬 실행 중에는 30초를 넘길 수 있다)
  test.setTimeout(60_000);
  await seedRegister(page);

  for (const [i, v] of ([1, 0, 1, 1] as const).entries()) await setSwitch(page, `in_D${i}`, v);
  await clockPulse(page);
  await expect.poll(() => outputs(page)).toEqual(['1', '0', '1', '1']);

  // 클럭 없이 D를 바꾸면 유지
  await setSwitch(page, 'in_D1', 1);
  await page.waitForTimeout(500);
  await expect.poll(() => outputs(page)).toEqual(['1', '0', '1', '1']);

  // 팔레트에서 SR 래치를 열어 Q 출력 전선을 끊고 저장 (사용하는 칩에도 반영)
  await page.getByRole('button', { name: 'SR 래치 편집' }).click();
  await expect(page.getByRole('navigation', { name: '이동 경로' })).toContainText('SR 래치');
  await clickWireBetween(page, 'not1:y', 'q:a');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('save-status')).toHaveText('칩 변경 사항 저장 안 됨');
  await page.keyboard.press('Control+s');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: '사용하는 칩에도 변경 사항 반영' })).toBeChecked();
  await expect(dialog).toContainText('D 래치');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '닫기' }).click();

  // 레지스터에 반영: 1을 써도 출력은 0
  for (const i of [0, 1, 2, 3]) await setSwitch(page, `in_D${i}`, 1);
  await clockPulse(page);
  await expect.poll(() => outputs(page)).toEqual(['0', '0', '0', '0']);
});

test('칩을 더블클릭하면 내부로 들어가 실제 값을 보고, Esc로 한 단계씩 나온다', async ({ page }) => {
  await seedRegister(page);
  await setSwitch(page, 'in_D0', 1);
  await clockPulse(page);
  await expect(page.getByTestId('part-out_Q0')).toHaveAttribute('data-value', '1');

  await page.getByTestId('part-reg').locator('.part-hit').dblclick();
  const crumbs = page.getByRole('navigation', { name: '이동 경로' });
  await expect(crumbs).toContainText('4비트 레지스터');
  await expect(page.getByTestId('view-banner')).toContainText('읽기 전용');
  // 칩 안쪽 LED는 실제 신호 값
  await expect(page.getByTestId('part-q0')).toHaveAttribute('data-value', '1');
  await expect(page.getByTestId('part-q1')).toHaveAttribute('data-value', '0');

  await page.getByTestId('part-dff0').locator('.part-hit').dblclick();
  await expect(crumbs).toContainText('D 플립플롭');
  await expect(page.getByTestId('part-q')).toHaveAttribute('data-value', '1');

  // 읽기 전용: Delete로 지울 수 없다
  await page.getByTestId('part-master').locator('.part-hit').click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('part-master')).toHaveCount(1);

  await page.keyboard.press('Escape'); // 선택 해제
  await page.keyboard.press('Escape'); // 한 단계 위로
  await expect(crumbs).not.toContainText('D 플립플롭');
  await expect(crumbs).toContainText('4비트 레지스터');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('part-reg')).toBeVisible();
  await expect(page.getByTestId('view-banner')).toHaveCount(0);
});

test('칩으로 저장: 이름·색·핀 미리보기·요약을 거쳐 내 칩에 추가', async ({ page }) => {
  await seed(page, srLatch());
  await page.getByRole('button', { name: '칩으로 저장' }).click();
  const dialog = page.getByRole('dialog', { name: '칩으로 저장' });
  await expect(dialog.getByRole('img', { name: /미리보기/ })).toContainText('Q̄');
  await expect(dialog).toContainText('있음 (순차 회로)');
  await expect(dialog.getByTestId('save-truth-summary')).toContainText('금지 상태 포함');

  // 이름은 필수
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('이름을 입력하세요');

  await dialog.getByLabel('칩 이름').fill('내 래치');
  await dialog.getByRole('radio', { name: '보라' }).check();
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('chip-item-내 래치')).toContainText('2→2');

  // 같은 이름은 저장할 수 없다
  await page.getByRole('button', { name: '칩으로 저장' }).click();
  await page.getByLabel('칩 이름').fill('내 래치');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('같은 이름');
});

test('Ctrl+G: 선택 범위를 칩으로 만들면 경계 신호가 핀이 되고 동작은 그대로', async ({ page }) => {
  await seed(page, srLatch());
  await page.getByTestId('part-or1').locator('.part-hit').click({ position: { x: 40, y: 70 } });
  for (const id of ['or2', 'not1', 'not2']) {
    await page.keyboard.down('Shift');
    await page.getByTestId(`part-${id}`).locator('.part-hit').click({ position: { x: 30, y: 6 } });
    await page.keyboard.up('Shift');
  }
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('chip-item-새 칩')).toContainText('2→2');
  const chip = page.getByTestId('part-chip1');
  await expect(chip).toContainText('R');
  await expect(chip).toContainText('Q̄');
  await expect(page.getByTestId('part-or1')).toHaveCount(0);

  await pressPush(page, 's');
  await expect(page.getByTestId('part-q')).toHaveAttribute('data-value', '1');
  await pressPush(page, 'r');
  await expect(page.getByTestId('part-q')).toHaveAttribute('data-value', '0');
  await expect(page.getByTestId('part-qn')).toHaveAttribute('data-value', '1');

  // 실행 취소하면 원래 회로로
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('part-or1')).toHaveCount(1);
});

test('순환 참조 방지: 칩 A를 편집하는 동안 A와 A를 포함하는 칩은 넣을 수 없다', async ({ page }) => {
  await seedRegister(page);
  await page.getByRole('button', { name: 'SR 래치 편집' }).click();
  await expect(page.getByTestId('chip-item-SR 래치').locator('.chip-button')).toBeDisabled();
  await expect(page.getByTestId('chip-item-D 래치').locator('.chip-button')).toBeDisabled();
  await expect(page.getByTestId('chip-item-4비트 레지스터').locator('.chip-button')).toBeDisabled();
  // 래치를 편집하는 중이라도 래치를 쓰지 않는 칩은 없다 → 모두 비활성. 레지스터를 열면 래치는 넣을 수 있다
  await page.getByRole('button', { name: '닫기' }).click();
  await page.getByRole('button', { name: '4비트 레지스터 편집' }).click();
  await expect(page.getByTestId('chip-item-SR 래치').locator('.chip-button')).toBeEnabled();
  await expect(page.getByTestId('chip-item-4비트 레지스터').locator('.chip-button')).toBeDisabled();
});

test('쓰는 곳이 있는 칩은 삭제를 막고 목록을 보여준다', async ({ page }) => {
  await seedRegister(page);
  await page.getByRole('button', { name: 'SR 래치 삭제' }).click();
  const dialog = page.getByRole('dialog', { name: '삭제할 수 없습니다' });
  await expect(dialog).toContainText('D 래치');
  await dialog.getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('chip-item-SR 래치')).toHaveCount(1);
});

test('내보내기는 의존하는 칩을 모두 담고, 가져오기는 잘못된 파일을 거부하고 충돌 시 선택지를 준다', async ({ page }) => {
  await seedRegister(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '내보내기' }).click()]);
  const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
  const exported = JSON.parse(text);
  expect(exported.format).toBe('logiclab');
  expect(Object.values(exported.library).map((d) => (d as { name: string }).name).sort()).toEqual(['4비트 레지스터', 'D 래치', 'D 플립플롭', 'SR 래치'].sort());

  const file = page.getByTestId('import-file');
  await file.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"logiclab","version":1,"library":{"x":{"id":"x"}}}') });
  await expect(page.getByRole('dialog', { name: '가져올 수 없는 파일' })).toContainText('library.x');
  await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();

  const lib = nestedLibrary();
  const changed = { ...lib['chip-sr']!, name: 'SR 래치 수정본', revision: 5 };
  await file.setInputFiles({
    name: 'chips.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBundle({ 'chip-sr': changed }, { parts: [], wires: [] }, null)),
  });
  const dialog = page.getByRole('dialog', { name: '가져오기' });
  await expect(dialog.getByTestId('import-conflicts')).toContainText('SR 래치');
  await dialog.getByRole('radio', { name: /복사본으로 저장/ }).check();
  await dialog.getByRole('button', { name: '가져오기' }).click();
  await expect(page.getByTestId('chip-item-SR 래치')).toHaveCount(1);
  await expect(page.getByTestId('chip-item-SR 래치 수정본')).toHaveCount(1);
});

test('칩과 편집 중인 칩은 새로고침 후에도 남는다', async ({ page }) => {
  await seed(page, srLatch());
  await page.getByRole('button', { name: '칩으로 저장' }).click();
  await page.getByLabel('칩 이름').fill('래치');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: '래치 편집' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('저장됨');
  await page.reload();
  await expect(page.getByTestId('chip-item-래치')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: '이동 경로' })).toContainText('래치');
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('part-or1')).toHaveCount(1);
});

test('전선이 없는 LED는 칩 출력 핀에서 기본으로 빠진다 (켜면 다시 포함)', async ({ page }) => {
  const c = srLatch();
  c.parts.push({ id: 'led9', kind: { type: 'primitive', kind: 'LED' }, x: 80, y: -3, label: 'Y1' });
  await seed(page, c);
  await page.getByRole('button', { name: '칩으로 저장' }).click();
  const dialog = page.getByRole('dialog', { name: '칩으로 저장' });
  const y1 = dialog.getByTestId('pin-field-led9');
  await expect(y1).toContainText('연결 안 됨');
  await expect(y1.getByRole('checkbox')).not.toBeChecked();
  await expect(dialog.getByRole('img', { name: /미리보기/ })).not.toContainText('Y1');

  await y1.getByRole('checkbox').check();
  await expect(dialog.getByRole('img', { name: /미리보기/ })).toContainText('Y1');
  await y1.getByRole('checkbox').uncheck();

  await dialog.getByLabel('칩 이름').fill('JK 연습');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByTestId('chip-item-JK 연습')).toContainText('2→2');
});
