import { test, expect } from '@playwright/test';

test('strengthen workbench stays between info and right card picker', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const rects = await page.evaluate(async () => {
    const { installSmithyStrengthenLayoutFix20260908 } = await import('/src/ui/SmithyStrengthenLayoutFix20260908.js');
    installSmithyStrengthenLayoutFix20260908();
    document.body.innerHTML = `
      <div style="width:1120px;margin:0 auto">
        <section class="classic-smithy-screen" data-smithy-mode="strengthen">
          <div class="starup-layout">
            <aside class="smithy-panel starup-info">强化信息</aside>
            <main class="smithy-panel starup-center">中央强化台</main>
            <aside class="smithy-panel starup-card-list"><div class="starup-scroll">右侧选卡</div></aside>
          </div>
        </section>
      </div>`;
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    };
    return {
      info: box('.starup-info'),
      center: box('.starup-center'),
      cards: box('.starup-card-list'),
    };
  });

  expect(rects.info.right).toBeLessThanOrEqual(rects.center.left + 1);
  expect(rects.center.right).toBeLessThanOrEqual(rects.cards.left + 1);
  expect(rects.center.width).toBeGreaterThan(300);
  expect(rects.cards.width).toBeGreaterThan(260);
});
