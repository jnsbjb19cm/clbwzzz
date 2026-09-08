import { test, expect } from '@playwright/test';

test('real strengthen/decompose views survive stale DB rows and smithy filters plants/monsters', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const [cardModule, itemModule, inventoryModule, smithyModule, layoutModule, guardModule, filterModule, strengthenModule] = await Promise.all([
      import('/src/core/CardDatabase.js'),
      import('/src/core/ItemDatabase.js'),
      import('/src/core/CardInventoryStore.js'),
      import('/src/ui/SmithyView.js'),
      import('/src/ui/SmithyStrengthenLayoutFix20260908.js'),
      import('/src/ui/SmithyMissingCardGuard20260908.js'),
      import('/src/ui/SmithyCardKindFilter20260908.js'),
      import('/src/systems/CardStrengthenSystem.js'),
    ]);
    layoutModule.installSmithyStrengthenLayoutFix20260908();
    guardModule.installSmithyMissingCardGuard20260908();
    filterModule.installSmithyCardKindFilter20260908();

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

    const strengthenSystem = new strengthenModule.CardStrengthenSystem(db);
    const realSlot = cardInventory.getSlots().find((slot) => slot && db.getById(slot.cardId));
    const realCard = realSlot ? db.getById(realSlot.cardId) : null;
    const strengthenPreview = realSlot && realCard
      ? strengthenSystem.canStrengthen(realSlot, realCard)
      : null;
    const previewRates = [0, 1, 2, 14].map((level) => strengthenSystem.getSuccessRate(level));

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
    const visibleMainCount = () => [...root.querySelectorAll('.starup-card-list [data-main-idx]')]
      .filter((button) => !button.hidden).length;
    const allStrengthen = visibleMainCount();
    root.querySelector('.starup-card-list [data-smithy-kind="plant"]')?.click();
    const plantStrengthen = visibleMainCount();
    root.querySelector('.starup-card-list [data-smithy-kind="monster"]')?.click();
    const monsterStrengthen = visibleMainCount();
    root.querySelector('.starup-card-list [data-smithy-kind="all"]')?.click();

    const strengthen = {
      mode: root.querySelector('.classic-smithy-screen')?.getAttribute('data-smithy-mode'),
      info: box('.starup-info'),
      center: box('.starup-center'),
      cards: box('.starup-card-list'),
      buttonText: root.querySelector('#do-star-upgrade')?.textContent?.trim(),
      staleVisible: root.textContent.includes('999999'),
      filters: [...root.querySelectorAll('.starup-card-list [data-smithy-kind]')].map((button) => button.textContent.trim()),
      allStrengthen,
      plantStrengthen,
      monsterStrengthen,
    };

    view.tab = 'craft';
    view.renderBody(root);
    const craftAll = [...root.querySelectorAll('.smithy-card-catalogue .smithy-pick-card[data-id]')].filter((button) => !button.hidden).length;
    root.querySelector('.smithy-card-catalogue [data-smithy-kind="plant"]')?.click();
    const craftPlant = [...root.querySelectorAll('.smithy-card-catalogue .smithy-pick-card[data-id]')].filter((button) => !button.hidden).length;
    const qualityCopy = root.querySelector('.smithy-craft-quality-panel .smithy-meta')?.textContent ?? '';

    view.tab = 'decompose';
    view.renderBody(root);
    const decompose = {
      mode: root.querySelector('.classic-smithy-screen')?.getAttribute('data-smithy-mode'),
      pagePresent: Boolean(root.querySelector('.smithy-decompose-layout')),
      cataloguePresent: Boolean(root.querySelector('.smithy-decompose-layout .smithy-card-catalogue')),
      sidePresent: Boolean(root.querySelector('.smithy-decompose-side')),
      staleVisible: root.textContent.includes('999999'),
    };
    return { strengthen, decompose, strengthenPreview, previewRates, craftAll, craftPlant, qualityCopy };
  });

  expect(result.strengthenPreview?.ok).toBe(true);
  expect(result.previewRates).toEqual([1, 0.45, 0.4, 0.07]);
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
  expect(result.strengthen.filters).toEqual(['全部', '植物', '怪物']);
  expect(result.strengthen.plantStrengthen).toBeGreaterThan(0);
  expect(result.strengthen.monsterStrengthen).toBeGreaterThan(0);
  expect(result.strengthen.allStrengthen).toBeGreaterThanOrEqual(result.strengthen.plantStrengthen + result.strengthen.monsterStrengthen);

  expect(result.craftAll).toBeGreaterThan(0);
  expect(result.craftPlant).toBeGreaterThan(0);
  expect(result.craftPlant).toBeLessThan(result.craftAll);
  expect(result.qualityCopy).toContain('绿·精良');
  expect(result.qualityCopy).toContain('蓝·优秀');

  expect(result.decompose.mode).toBe('decompose');
  expect(result.decompose.pagePresent).toBe(true);
  expect(result.decompose.cataloguePresent).toBe(true);
  expect(result.decompose.sidePresent).toBe(true);
  expect(result.decompose.staleVisible).toBe(false);
});