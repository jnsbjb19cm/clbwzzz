/**
 * 2026-10-23 任务链路运行时回归（浏览器，自带 vite）：
 *  ① 玩家升级 → 任务系统 _lastPlayerLevel 同步（主线23「升至10级」在解锁后直接 10/10）；
 *  ② 世界地图点「悲伤密林」→ visit_area 事件 → 主线51 进度 +1；
 *  ③ 主线49 完成后「片刻喘息」自动完成（auto 任务链）；
 *  ④ 海底神殿挑战前置修复：mq49 未完成时 cq5~cq9 不可见，完成后可见。
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5198, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

try {
  await page.goto('http://127.0.0.1:5198/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, null, { timeout: 120000 });
  await page.waitForTimeout(600);

  const result = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const { authStore } = await import('/src/core/AuthStore.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    const { QuestView } = await import('/src/ui/QuestView.js');
    const { WorldMapView } = await import('/src/ui/WorldMapView.js');
    const { QUEST_GROUPS } = await import('/src/data/QuestCatalog.js');
    const { visibleQuests } = await import('/src/battle/QuestProgressRules.js');
    const app = globalThis.__clbwzAppInstance;
    authStore.user = { id: 'quest-chain-runtime', nickname: '链路测试' };
    setPlayerStorageUser('quest-chain-runtime');

    const readState = () => JSON.parse(localStorage.getItem('clbwz_quest_v12') || '{}');
    const writeState = (state) => {
      const base = {
        dailyDate: '', weeklyDate: '', dailyProgress: {}, dailyClaimed: [], weeklyProgress: {}, weeklyClaimed: [],
        mainProgress: {}, mainClaimed: [], sideProgress: {}, sideClaimed: [], achievementProgress: {},
        achievementClaimed: [], challengeProgress: {}, challengeClaimed: [], levelClaimed: [],
        _extra: { questBackfillV13: true },
      };
      localStorage.setItem('clbwz_quest_v12', JSON.stringify({ ...base, ...state }));
    };
    const mainIds = (count) => QUEST_GROUPS.main.slice(0, count).map((quest) => quest.id);
    const out = {};

    // ① 等级同步：mq01~mq22 已领，把玩家从 1 级升到 10 级 → mq23 立即 10/10
    writeState({ mainClaimed: mainIds(22) });
    app.player.level = 1;
    app._questLevelReported = 1;
    app.updatePlayerDisplay();
    await sleep(50);
    app.player.level = 10;
    app.updatePlayerDisplay();
    await sleep(100);
    {
      const state = readState();
      const mq23 = QUEST_GROUPS.main[22];
      out.levelSync = {
        lastLevel: state._lastPlayerLevel ?? null,
        mq23: Number(state.mainProgress?.[mq23.id] || 0),
        goal: mq23.goal,
      };
      out.levelSync.ok = out.levelSync.lastLevel === 10 && out.levelSync.mq23 === mq23.goal;
    }

    // ② 悲伤密林入口 → visit_area（mq01~mq49 已领，mq50「片刻喘息」应自动完成，mq51 计数）
    writeState({ mainClaimed: mainIds(49), _extra: { questBackfillV13: true } });
    {
      const root = document.createElement('main');
      document.body.append(root);
      const view = new WorldMapView(app.player, app.db, app.cardInventory, app.inventory, {
        onNavigate() {}, onDepart() {}, onPlayerUpdate() {},
      });
      view.render(root);
      const forestButton = root.querySelector('button[data-map="forest"]');
      out.visitArea = { hasButton: Boolean(forestButton) };
      forestButton?.click();
      await sleep(120);
      const state = readState();
      out.visitArea.areaVisited = Number(state._extra?.areasVisited?.painforest || 0);
      out.visitArea.mq51 = Number(state.mainProgress?.mq51 || 0);
      out.visitArea.mq50 = Number(state.mainProgress?.mq50 || 0); // auto 任务应自动完成
      out.visitArea.ok = out.visitArea.areaVisited === 1 && out.visitArea.mq51 === 1 && out.visitArea.mq50 === 1;
      root.remove();
    }

    // ③④ 挑战前置：mq49 未完成时海底神殿挑战不可见；完成后可见
    const challengeIds = () => {
      const state = readState();
      // 用与面板一致的可见性规则计算
      const fake = { ...state, mainClaimed: [...(state.mainClaimed || [])] };
      return visibleQuests('challenge', fake, QUEST_GROUPS.challenge, QUEST_GROUPS).map((quest) => String(quest.id));
    };
    writeState({ mainClaimed: mainIds(48), _extra: { questBackfillV13: true } });
    const before = challengeIds();
    writeState({ mainClaimed: mainIds(49), _extra: { questBackfillV13: true } });
    const after = challengeIds();
    out.challengeGate = {
      templeBefore: ['cq5', 'cq6', 'cq7', 'cq8', 'cq9'].filter((id) => before.includes(id)),
      templeAfter: ['cq5', 'cq6', 'cq7', 'cq8', 'cq9'].filter((id) => after.includes(id)),
    };
    out.challengeGate.ok = out.challengeGate.templeBefore.length === 0 && out.challengeGate.templeAfter.length === 5;

    // ④ 恢复的「秘境材料」支线 UI：mq53 已领 + 背包已有 60 个巫蛊 → 以毒攻毒 50/50 可领取，详情显示提交 50
    writeState({ mainClaimed: mainIds(53), _extra: { questBackfillV13: true } });
    {
      const originalGetCount = app.inventory.getCount;
      app.inventory.getCount = (itemId) => (Number(itemId) === 53001 ? 60 : 0);
      const root = document.createElement('div');
      document.body.append(root);
      try {
        const view = new QuestView(app.db, app.cardInventory, app.player, { itemDb: app.itemDb, inventory: app.inventory });
        view.category = 'side';
        view.selected.side = 'sq28';
        view.render(root);
        const listText = root.querySelector('#quest-list')?.textContent ?? '';
        const detailText = root.querySelector('#quest-detail')?.textContent ?? '';
        out.materialQuest = {
          inList: listText.includes('以毒攻毒'),
          submitNote: detailText.includes('需要提交') && detailText.includes('多特的巫蛊') && detailText.includes('×50'),
          claimButton: Boolean(root.querySelector('.quest-detail-claim')),
          progress: detailText.includes('50 / 50'),
        };
        out.materialQuest.ok = out.materialQuest.inList && out.materialQuest.submitNote
          && out.materialQuest.claimButton && out.materialQuest.progress;
      } finally {
        app.inventory.getCount = originalGetCount;
        root.remove();
      }
    }

    // 清理测试账号的任务存档，避免污染真实账号
    try { localStorage.removeItem('clbwz_quest_v12'); } catch { /* ignore */ }
    return out;
  });

  assert.ok(result.levelSync.ok, `等级同步失败：${JSON.stringify(result.levelSync)}`);
  assert.ok(result.visitArea.ok, `visit_area / auto 任务失败：${JSON.stringify(result.visitArea)}`);
  assert.ok(result.challengeGate.ok, `海底神殿前置失败：${JSON.stringify(result.challengeGate)}`);
  assert.ok(result.materialQuest.ok, `秘境材料支线 UI 失败：${JSON.stringify(result.materialQuest)}`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log(JSON.stringify({ passed: true, ...result }));
} finally {
  await browser.close();
  await server.close();
}
