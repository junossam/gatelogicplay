import type { Page } from '@playwright/test';
import { serializeWorkspace } from '../../src/model/storage';
import type { Circuit } from '../../src/sim/types';

/** 저장소에 회로를 넣고 새로고침해서 불러온다 */
export async function seed(page: Page, circuit: Circuit, extra: Record<string, string> = {}) {
  await page.goto('/');
  await page.evaluate(
    ([workspace, more]) => {
      localStorage.clear();
      localStorage.setItem('logiclab:v1:workspace', workspace);
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    },
    [serializeWorkspace(circuit), extra] as const,
  );
  await page.reload();
}

/** 내 칩의 ⚙ 설정 메뉴를 열고 항목(편집·분류 바꾸기·삭제)을 고른다 */
export async function chipAction(page: Page, chip: string, item: '편집' | '분류 바꾸기' | '삭제') {
  await page.getByRole('button', { name: `${chip} 설정`, exact: true }).click();
  await page.getByRole('menu', { name: `${chip} 설정` }).getByRole('menuitem', { name: item }).click();
}

/** 푸시 버튼 캡을 누르고 있다가 뗀다 */
export async function pressPush(page: Page, partId: string, holdMs = 600) {
  const box = (await page.getByTestId(`push-${partId}`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}
