// 回归验证：用户流程"选战团2 → 进游戏(野外冒险) → 退出 → 打开卡组界面点各个页签"之后，
//   ① 每个页签显示的内容 = 该战团自己的存储内容；
//   ② 四组卡组的内容都不能被改坏（重点是"点页签不能把某组清空/串组"）。
//
// 用户报告："默认加载仍然有问题：我选战团2 进游戏，退出后默认内是上次的卡牌；
//            切走换为战团2，战团2 的卡变成了默认卡组的卡。"
// 根因：卡组界面自己那套聚合草稿（clbwz_room_decks_v4）只有"默认组"会回读按组存档，
// 战团1/2/3 在聚合里是空时界面就以为这组是空的 → 第一次点页签把"空草稿"回写进这一组，
// 玩家的卡组当场被清空。
//
// 用法： 需要 3001 API + vite dev：
//   DATABASE_PATH=server/data/xx.sqlite SERVER_PORT=3001 node server/index.js
//   npx vite --port 5174
//   WEB_BASE=http://127.0.0.1:5174 node scripts/verify-deck-tabs-content-20260912.mjs
import { chromium } from 'playwright';

const API = 'http://127.0.0.1:3001';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);

const user = await (async () => {
  for (let i = 0; i < 5; i += 1) {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `tb_${stamp}${i}`, password: 'e2e-pass-123', nickname: '页签探针' }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (json?.token) return json;
    await sleep(1200);
  }
  throw new Error('注册失败');
})();

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.addInitScript((t) => {
  try {
    sessionStorage.setItem('clbwz_auth_token_v1', t);
    localStorage.setItem('clbwz_new_player_tutorial_completed_v1', '1');
  } catch { /* ignore */ }
}, user.token);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
await page.goto(WEB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 60000 });
await sleep(2500);

