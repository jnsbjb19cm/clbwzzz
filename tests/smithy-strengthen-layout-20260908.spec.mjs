import { test, expect } from '@playwright/test';

test('real strengthen/decompose views survive stale DB card rows and keep strengthen layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const [cardModule, itemModule, inventoryModule, smithyModule, layoutModule, guardModule] = await Promise.all([
      import('/src/core/CardDatabase.js'),
      import('/src/core/ItemDatabase.js'),
      import('/src/core/CardInventoryStore.js'),
      import('/src/ui/SmithyView.js'),
      import('/src/ui/SmithyStrengthenLayoutFix20260908.js'),
      import('/src/ui/SmithyMissingCardGuard20260908.js'),
    ]);
    layoutModule.installSmithyStrengthenLayoutFix20260908();
    guardModule.installSmithyMissingCardGuard20260908();

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

    // Reproduce the user's actual crash shape: the server/local inventory contains an
    // old card id that no longer exists in CardDatabase. Previously card.name threw in
    // strengthen and decompose and the entire center UI vanished.
    const staleIndex = Math.min(199, cardInventory.state.slots.length - 1);
    cardInventory.state.slots[staleIndex] = {
      cardId: 999999,
      star: 0,
      strengthLv: 0,
      craftQuality: 1,
      bound: true,
      powderSpent: {},
    };

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
    const strengthen = {
      mode: root.querySelector('.classic-smithy-screen')?.getAttribute('data-smithy-mode'),
      info: box('.starup-info'),
      center: box('.starup-center'),
      cards: box('.starup-card-list'),
      buttonText: root.querySelector('#do-star-upgrade')?.textContent?.trim(),
      staleVisible: root.textContent.includes('999999'),
    };

    view.tab = 'decompose';
    view.renderBody(root);
    const decompose = {
      mode: root.querySelector('.classic-smithy-screen')?.getAttribute('data-smithy-mode'),
      pagePresent: Boolean(root.querySelector('.smithy-decompose-layout')),
      cataloguePresent: Boolean(root.querySelector('.smithy-decompose-layout .smithy-card-catalogue')),
      sidePresent: Boolean(root.querySelector('.smithy-decompose-side')),
      staleVisible: root.textContent.includes('999999'),
    };
    return { strengthen, decompose };
  });

  expect(result.strengthen.mode).toBe('strengthen');
  expect(result.strengthen.info).not.toBeNull();
  expect(result.strengthen.center).not.toBeNull();
  expect(result.strengthen.cards).not.toBeNull();
  expect(result.strengthen.buttonText).toBe('开始升星');
  expect(result.strengthen.staleVisible).toBe(false);
  expect(result.strengthen.info.right).toBeLessThanOrEqual(result.strengthen.center.left + 1);
  expect(result.strengthen.center.right).toBeLessThanOrEqual(result.strengthen.cards.left + 1);
  expect(result.strengthen.center.width).toBeGreaterThan(300);
  expect(result.strengthen.cards.width).toBeGreaterThan(260);

  expect(result.decompose.mode).toBe('decompose');
  expect(result.decompose.pagePresent).toBe(true);
  expect(result.decompose.cataloguePresent).toBe(true);
  expect(result.decompose.sidePresent).toBe(true);
  expect(result.decompose.staleVisible).toBe(false);
});
