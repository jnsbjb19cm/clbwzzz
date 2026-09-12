// 回归验证：PVP 房间「重进后选另一个战团开打」必须用选中的那套卡组，且不能把选中战团覆盖成默认卡组。
//
// 现象（用户报告 2026-09-12）：
//   战团 a(默认,1号卡)/b(战团1,2号卡)/c(战团2,3号卡)/d(战团3,4号卡) 各有一套卡。
//   选了 a 开打 → 退出房间 → 再进战斗准备房间选 b（界面确实显示 b 的卡组）→
//   进入战斗却是 a 的 1 号卡；再退出重进，连战团 b 的卡槽都变成了 a 的 1 号卡。
//
// 根因（两条叠加）：
//   1) PvpWildernessRoomFinal.enterPvpBattle 用自己那份 _pvpDeckTab/_pvpDeckSlots
//      （当前房间界面已改回 DeckSelectView，"只接管 PVP 战斗场地"，这两个字段根本没人写），
//      于是 activeTab 永远落到 'default'，战斗拿的永远是默认组的卡；
//   2) PvpBattleBridgeFinal.enterPvpBattle 调 DeckSelectView.saveDeck(deckSlots, ci) 时
//      没带组，saveDeck 按"当前选中组"（战团1）落盘 → 默认组的卡被写进战团1（本地+账号）。
//
// 用法： node scripts/verify-pvp-deck-group-20260912.mjs
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
      last = new Error(JSON.stringify(json).slice(0, 140));
    } catch (error) { last = error; }
    await sleep(1200);
  }
  throw last;
}

const browser = await chromium.launch({ channel: 'chrome' })
  .catch(() => chromium.launch({ channel: 'msedge' }))
  .catch(() => chromium.launch());