const out = await page.evaluate(async () => {
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  const modUrl = (re, fb) => performance.getEntriesByType('resource').map((e) => e.name)
    .filter((n) => re.test(n)).sort((a, b) => b.length - a.length)[0] ?? fb;
  const app = globalThis.__clbwzAppInstance;
  const [cardModule, inventoryModule, deckModule, pref] = await Promise.all([
    import(modUrl(/\/src\/core\/CardDatabase\.js(\?|$)/, '/src/core/CardDatabase.js')),
    import(modUrl(/\/src\/core\/CardInventoryStore\.js(\?|$)/, '/src/core/CardInventoryStore.js')),
    import(modUrl(/\/src\/ui\/DeckSelectView\.js(\?|$)/, '/src/ui/DeckSelectView.js')),
    import(modUrl(/\/src\/ui\/DeckGroupPreference20260911\.js(\?|$)/, '/src/ui/DeckGroupPreference20260911.js')),
  ]);

  const db = new cardModule.CardDatabase();
  const inventory = app.cardInventory ?? new inventoryModule.CardInventoryStore(db);
  if (inventory.getUsedCount() < 12) inventory.grantAllCollectibleCards();
  const usable = inventory.getSlots().map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot && db.getById(slot.cardId)?.battleUsable !== false)
    .slice(0, 12).map(({ index }) => index);
  const groups = {
    default: [usable[0]],
    team1: [usable[1], usable[2]],
    team2: [usable[3], usable[4]],
    team3: [usable[5]],
  };
  for (const [group, sel] of Object.entries(groups)) deckModule.DeckSelectView.saveDeck(sel, inventory, group);
  const cardName = (bagIndex) => db.getById(inventory.getSlots()[bagIndex]?.cardId)?.name ?? '?';

  // —— 写盘日志（带调用栈）——
  const writes = [];
  const originalSave = deckModule.DeckSelectView.saveDeck;
  deckModule.DeckSelectView.saveDeck = function probedSave(selected, inv, group) {
    writes.push({
      via: 'saveDeck', group: group ?? '(未指定)', slots: [...(selected ?? [])],
      stack: String(new Error().stack ?? '').split(String.fromCharCode(10)).slice(2, 4)
        .map((l) => l.trim().replace(/^at /, '').split(' ')[0].slice(0, 55)),
    });
    return originalSave.call(this, selected, inv, group);
  };
  const originalSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    const k = String(key);
    if (/^battle_deck_v2/.test(k)) {
      let slots = null; try { slots = JSON.parse(value); } catch { /* ignore */ }
      writes.push({ via: 'localStorage', group: k === 'battle_deck_v2' ? 'default' : k.replace('battle_deck_v2_', ''), slots });
    }
    return originalSet(key, value);
  };
  const dump = (label) => ({
    label,
    remembered: pref.readRememberedDeckGroup20260911(),
    flag: inventory.__activeDeckGroup20260907 ?? null,
    decks: Object.fromEntries(Object.keys(groups).map((g) => [g, deckModule.DeckSelectView.loadSavedDeck(inventory, db, g)])),
  });
  const points = [];

  // 用户操作：保存并选中战团2
  pref.rememberDeckGroup20260911('team2');
  await sleep2(700);
  points.push(dump('① 选中战团2 后'));
  const startState = points[0];

  // —— 进入野外冒险（联机 PVE 房间）→ 打一场 → 退出 ——
  app.navigate('room', { stageId: 1, autoCreate: true, stageName: '神秘之森' });
  let dl = Date.now() + 20000;
  while (Date.now() < dl) { if (app.views?.room?.room?.mode === 'pve') break; await sleep2(300); }
  await sleep2(1200);
  points.push(dump('② 进房后'));
  document.querySelector('.deck-tab[data-tab="team2"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(500);
  points.push(dump('③ 房间点战团2 后'));
  document.querySelector('#room-ready-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  dl = Date.now() + 25000;
  while (Date.now() < dl) {
    if (app.views?.room?.roomBattleView?.engine || app.views?.battle?.engine) break;
    await sleep2(300);
  }
  await sleep2(2500);
  const inBattle = app.views?.room?.roomBattleView ?? app.views?.battle ?? null;
  const battleInfo = {
    group: inBattle?.pvp?.deckGroup ?? null,
    slots: inBattle?.deckSlots ? [...inBattle.deckSlots] : null,
    slotsNames: (inBattle?.deckSlots ?? []).map(cardName),
  };
  points.push(dump('④ 战斗中'));
  document.querySelector('#pvp-exit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.querySelector('#battle-back')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(3000);
  points.push(dump('⑤ 退出战斗后'));

  // —— 逐个页签对照：界面显示 vs 该组存储 ——
  const readTabs = async (label, rootSel) => {
    const root = document.querySelector(rootSel) ?? document;
    const table = [];
    for (const tab of ['default', 'team1', 'team2', 'team3']) {
      const btn = root.querySelector(`.deck-tab[data-tab="${tab}"]`);
      if (!btn) { table.push({ tab, missing: true }); continue; }
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep2(250);
      const shown = [...root.querySelectorAll('.v3-deck-slot[data-bag-idx]')]
        .map((el) => Number(el.dataset.bagIdx));
      const view = root.querySelector('.game-room')?.__deckSelectView
        ?? globalThis.__clbwzDeckRoomView20260907?.deckSelect
        ?? null;
      table.push({
        tab,
        domActive: root.querySelector('.deck-tab.active')?.dataset.tab ?? null,
        viewTab: view?._deckTab ?? null,
        viewSelected: view?._selected ? [...view._selected] : null,
        shown,
        shownNames: shown.map(cardName),
        stored: deckModule.DeckSelectView.loadSavedDeck(inventory, db, tab),
      });
    }
    return { label, table };
  };

  const afterExitRoom = await readTabs('退出后 · 房间卡组界面', '#lobby-room-inside');

  // 再看单机战斗页里的卡组界面（用户从主城进战斗时看到的就是它）
  app.navigate('battle', { stageId: 1 });
  dl = Date.now() + 15000;
  while (Date.now() < dl) {
    if (app.views?.battle?.phase === 'deck-select') break;
    await sleep2(300);
  }
  await sleep2(1000);
  points.push(dump('⑥ 打开主城卡组选择界面后（还没点任何页签）'));
  const soloTabs = await readTabs('主城进战斗 · 卡组选择界面', '#app');
  points.push(dump('⑦ 逐个点过 4 个页签后'));

  return {
    groups,
    groupNames: Object.fromEntries(Object.entries(groups).map(([g, list]) => [g, list.map(cardName)])),
    battleInfo,
    afterExitRoom,
    soloTabs,
    remembered: pref.readRememberedDeckGroup20260911(),
    flag: inventory.__activeDeckGroup20260907 ?? null,
    resolved: pref.selectedBattleDeck20260912(inventory, db).group,
    points,
    writes,
    startState,
  };
});

console.log('卡组布置（组 → 卡名）:', JSON.stringify(out.groupNames));
console.log('战斗中用的:', JSON.stringify(out.battleInfo));
console.log('记住/标记/解析:', out.remembered, out.flag, out.resolved);
for (const section of [out.afterExitRoom, out.soloTabs]) {
  console.log(`\n【${section.label}】`);
  for (const row of section.table) {
    if (row.missing) { console.log(`  页签=${row.tab}: （没有这个页签）`); continue; }
    const ok = JSON.stringify(row.shown) === JSON.stringify(row.stored);
    console.log(`  页签=${row.tab}${ok ? ' ✅' : ' ❌'} 显示=${JSON.stringify(row.shown)}${JSON.stringify(row.shownNames)} 存储=${JSON.stringify(row.stored)} viewTab=${row.viewTab} viewSelected=${JSON.stringify(row.viewSelected)}`);
  }
}
console.log(String.fromCharCode(10) + '关键时刻快照:');
for (const p of out.points) console.log(`  ${p.label}: 记住=${p.remembered} 标记=${p.flag} 各组=${JSON.stringify(p.decks)}`);
console.log(String.fromCharCode(10) + '写盘记录:');
for (const w of out.writes) {
  console.log(`  - [${w.via}] group=${w.group} slots=${JSON.stringify(w.slots)}${w.stack ? '  ← ' + w.stack.join(' | ') : ''}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const failures = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : String.fromCharCode(10) + '       ' + detail}`);
  if (!ok) failures.push(name);
};

const startState = out.startState;
const endState = out.points.at(-1);
console.log('页面错误:', errors.length ? errors.slice(0, 3) : '无');

check('① 每个页签显示的内容 = 它自己那组的存储',
  (out.soloTabs?.table ?? []).every((row) => row.missing || eq(row.shown, row.stored)),
  JSON.stringify(out.soloTabs?.table));

const before = startState?.decks ?? {};
const after = endState?.decks ?? {};
for (const group of ['default', 'team1', 'team2', 'team3']) {
  check(`② 点过所有页签后，${group} 的卡组没被改坏（${JSON.stringify(before[group])}）`,
    eq(before[group], after[group]), `变成 ${JSON.stringify(after[group])}`);
}
check('③ 战斗中用的就是选中的战团2（不是默认组）',
  out.battleInfo?.group === 'team2' && eq(out.battleInfo?.slots, out.groups.team2),
  JSON.stringify(out.battleInfo));
check('④ 没有任何一笔写盘把"本来有牌的组"写成空',
  (out.writes ?? []).every((w) => {
    if (w.via !== 'saveDeck' && w.via !== 'localStorage') return true;
    const had = (out.groups?.[w.group] ?? []).length;
    return !(had > 0 && Array.isArray(w.slots) && w.slots.length === 0);
  }),
  JSON.stringify((out.writes ?? []).filter((w) => (out.groups?.[w.group] ?? []).length > 0 && (w.slots ?? []).length === 0)));

console.log(failures.length ? `${String.fromCharCode(10)}${failures.length} 项未通过` : String.fromCharCode(10) + '全部通过');
await browser.close();
process.exit(failures.length ? 1 : 0);
