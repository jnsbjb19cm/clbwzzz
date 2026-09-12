// 复现/回归：房间里编辑"战团1"时，页签被错误地拉回"默认卡组"，并把战团1覆盖掉。
// 用法： node scripts/verify-deck-tab-jump-20260912.mjs   （需要 vite dev server，默认 5173）
//
// 探针重点：把每一次 DeckSelectView.saveDeck(sel, inv, group) 的 group + 卡槽 + 调用栈都打出来，
// 这样"哪个组被谁写坏"一目了然。
import { chromium } from 'playwright';

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.addInitScript(() => {
  try {
    sessionStorage.setItem('clbwz_auth_token_v1', 'playwright-local-ui-token');
    localStorage.setItem('clbwz_new_player_tutorial_completed_v1', '1');
  } catch { /* ignore */ }
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.text().includes('[DEBUG-decktabs]')) console.log('  页面日志:', m.text()); });
await page.goto(WEB, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 60000 });
await sleep(2000);

const out = await page.evaluate(async () => {
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  const modUrl = (re, fb) => performance.getEntriesByType('resource').map((e) => e.name)
    .filter((n) => re.test(n)).sort((a, b) => b.length - a.length)[0] ?? fb;
  const [cardModule, inventoryModule, deckModule, groupModule] = await Promise.all([
    import(modUrl(/\/src\/core\/CardDatabase\.js(\?|$)/, '/src/core/CardDatabase.js')),
    import(modUrl(/\/src\/core\/CardInventoryStore\.js(\?|$)/, '/src/core/CardInventoryStore.js')),
    import(modUrl(/\/src\/ui\/DeckSelectView\.js(\?|$)/, '/src/ui/DeckSelectView.js')),
    import(modUrl(/\/src\/ui\/DeckGroupSelection20260906\.js(\?|$)/, '/src/ui/DeckGroupSelection20260906.js')),
  ]);

  const db = new cardModule.CardDatabase();
  const inventory = new inventoryModule.CardInventoryStore(db);
  if (inventory.getUsedCount() < 10) inventory.grantAllCollectibleCards();
  const usable = inventory.getSlots()
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot && db.getById(slot.cardId)?.battleUsable !== false)
    .slice(0, 10)
    .map(({ index }) => index);
  if (usable.length < 10) throw new Error('fixture 需要至少 10 张可用卡');

  const groups = {
    default: [usable[0]],
    team1: [usable[1], usable[2]],
    team2: [usable[3], usable[4]],
    team3: [usable[5], usable[6], usable[7]],
  };
  for (const [group, selected] of Object.entries(groups)) {
    deckModule.DeckSelectView.saveDeck(selected, inventory, group);
  }

  // —— 探针 A：localStorage 级别（能抓到任何函数引用里发出的写盘）——
  const storageWrites = [];
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    const k = String(key);
    if (/^battle_deck_v2/.test(k)) {
      let slots = null;
      try { slots = JSON.parse(value); } catch { /* ignore */ }
      storageWrites.push({ key: k, slots });
    }
    return originalSetItem(key, value);
  };

  // —— 探针 B：记录每一次 DeckSelectView.saveDeck（带调用栈）——
  const writes = [];
  const originalSaveDeck = deckModule.DeckSelectView.saveDeck;
  deckModule.DeckSelectView.saveDeck = function probedSaveDeck(selected, cardInventory, group) {
    const stack = String(new Error().stack ?? '').split('\n').slice(1, 5)
      .map((line) => line.trim().replace(/^at /, '').slice(0, 90));
    writes.push({ group: group ?? '(未指定)', slots: [...(selected ?? [])], stack });
    return originalSaveDeck.call(this, selected, cardInventory, group);
  };

  const roomState = (selectedDeckNo) => ({
    roomId: 8008,
    myUserId: 1,
    stageName: '回归房间',
    members: [{ userId: 1, nickname: '测试玩家', team: 'blue', isHost: true, ready: false, selectedDeckNo }],
    selectedDeckNo,
    onReady: () => {},
    onSetDeck: () => Promise.resolve(null),
    onSetRule: () => Promise.resolve(null),
    onRandomMatch: () => Promise.resolve(null),
    onChangeMap: () => Promise.resolve(null),
    onSwitch: () => Promise.resolve(null),
    onStart: () => {},
  });

  let view = null;
  let root = null;
  const snapshot = (label) => {
    const active = root?.querySelector('.deck-tab.active')?.dataset.tab ?? null;
    return {
      label,
      deckTab: view?._deckTab ?? null,
      domActiveTab: active,
      selected: [...(view?._selected ?? [])],
      selectedNames: (view?._selected ?? []).map((index) => view?._bagSlots?.[index]?.cardId ?? null),
      activeGroupFlag: view?._cardInventory?.__activeDeckGroup20260907 ?? null,
    };
  };

  const renderRoom = (deckNo) => {
    if (!root) {
      document.body.innerHTML = '<div id="deck-root"></div>';
      root = document.querySelector('#deck-root');
      view = new deckModule.DeckSelectView();
    }
    view.render(root, {
      db, cardInventory: inventory, mode: 'pvp', isOwner: true, roomState: roomState(deckNo),
    });
    return snapshot(`render(selectedDeckNo=${deckNo})`);
  };

  const steps = [];
  // ① 进房时房间选中的是战团1
  steps.push(renderRoom(1));
  // ② 用户手动点"战团1"页签
  const tabBtn = root.querySelector('.deck-tab[data-tab="team1"]');
  tabBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(150);
  steps.push(snapshot('用户点击 team1 页签'));
  // ③ 房间刷新（轮询/广播都会重新 render 一次）
  steps.push(renderRoom(1));
  // ④ 点"保存"
  const saveBtn = [...root.querySelectorAll('button')].find((b) => /保存/.test(b.textContent ?? ''));
  saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(400);

  // ⑧ 用户报告的另一半：房间里按"开始/准备"时，写盘用哪个组？
  //    必须和界面上高亮的战团一致，否则就会把别组的卡写进战团1（"给我战团1覆盖了"）。
  renderRoom(1);
  const beforeConfirm = snapshot('点开始前');
  writes.length = 0;
  storageWrites.length = 0;
  const readyBtn2 = root.querySelector('#room-ready-btn');
  const readyInfo = { found: Boolean(readyBtn2), text: readyBtn2?.textContent?.trim()?.slice(0, 20) ?? null, bagSlots: (view._bagSlots ?? []).filter(Boolean).length };
  readyBtn2?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(400);
  const confirmWrite = writes.at(-1) ?? null;

  // ⑦ 2026-09-11 的行为不能回退：房间成员还没选战团（selectedDeckNo=null）时，
  //    用"玩家上次保存的战团"兜底（离开房间再回来，战团2/3 不能被抹掉）。
  await import(modUrl(/\/src\/ui\/DeckGroupPreference20260911\.js(\?|$)/, '/src/ui/DeckGroupPreference20260911.js'))
    .then((m) => m.rememberDeckGroup20260911('team2'));
  const rememberedFallback = renderRoom(null);

  const stored = Object.fromEntries(['default', 'team1', 'team2', 'team3'].map((group) => [
    group, deckModule.DeckSelectView.loadSavedDeck(inventory, db, group),
  ]));

  deckModule.DeckSelectView.saveDeck = originalSaveDeck;
  return {
    groups,
    steps,
    writes,
    rememberedFallback,
    beforeConfirm,
    readyInfo,
    confirmWrite,
    confirmStorageWrite: storageWrites.at(-1) ?? null,
    stored,
    savedDeckName: saveBtn?.id ?? saveBtn?.className ?? null,
    tabLabels: [...root.querySelectorAll('.deck-tab')].map((b) => `${b.dataset.tab}${b.classList.contains('active') ? '*' : ''}`),
  };
});

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const failures = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       ${detail}`}`);
  if (!ok) failures.push(name);
};