try {
  const user = await register('pvpdeck', 'PVP卡组');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('clbwz_auth_token_v1', t); } catch {} }, user.token);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 60000 });
  await sleep(2000);

  await page.evaluate(async () => {
    // 注意：vite dev + HMR 会给"被改过的模块"带 ?t= 查询串，直接 import('/src/ui/DeckSelectView.js')
    // 会拿到另一个（未打补丁的）模块实例。这里按页面实际加载过的 URL 取模块，保证和应用同一实例。
    const modUrl = (pattern, fallback) => performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => pattern.test(name))
      .sort((a, b) => b.length - a.length)[0] ?? fallback;
    globalThis.__deckModUrl = modUrl;
    const { authStore } = await import(modUrl(/\/src\/core\/AuthStore\.js(\?|$)/, '/src/core/AuthStore.js'));
    globalThis.__pvpDeckCheck = {
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      app: () => globalThis.__clbwzAppInstance,
      authStore,
      deckSelect: async () => import(modUrl(/\/src\/ui\/DeckSelectView\.js(\?|$)/, '/src/ui/DeckSelectView.js')),
      cardIds: (indices) => {
        const slots = globalThis.__clbwzAppInstance?.cardInventory?.getSlots?.() ?? [];
        return (indices ?? []).map((i) => Number(slots[Number(i)]?.cardId) || null);
      },
      shown: () => {
        const v = globalThis.__clbwzAppInstance?.views?.room;
        return globalThis.__pvpDeckCheck.cardIds(v?.deckSelect?._selected);
      },
      // 本地按组存档（battle_deck_v2 / battle_deck_v2_teamN）里的卡号
      localGroup: (key) => {
        try {
          const raw = JSON.parse(localStorage.getItem(key) || 'null');
          return Array.isArray(raw) ? raw.map((e) => Number(e?.cardId ?? e) || null) : null;
        } catch { return null; }
      },
      // 账号（服务端）某组卡组的卡号
      accountGroup: (deckNo) => {
        const decks = globalThis.__pvpDeckCheck.authStore?.snapshot?.decks ?? [];
        const deck = decks.find((d) => Number(d?.deckNo ?? d?.deck_no) === Number(deckNo));
        return Array.isArray(deck?.cards) ? deck.cards.map((e) => Number(e?.cardId ?? e) || null) : null;
      },
      clickTab: async (tab) => {
        document.querySelector(`.deck-tab[data-tab="${tab}"]`)?.click();
        await globalThis.__pvpDeckCheck.sleep(1800);
      },
      enterRoom: async () => {
        const app = globalThis.__clbwzAppInstance;
        app.navigate('room');
        await globalThis.__pvpDeckCheck.sleep(1200);
        document.querySelector('#lobby-create')?.click();
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          const room = app.views?.room?.room;
          if (room?.status === 'waiting' && room?.mode === 'pvp') break;
          await globalThis.__pvpDeckCheck.sleep(300);
        }
        await globalThis.__pvpDeckCheck.sleep(2500);
        return Boolean(app.views?.room?.room);
      },
      leaveToMain: async () => {
        const app = globalThis.__clbwzAppInstance;
        try { await app.views?.room?.socket?.leaveRoom?.(); } catch {}
        app.navigate('main');
        await globalThis.__pvpDeckCheck.sleep(1500);
      },
      startBattle: async () => {
        const app = globalThis.__clbwzAppInstance;
        document.querySelector('#room-ready-btn')?.click();
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          if (app.views?.room?.roomBattleView) break;
          await globalThis.__pvpDeckCheck.sleep(300);
        }
        await globalThis.__pvpDeckCheck.sleep(3000);
        const battle = app.views?.room?.roomBattleView ?? null;
        return {
          deck: globalThis.__pvpDeckCheck.cardIds(battle?.deckSlots),
          engineDeck: (battle?.engine?.deck ?? []).map((e) => Number(e?.card?.id ?? e?.cardId) || null),
        };
      },
      exitBattle: async () => {
        const app = globalThis.__clbwzAppInstance;
        const view = app.views?.room;
        view?.roomBattleView?.destroy?.();
        if (view) view.roomBattleView = null;
        document.querySelector('#pvp-exit-ov')?.click();
        await globalThis.__pvpDeckCheck.sleep(1500);
      },
    };
  });

  // ① 4 个战团各放一张不同的卡：默认=1号，战团1=2号，战团2=3号，战团3=4号
  const fixture = await page.evaluate(async () => {
    const app = globalThis.__clbwzAppInstance;
    const inv = app.cardInventory;
    if (inv.getUsedCount() < 8) {
      inv.grantAllCollectibleCards();
      await globalThis.__pvpDeckCheck.sleep(3000);
    }
    const { DeckSelectView } = await globalThis.__pvpDeckCheck.deckSelect();
    const slots = inv.getSlots();
    const usable = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s && app.db.getById(s.cardId)?.battleUsable !== false)
      .slice(0, 4)
      .map(({ i }) => i);
    const groups = { default: [usable[0]], team1: [usable[1]], team2: [usable[2]], team3: [usable[3]] };
    for (const [group, selection] of Object.entries(groups)) DeckSelectView.saveDeck(selection, inv, group);
    await globalThis.__pvpDeckCheck.sleep(2500);
    return {
      cards: Object.fromEntries(Object.entries(groups).map(([g, sel]) => [g, sel.map((i) => Number(slots[i]?.cardId))])),
    };
  });
  const CARD_A = fixture.cards.default[0];
  const CARD_B = fixture.cards.team1[0];
  console.log(`夹具：默认组(a)=${CARD_A}号卡，战团1(b)=${CARD_B}号卡，战团2=${fixture.cards.team2[0]}号卡，战团3=${fixture.cards.team3[0]}号卡`);
  check('夹具：4 个战团的卡各不相同', () => {
    assert.equal(new Set(Object.values(fixture.cards).map((v) => v[0])).size, 4, '夹具本身就有重复卡号');
  });

  // ② 进房选 a(默认) 开打，再退出 —— 制造"上一局用的是 a"
  const roomA = await page.evaluate(() => globalThis.__pvpDeckCheck.enterRoom());
  check('能进入 PVP 房间', () => assert.equal(roomA, true, '没有进入 PVP 房间'));
  await page.evaluate(() => globalThis.__pvpDeckCheck.clickTab('default'));
  const battleA = await page.evaluate(() => globalThis.__pvpDeckCheck.startBattle());
  check('用 a(默认) 开打时战斗卡槽确实是 a 的卡', () => {
    assert.deepEqual(battleA.deck, [CARD_A], `战斗卡槽=${JSON.stringify(battleA.deck)}`);
  });
  await page.evaluate(() => globalThis.__pvpDeckCheck.exitBattle());
  await page.evaluate(() => globalThis.__pvpDeckCheck.leaveToMain());

  // ③ 重进房间 → 选 b(战团1)：界面必须显示 b，开打必须用 b
  await page.evaluate(() => globalThis.__pvpDeckCheck.enterRoom());
  await page.evaluate(() => globalThis.__pvpDeckCheck.clickTab('team1'));
  const roomSide = await page.evaluate(() => ({
    tab: globalThis.__clbwzAppInstance?.views?.room?.deckSelect?._deckTab ?? null,
    shown: globalThis.__pvpDeckCheck.shown(),
  }));
  console.log(`重进房间选战团1：页签=${roomSide.tab} 界面卡槽=${JSON.stringify(roomSide.shown)}`);
  check('重进房间选战团1：界面显示的是战团1 自己的卡', () => {
    assert.equal(roomSide.tab, 'team1', `页签=${roomSide.tab}`);
    assert.deepEqual(roomSide.shown, [CARD_B], `界面卡槽=${JSON.stringify(roomSide.shown)}`);
  });

  const battleB = await page.evaluate(() => globalThis.__pvpDeckCheck.startBattle());
  console.log(`战团1 开打：战斗卡槽=${JSON.stringify(battleB.deck)} 引擎卡组=${JSON.stringify(battleB.engineDeck)}`);
  check('用 b(战团1) 开打时战斗卡槽用的是 b 的卡（原来是 a）', () => {
    assert.deepEqual(battleB.deck, [CARD_B], `战斗卡槽=${JSON.stringify(battleB.deck)}，应为 b 的 [${CARD_B}]`);
    assert.deepEqual(battleB.engineDeck, [CARD_B], `引擎卡组=${JSON.stringify(battleB.engineDeck)}`);
  });

  const afterBattle = await page.evaluate(() => ({
    localTeam1: globalThis.__pvpDeckCheck.localGroup('battle_deck_v2_team1'),
    localDefault: globalThis.__pvpDeckCheck.localGroup('battle_deck_v2'),
    accountTeam1: globalThis.__pvpDeckCheck.accountGroup(1),
    accountDefault: globalThis.__pvpDeckCheck.accountGroup(0),
  }));
  console.log(`开打后存档：本地战团1=${JSON.stringify(afterBattle.localTeam1)} 本地默认=${JSON.stringify(afterBattle.localDefault)} 账号战团1=${JSON.stringify(afterBattle.accountTeam1)} 账号默认=${JSON.stringify(afterBattle.accountDefault)}`);
  check('开打不会把战团1 的存档覆盖成默认组（本地）', () => {
    assert.deepEqual(afterBattle.localTeam1, [CARD_B], `本地战团1=${JSON.stringify(afterBattle.localTeam1)}`);
  });
  check('开打不会把战团1 的存档覆盖成默认组（账号）', () => {
    assert.deepEqual(afterBattle.accountTeam1, [CARD_B], `账号战团1=${JSON.stringify(afterBattle.accountTeam1)}`);
  });
  check('默认组也没被战团1 顶替', () => {
    assert.deepEqual(afterBattle.localDefault, [CARD_A], `本地默认=${JSON.stringify(afterBattle.localDefault)}`);
    assert.deepEqual(afterBattle.accountDefault, [CARD_A], `账号默认=${JSON.stringify(afterBattle.accountDefault)}`);
  });

  // ④ 再退出重进 → 战团1 仍然是自己那套（用户报告的"b 全变成 a 的 1 号卡"）
  await page.evaluate(() => globalThis.__pvpDeckCheck.exitBattle());
  await page.evaluate(() => globalThis.__pvpDeckCheck.leaveToMain());
  await page.evaluate(() => globalThis.__pvpDeckCheck.enterRoom());
  await page.evaluate(() => globalThis.__pvpDeckCheck.clickTab('team1'));
  const reentry = await page.evaluate(() => ({
    shown: globalThis.__pvpDeckCheck.shown(),
    localTeam1: globalThis.__pvpDeckCheck.localGroup('battle_deck_v2_team1'),
  }));
  console.log(`再次重进战团1：界面卡槽=${JSON.stringify(reentry.shown)} 本地存档=${JSON.stringify(reentry.localTeam1)}`);
  check('再次重进后战团1 仍是自己的卡（没有被默认组污染）', () => {
    assert.deepEqual(reentry.shown, [CARD_B], `界面卡槽=${JSON.stringify(reentry.shown)}`);
    assert.deepEqual(reentry.localTeam1, [CARD_B], `本地战团1=${JSON.stringify(reentry.localTeam1)}`);
  });

  check('过程中没有页面报错', () => assert.equal(errors.length, 0, errors.slice(0, 2).join(' | ')));
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
