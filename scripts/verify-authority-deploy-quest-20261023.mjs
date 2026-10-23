/**
 * 2026-10-23 回归：战斗内「出牌 / 技能」次数在**战斗结算**时统一入账，且权威战斗链路不再漏计数。
 *
 * 背景：
 *  ① 用户要求这类按次数计的任务在战斗结算时结算，而不是出牌瞬间涨进度；
 *  ② 野外冒险全部走房间权威战斗（PvpAuthorityResourceFinal / PvpAuthoritySyncFinal 的 tryDeployAt），
 *     技能也由服务端结算 —— 之前这两条链路根本没有任务上报点，
 *     主线18「玉米大作战 II（使用 3 次幼小玉米）」/主线33「战斗的艺术（释放 10 次技能）」永远不涨。
 *
 * 本脚本用真实 BattleView 原型链（补丁安装后）验证：
 *  - 权威战斗 3 次出牌：结算前 mq18=0；结算后 3/3；重复结算不重复加；
 *  - 权威技能 1 次：结算前 mq33=0；结算后 1/10；
 *  - 本地（非权威）出牌同样先记账、结算时入账。
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5202, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

try {
  await page.goto('http://127.0.0.1:5202/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, null, { timeout: 120000 });
  await page.waitForTimeout(600);

  const result = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const { authStore } = await import('/src/core/AuthStore.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    const { BattleView } = await import('/src/ui/BattleView.js');
    const { QuestView } = await import('/src/ui/QuestView.js');
    const { QUEST_GROUPS } = await import('/src/data/QuestCatalog.js');
    const { flushQuestBattleEvents } = await import('/src/battle/QuestBattleSettlement20261023.js');
    const app = globalThis.__clbwzAppInstance;
    authStore.user = { id: 'authority-deploy-quest', nickname: '权威出牌测试' };
    setPlayerStorageUser('authority-deploy-quest');

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
    const dispatch = (event, data) => QuestView.dispatch(event, data);
    const settle = (view) => flushQuestBattleEvents(view, { count: 1, won: true }, dispatch);

    function makeView({ cardId = 82, skillId = null, authority = true } = {}) {
      const card = app.db.getById(cardId);
      const view = Object.create(BattleView.prototype);
      Object.assign(view, {
        db: app.db,
        pvp: authority ? { mode: 'pve', team: 'blue' } : null,
        __pvpAuthorityActive: authority,
        pvpSocket: authority ? { async emitAck() { return { snapshot: null }; } } : null,
        renderer: { setHover() {}, requestSprite() {}, requestBullet() {} },
        questBattleStats: { cardIds: new Set(), lanes: new Set() },
        onQuestEvent: dispatch,
        renderHand() {}, renderCardInfo() {}, syncPlaceGridOverlay() {}, renderSkillPanel() {}, syncHud() {},
        lastHandKey: '', lastInfoKey: '', lastSkillKey: '',
        __pvpDeployPending: false,
        __pvpSkillPending: false,
        engine: {
          deck: [{ card, instance: { craftQuality: 2, strengthLv: 0 } }],
          placingActive: true,
          status: 'playing',
          selectedHandIndex: 0,
          cooldowns: [0],
          sunlight: 1000,
          food: 1000,
          heroMp: 999,
          heroMpMax: 999,
          skillLoadout: skillId ? [skillId] : [],
          skills: { cooldowns: skillId ? { [skillId]: 0 } : {}, pendingSkillId: null, cancelTargeting() {} },
          skillTargetCasts: null,
          lastDeployError: null,
          skillTargetError: '',
          selectCard() {},
          cancelPlacing() {},
          getDeployCost() { return { sun: 1, food: 0 }; },
          async deploy() { return true; },
        },
      });
      return view;
    }

    const out = {};

    // ① 权威战斗：3 次出牌 → 结算前不涨，结算后 mq18=3；重复结算不重复加
    writeState({ mainClaimed: mainIds(17), _extra: { questBackfillV13: true } });
    {
      const view = makeView({ cardId: 82 });
      const attempts = [];
      for (let index = 0; index < 3; index += 1) attempts.push(await view.tryDeployAt(null, 2, 3, 0));
      await sleep(80);
      const before = readState();
      const firstFlush = settle(view);
      await sleep(120);
      const after = readState();
      const secondFlush = settle(view);
      await sleep(120);
      const afterSecond = readState();
      out.authorityDeploy = {
        attempts,
        flushed: firstFlush,
        mq18Before: Number(before.mainProgress?.mq18 || 0),
        mq18After: Number(after.mainProgress?.mq18 || 0),
        mq18AfterDuplicateSettlement: Number(afterSecond.mainProgress?.mq18 || 0),
        secondFlush,
      };
      out.authorityDeploy.ok = attempts.every(Boolean)
        && out.authorityDeploy.mq18Before === 0
        && out.authorityDeploy.mq18After === 3
        && out.authorityDeploy.mq18AfterDuplicateSettlement === 3
        && out.authorityDeploy.secondFlush === 0;
    }

    // ② 权威战斗：1 次技能 → 结算后 mq33=1
    writeState({ mainClaimed: mainIds(32), _extra: { questBackfillV13: true } });
    {
      const view = makeView({ skillId: 540 });
      view.tryCastSkillBySlot(0);
      await sleep(220);
      const before = readState();
      const flushed = settle(view);
      await sleep(120);
      const after = readState();
      out.authoritySkill = {
        flushed,
        mq33Before: Number(before.mainProgress?.mq33 || 0),
        mq33After: Number(after.mainProgress?.mq33 || 0),
      };
      out.authoritySkill.ok = out.authoritySkill.mq33Before === 0 && out.authoritySkill.mq33After === 1;
    }

    // ③ 本地（非权威）战斗：出牌同样先记账，结算时入账
    writeState({ mainClaimed: mainIds(17), _extra: { questBackfillV13: true } });
    {
      const view = makeView({ cardId: 82, authority: false });
      const attempts = [];
      for (let index = 0; index < 2; index += 1) attempts.push(await view.tryDeployAt(null, 2, 3, 0));
      const before = readState();
      const flushed = settle(view);
      await sleep(120);
      const after = readState();
      out.localDeploy = {
        attempts,
        flushed,
        mq18Before: Number(before.mainProgress?.mq18 || 0),
        mq18After: Number(after.mainProgress?.mq18 || 0),
      };
      out.localDeploy.ok = attempts.every(Boolean) && out.localDeploy.mq18Before === 0
        && out.localDeploy.mq18After === 2 && out.localDeploy.flushed === 1;
    }

    try { localStorage.removeItem('clbwz_quest_v12'); } catch { /* ignore */ }
    return out;
  });

  assert.ok(result.authorityDeploy.ok, `权威出牌结算失败：${JSON.stringify(result.authorityDeploy)}`);
  assert.ok(result.authoritySkill.ok, `权威技能结算失败：${JSON.stringify(result.authoritySkill)}`);
  assert.ok(result.localDeploy.ok, `本地出牌结算失败：${JSON.stringify(result.localDeploy)}`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log(JSON.stringify({ passed: true, ...result }));
} finally {
  await browser.close();
  await server.close();
}