console.log('步骤快照：');
for (const step of out.steps) {
  console.log(`  - ${step.label}: 页签=${step.deckTab} DOM高亮=${step.domActiveTab} 卡槽=${JSON.stringify(step.selected)} 组标记=${step.activeGroupFlag}`);
}
console.log('写盘记录：');
for (const write of out.writes) {
  console.log(`  - group=${write.group} 卡槽=${JSON.stringify(write.slots)}\n      ${write.stack.join(' | ')}`);
}
console.log('保存后本地存储：', JSON.stringify(out.stored));
console.log('页签渲染：', out.tabLabels.join(' '));

const [renderStep, clickStep, refreshStep] = out.steps;
check('① 进房时页签 = 房间选中的 team1', renderStep?.deckTab === 'team1', JSON.stringify(renderStep));
check('② 点击 team1 页签后仍是 team1', clickStep?.deckTab === 'team1', JSON.stringify(clickStep));
check('③ 房间重新渲染后页签不能被拉回 default', refreshStep?.deckTab !== 'default', JSON.stringify(refreshStep));
check('④ 保存后战团1 仍是它自己的卡组（没被默认卡组覆盖）',
  eq(out.stored.team1, out.groups.team1), `team1=${JSON.stringify(out.stored.team1)} 期望=${JSON.stringify(out.groups.team1)}`);
check('⑤ 默认卡组也没被战团1 覆盖',
  eq(out.stored.default, out.groups.default), `default=${JSON.stringify(out.stored.default)} 期望=${JSON.stringify(out.groups.default)}`);
check('⑥ 战团2/3 不受影响',
  eq(out.stored.team2, out.groups.team2) && eq(out.stored.team3, out.groups.team3),
  `team2=${JSON.stringify(out.stored.team2)} team3=${JSON.stringify(out.stored.team3)}`);
check('⑦ 房间没给选择时，仍用"记住的战团"兜底（09-11 行为不回退）',
  out.rememberedFallback?.deckTab === 'team2', JSON.stringify(out.rememberedFallback));
console.log('开始按钮信息：', JSON.stringify(out.readyInfo ?? null));
console.log('开始按钮写盘：', JSON.stringify(out.confirmStorageWrite));
check('⑧ 开始/准备不会把当前这套卡写进别的战团（写盘只允许是当前页签）',
  out.confirmStorageWrite == null || out.confirmStorageWrite.key === 'battle_deck_v2_team1',
  `写入=${JSON.stringify(out.confirmStorageWrite)} 界面高亮=${out.beforeConfirm?.domActiveTab}`);

check('无页面报错', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
await browser.close();
process.exit(failures.length ? 1 : 0);
