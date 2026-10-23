/**
 * 2026-10-23 任务领奖客户端链路回归（自带 vite，不依赖外部 dev server）：
 *  ① 领奖请求在途时切到别的分类，返回后仍只把「原分类」的任务记成已领取；
 *  ② 服务端返回 409「已领取」时，本地同步成已领取、金币不变、领奖按钮消失、后续任务解锁；
 *  ③ 请求 body 带对 category / questId / period。
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5199, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

try {
  await page.goto('http://127.0.0.1:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, null, { timeout: 120000 });
  await page.waitForTimeout(600);

  const result = await page.evaluate(async () => {
    const { authStore } = await import('/src/core/AuthStore.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    const { QuestView } = await import('/src/ui/QuestView.js');
    const { QUEST_GROUPS } = await import('/src/data/QuestCatalog.js');
    const { questPeriodKey } = await import('/src/data/QuestPeriods.js');
    const app = globalThis.__clbwzAppInstance;
    authStore.user = { id: 'quest-claim-client', nickname: '领奖测试' };
    setPlayerStorageUser('quest-claim-client');
    localStorage.removeItem('clbwz_quest_v12');
    const readSaved = () => JSON.parse(localStorage.getItem('clbwz_quest_v12') || '{}');
    const out = {};

    // ① 领奖请求在途时切换分类
    {
      const player = { level: 50, exp: 0, gold: 0, gem: 0, honor: 0 };
      const view = new QuestView(app.db, app.cardInventory, player, { onPlayerUpdate() {} });
      view.category = 'daily';
      const entry = QUEST_GROUPS.daily[0];
      view.state.dailyProgress[entry.id] = entry.goal;
      localStorage.setItem('clbwz_quest_v12', JSON.stringify(view.state));
      const root = document.createElement('div');
      document.body.append(root);
      view.render(root);
      let release;
      let request = null;
      authStore.api.post = (path, body) => { request = { path, body }; return new Promise((resolve) => { release = resolve; }); };
      const pending = view.claim(root, entry);
      view.category = 'main';
      view.renderContent(root);
      release({ profile: { level: 50, exp: 0, gold: 10, diamond: 0, honor: 0, arena: 0 }, items: [], cardInventory: {} });
      await pending;
      const saved = readSaved();
      out.delayed = {
        dailyClaimed: (saved.dailyClaimed || []).includes(entry.id),
        mainClaimed: (saved.mainClaimed || []).includes('mq01'),
        gold: player.gold,
        request,
        expectedPeriod: questPeriodKey('daily'),
      };
      out.delayed.ok = out.delayed.dailyClaimed === true && out.delayed.mainClaimed === false
        && out.delayed.gold === 10 && request?.body?.category === 'daily' && request?.body?.questId === entry.id;
      root.remove();
    }

    // ② 服务端 409 已领取：本地同步、金币不变、后续任务解锁
    {
      localStorage.removeItem('clbwz_quest_v12');
      const player = { level: 50, exp: 0, gold: 50, gem: 0, honor: 0 };
      const view = new QuestView(app.db, app.cardInventory, player, { onPlayerUpdate() {} });
      view.category = 'main';
      const first = QUEST_GROUPS.main[0];
      const second = QUEST_GROUPS.main[1];
      view.state.mainClaimed = [first.id];
      view.state.mainProgress = { [second.id]: second.goal };
      localStorage.setItem('clbwz_quest_v12', JSON.stringify(view.state));
      const root = document.createElement('div');
      document.body.append(root);
      view.render(root);
      authStore.api.post = async () => { throw Object.assign(new Error('该任务奖励已经领取'), { status: 409, data: { alreadyClaimed: true } }); };
      await view.claim(root, second);
      const saved = readSaved();
      out.conflict = {
        claimed: (saved.mainClaimed || []).includes(second.id),
        gold: player.gold,
        canClaimAgain: Boolean(root.querySelector('.quest-detail-claim')),
        nextUnlocked: view.entries().some((entry) => entry.requires === second.id),
      };
      out.conflict.ok = out.conflict.claimed === true && out.conflict.gold === 50
        && out.conflict.canClaimAgain === false && out.conflict.nextUnlocked === true;
      root.remove();
      localStorage.removeItem('clbwz_quest_v12');
    }
    return out;
  });

  assert.ok(result.delayed.ok, `延迟返回分类持久化失败：${JSON.stringify(result.delayed)}`);
  assert.ok(result.conflict.ok, `409 已领取同步失败：${JSON.stringify(result.conflict)}`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log(JSON.stringify({ passed: true, ...result }));
} finally {
  await browser.close();
  await server.close();
}
