import { test, expect } from '@playwright/test';

test('real strengthen view keeps workbench between info and right card picker', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const [cardModule, itemModule, inventoryModule, smithyModule, layoutModule] = await Promise.all([
      import('/src/core/CardDatabase.js'),
      import('/src/core/ItemDatabase.js'),
      import('/src/core/CardInventoryStore.js'),
      import('/src/ui/SmithyView.js'),
      import('/src/ui/SmithyStrengthenLayoutFix20260908.js'),
    ]);
    layoutModule.installSmithyStrengthenLayoutFix20260908();

    document.body.innerHTML = `
      <section class="city-modal-overlay" style="display:block;position:relative;width:100%;height:100%">
        <div class="city-modal-window" style="position:relative;margin:0 auto">
          <div id="smithy-fixture" class="city-modal-content"></div>
        </div>
      </section>`;

    const db = new cardModule.CardDatabase();
    const itemDb = new itemModule.ItemDatabase();
    const inventory = new itemModule.InventoryStore(itemDb);
    const cardInventory = new inventoryModule.CardInventoryStore(db);
    if (cardInventory.getUsedCount() === 0) cardInventory.grantAllCollectibleCards();
    const view = new smithyModule.SmithyView(
      db,
      itemDb,
      inventory,
      cardInventory,
      { level: 1, exp: 0, hp: 1000, gold: 20000, gem: 50, honor: 120, arena: 80 },
      { initialTab: 'strengthen' },
    );
    const root = document.querySelector('#smithy-fixture');
    view.render(root);

    const box = (selector) => {
      const rect = root.querySelector(selector)?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width } : null;
    };
    return {
      mode: root.querySelector('.classic-smithy-screen')?.getAttribute('data-smithy-mode'),
      info: box('.starup-info'),
      center: box('.starup-center'),
      cards: box('.starup-card-list'),
      buttonText: root.querySelector('#do-star-upgrade')?.textContent?.trim(),
    };
  });

  expect(result.mode).toBe('strengthen');
  expect(result.info).not.toBeNull();
  expect(result.center).not.toBeNull();
  expect(result.cards).not.toBeNull();
  expect(result.buttonText).toBe('开始升星');
  expect(result.info.right).toBeLessThanOrEqual(result.center.left + 1);
  expect(result.center.right).toBeLessThanOrEqual(result.cards.left + 1);
  expect(result.center.width).toBeGreaterThan(300);
  expect(result.cards.width).toBeGreaterThan(260);
});
