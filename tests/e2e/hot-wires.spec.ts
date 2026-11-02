import { expect, test } from '@playwright/test';
import { CircuitBuilder } from '../fixtures/circuits';
import { seed } from './helpers';

test('값이 1인 전선은 위층에 한 번 더 그려져 겹친 0 전선보다 위에 보인다', async ({ page }) => {
  // a(1)와 b(0)의 전선이 같은 길로 겹치게: 둘 다 같은 줄의 게이트로
  const c = new CircuitBuilder()
    .add('SWITCH', 'a', 0, 2, 'A')
    .add('SWITCH', 'b', 0, 4, 'B')
    .add('AND', 'g', 10, 2)
    .wire('a.y', 'g.a')
    .wire('b.y', 'g.b')
    .build();
  await seed(page, c);
  const hotA = page.getByTestId('hotwire-w1');
  const hotB = page.getByTestId('hotwire-w2');
  // 가로 직선은 높이가 0이라 toBeVisible 대신 display로 본다
  await expect(hotA).toHaveCSS('display', 'none');
  const box = (await page.getByTestId('part-a').locator('.part-hit').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
  await expect(page.getByTestId('wire-w1')).toHaveAttribute('data-value', '1');
  await expect(hotA).toHaveAttribute('data-value', '1');
  await expect(hotA).not.toHaveCSS('display', 'none');
  await expect(hotB).toHaveCSS('display', 'none');
  // 위층은 모든 아래층 전선보다 뒤(위)에 있다
  const order = await page.evaluate(() => {
    const base = document.querySelector('[data-testid="wire-w2"]')!;
    const hot = document.querySelector('[data-testid="hotwire-w1"]')!;
    return base.compareDocumentPosition(hot) & Node.DOCUMENT_POSITION_FOLLOWING ? 'hot-after' : 'hot-before';
  });
  expect(order).toBe('hot-after');
  // 클릭은 아래층이 받는다 (전선 선택)
  await expect(hotA).toHaveCSS('pointer-events', 'none');
});
