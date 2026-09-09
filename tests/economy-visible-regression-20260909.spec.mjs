import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/fixture-icons', route => route.fulfill({ contentType: 'text/html', body: '<div id="app"></div>' }));
  await page.goto('/fixture-icons');
});

test('auction and guild render real art without a database', async ({ page }) => {
  await page.evaluate(async () => {
    const { AuctionView } = await import('/src/ui/AuctionView.js');
    const { GuildView } = await import('/src/ui/GuildView.js');
    const { installAuctionGridPatch } = await import('/src/ui/AuctionGridPatch.js');
    const { installGuildWarehouseGridPatch } = await import('/src/ui/GuildWarehouseGridPatch.js');
    installAuctionGridPatch(); installGuildWarehouseGridPatch();
    document.body.innerHTML = '<div id="auction"></div><div id="guild"><div id="guild-detail"></div></div>';
    const items = [2,3,10001,10002,10003,10004,10005,30055,50011].map(itemId => ({ itemId, count: 3 }));
    const api = { get: async () => ({ items, listings: [{ itemId: 10005, count: 1, status: 'active' }] }) };
    const auction = new AuctionView(); auction.api = api; await auction.render(document.querySelector('#auction'));
    const guild = new GuildView(); guild.api = api; guild.root = document.querySelector('#guild'); await guild.showWarehouse(1);
  });
  await expect(page.locator('.fallback-icon')).toHaveCount(0);
  await expect(page.locator('#auction-grid-bag [data-item-icon]')).toHaveCount(9);
  await expect(page.locator('#guild-my-item-grid [data-item-icon]')).toHaveCount(9);
  const loaded = await page.locator('[data-item-icon]').evaluateAll(async nodes => Promise.all(nodes.map(async node => {
    const img = node.querySelector('img');
    if (img) { await img.decode(); return img.naturalWidth > 0; }
    const url = getComputedStyle(node.querySelector('[data-item-art]') ?? node).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (!url) return false;
    const art = new Image(); art.src = url; await art.decode(); return art.naturalWidth > 0;
  })));
  expect(loaded.every(Boolean)).toBe(true);
  await page.screenshot({ path: 'test-results/economy-icons.png' });
});

test('claimable quests sort first automatically and rewards have art', async ({ page }) => {
  await page.evaluate(async () => {
    const { QuestView } = await import('/src/ui/QuestView.js');
    const { ItemDatabase } = await import('/src/core/ItemDatabase.js');
    const { installQuestPinPersistence20260908 } = await import('/src/ui/QuestPinPersistence20260908.js');
    installQuestPinPersistence20260908();
    localStorage.setItem('clbwz_quest_v5', JSON.stringify({ sideProgress: { s4: 30 }, sideClaimed: [] }));
    const view = new QuestView(null, null, { level: 10 }, { itemDb: new ItemDatabase() });
    view.category = 'side'; view.render(document.querySelector('#app')); window.questFixture = view;
  });
  await expect(page.locator('.quest-list-item').first()).toHaveAttribute('data-entry', 's4');
  await expect(page.locator('.quest-pin-toggle-20260908')).toHaveCount(0);
  await page.evaluate(async () => {
    const { QuestView } = await import('/src/ui/QuestView.js');
    QuestView.dispatch('battle_complete'); QuestView.dispatch('battle_complete');
  });
  await expect(page.locator('.quest-list-item').first()).toHaveAttribute('data-entry', 's1');
  await page.locator('.quest-list-item[data-entry="s1"]').click();
  await expect(page.locator('.quest-detail-rewards [data-item-icon="10001"]')).toHaveCount(1);
  await page.locator('[data-category="level"]').click();
  await page.locator('.quest-list-item[data-entry="lv10"]').click();
  await expect(page.locator('.quest-detail-rewards')).toContainText('随机5级卡蛋');
});
