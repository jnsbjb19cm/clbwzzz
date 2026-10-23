// 回归验证：野外冒险(PVE)联机战斗必须能推进任务。
//
// 背景：BattleView 打完一局会通过 onQuestEvent 上报「通关/战斗完成/击杀数/时长/零伤亡」，
// 单机路径由 App 接上；而野外冒险联机的战斗是在 AdventureCoopBridge20260911 里
// 自己 new BattleView 的，之前没传 onQuestEvent —— 于是联机打完一局，
// 任务进度（累计冒险/战斗/击杀/金币）一点都不动。
//
// 用法： node scripts/verify-coop-pve-quest-events.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

async function register(prefix, nickname) {
  let last = null;
  for (let i = 0; i < 6; i += 1) {
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: `${prefix}_${stamp}${i}`, password: 'e2e-pass-123', nickname }),
      });
      const json = await res.json();
      if (json?.token) return json;
      last = new Error(JSON.stringify(json).slice(0, 120));
    } catch (error) { last = error; }
    await sleep(1200);
  }
  throw last;
}

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ mode: 'msedge' }).catch(() => chromium.launch()));

try {
  const user = await register('coopq', '冒险测试');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('clbwz_auth_token_v1', t); } catch {} }, user.token);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 60000 });
  await sleep(1500);

  // 进入野外冒险(PVE)联机房间并开始
  const entered = await page.evaluate(async () => {
    const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
    const app = globalThis.__clbwzAppInstance;
    app.navigate('room', { stageId: 1, autoCreate: true, stageName: '第1关' });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const room = app.views?.room;
      if (room?.room?.mode === 'pve') {
        await room.socket.startGame().catch(() => {});
        return { roomId: room.room.id, mode: room.room.mode };
      }
      await sleep2(400);
    }
    return { roomId: null, mode: app.views?.room?.room?.mode ?? null };
  });
  console.log(`PVE 房间：${JSON.stringify(entered)}`);
  check('进入的是 PVE 联机房间', () => assert.equal(entered.mode, 'pve', `mode=${entered.mode}`));

  // 等协作战斗视图建立
  const battle = await page.evaluate(async () => {
    const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
    const app = globalThis.__clbwzAppInstance;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const view = app.views?.room?.roomBattleView;
      if (view?.pvp?.mode === 'pve') {
        return {
          ready: true,
          hasQuestHook: typeof view.onQuestEvent === 'function',
          authority: Boolean(view.__pvpAuthorityActive),
        };
      }
      await sleep2(500);
    }
    return { ready: false, hasQuestHook: false, authority: false };
  });
  console.log(`协作战斗视图：${JSON.stringify(battle)}`);
  check('进入了服务端权威协作战斗', () => assert.equal(battle.ready, true, '没拿到 PVE 协作战斗视图'));
  check('协作战斗接上了任务事件回调 onQuestEvent（本次修复点）', () => {
    assert.equal(battle.hasQuestHook, true, 'onQuestEvent 未接上，任务不会推进');
  });

  // 通过真实回调派发一次"战斗完成"，任务计数必须 +1
  const questDelta = await page.evaluate(async () => {
    const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
    // 任务存储按账号隔离（clbwz_quest_v12#u<id>），这里找当前版本号最大的那份。
    const questKey = () => Object.keys(localStorage)
      .filter((key) => /^clbwz_quest_v\d+(#u.+)?$/.test(key))
      .sort((a, b) => Number(b.match(/_v(\d+)/)?.[1] || 0) - Number(a.match(/_v(\d+)/)?.[1] || 0))[0] ?? null;
    const readExtra = () => {
      try {
        const key = questKey();
        return (key && JSON.parse(localStorage.getItem(key))?._extra) || {};
      } catch { return {}; }
    };
    const view = globalThis.__clbwzAppInstance.views?.room?.roomBattleView;
    const before = readExtra();
    const beforeBattles = Number(before.totalBattles) || 0;
    if (typeof view?.onQuestEvent === 'function') {
      view.onQuestEvent('battle_complete', { count: 1 });
      view.onQuestEvent('kill_enemy', { count: 3 });
    }
    await sleep2(400);
    const after = readExtra();
    return {
      beforeBattles,
      afterBattles: Number(after.totalBattles) || 0,
      beforeKills: Number(before.totalKills) || 0,
      afterKills: Number(after.totalKills) || 0,
      key: questKey(),
    };
  });
  console.log(`任务计数：${JSON.stringify(questDelta)}`);
  check('战斗完成事件让任务计数 +1', () => {
    assert.equal(
      questDelta.afterBattles,
      questDelta.beforeBattles + 1,
      `totalBattles ${questDelta.beforeBattles} → ${questDelta.afterBattles}`,
    );
  });
  check('击杀事件让任务击杀数 +3', () => {
    assert.equal(
      questDelta.afterKills,
      questDelta.beforeKills + 3,
      `totalKills ${questDelta.beforeKills} → ${questDelta.afterKills}`,
    );
  });

  check('过程中没有页面报错', () => assert.equal(errors.length, 0, errors.slice(0, 2).join(' | ')));
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
