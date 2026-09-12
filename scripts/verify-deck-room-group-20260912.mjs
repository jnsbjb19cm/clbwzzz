// 回归验证：房间里的"战团"必须自洽 ——
//   ① 进房时页签 = 房间成员当前选中的战团（不能被"上次记住的战团"劫持）
//   ② 点战团页签 → 房间成员的 selectedDeckNo 立即跟着变
//   ③ 确认保存 → 存的是这个战团自己的卡
//   ④ 房间刷新/重渲染 → 页签和卡组都不许跳走（用户报告：编辑战团1 跳到别的战团、战团1 被覆盖）
//
// 用法： node scripts/verify-deck-room-group-20260912.mjs   （需要 vite dev，默认 5173）
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
await page.goto(WEB, { waitUntil: 'domcontentloaded' });
// 等 app 启动 + 异步补丁装完（半装状态下测出来的结论是假的）
await page.waitForFunction(() => Boolean(globalThis[Symbol.for('clbwz.roomDeckRefreshRegressionFix20260907')]), null, { timeout: 60000 });
await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 60000 });
await sleep(2500);

const out = await page.evaluate(async () => {
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  // 必须用 app 真正加载的那份模块（vite HMR 会带 ?t=，裸路径 import 会拿到未打补丁的新副本）
  const modUrl = (re, fb) => performance.getEntriesByType('resource').map((e) => e.name)
    .filter((n) => re.test(n)).sort((a, b) => b.length - a.length)[0] ?? fb;
  const { DeckSelectView } = await import(modUrl(/\/src\/ui\/DeckSelectView\.js(\?|$)/, '/src/ui/DeckSelectView.js'));
  const { CardDatabase } = await import(modUrl(/\/src\/core\/CardDatabase\.js(\?|$)/, '/src/core/CardDatabase.js'));
  const { authStore } = await import(modUrl(/\/src\/core\/AuthStore\.js(\?|$)/, '/src/core/AuthStore.js'));
  const { RoomView } = await import(modUrl(/\/src\/ui\/RoomView\.js(\?|$)/, '/src/ui/RoomView.js'));
  const pref = await import(modUrl(/\/src\/ui\/DeckGroupPreference20260911\.js(\?|$)/, '/src/ui/DeckGroupPreference20260911.js'));

  localStorage.clear();
  const db = new CardDatabase();
  const slots = [1, 2, 3, 4, 5].map((cardId) => ({ cardId, craftQuality: 1, strengthLv: 0 }));
  const inventory = { cardDb: db, getSlots: () => slots };
  authStore.token = 'fixture';
  authStore.user = { id: 7001 };
  authStore.snapshot = { profile: { userId: 7001 }, decks: [0, 1, 2, 3].map((deckNo) => ({ deckNo, cards: [] })) };
  const requests = [];
  const apiPut = authStore.api.put;
  authStore.api.put = async (path, body) => { requests.push({ path, body }); return body; };

  // 先按"4 个战团各有一套不同卡组"布置
  const groups = { default: [0], team1: [1, 2], team2: [3], team3: [4] };
  for (const [group, sel] of Object.entries(groups)) DeckSelectView.saveDeck(sel, inventory, group);

  // 复现条件：玩家上次记住的是"战团2"
  pref.rememberDeckGroup20260911('team2');

  const root = document.getElementById('app');
  root.innerHTML = '<div class="lobby-stage"><div id="lobby-room-inside"></div></div>';
  const owner = new RoomView(db, { cardInventory: inventory });
  owner.root = root;
  // 房间成员当前选中的是"默认卡组"（0）—— 进房页签必须是它，不能被记住的战团2 劫持
  owner.room = { id: 1, name: '测试房间', mode: 'pvp', mapId: '2', members: [{ userId: 7001, nickname: '测试', team: 'blue', isHost: true, selectedDeckNo: 0 }] };
  const setDeckCalls = [];
  owner.socket = {
    setDeck: (deckNo) => {
      setDeckCalls.push(deckNo);
      owner.room.members[0].selectedDeckNo = deckNo;
      return Promise.resolve(structuredClone(owner.room));
    },
    changeMap: () => Promise.resolve(null),
    setReady: () => Promise.resolve(null),
  };
  if (owner.deckSelect) owner.deckSelect = null; // 让 renderRoomInside 重建（构造时没有 roomState）
  owner.renderRoomInside();
  const view = owner.deckSelect;

  const snap = (label) => ({
    label,
    deckTab: view?._deckTab ?? null,
    domActive: root.querySelector('.deck-tab.active')?.dataset.tab ?? null,
    selected: [...(view?._selected ?? [])],
    memberDeckNo: owner.room.members[0].selectedDeckNo,
    setDeckCalls: [...setDeckCalls],
  });

  const steps = [];
  steps.push(snap('进房渲染后'));
  root.querySelector('.deck-tab[data-tab="team1"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(200);
  steps.push(snap('点 team1 页签'));
  root.querySelector('#swap-card-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  root.querySelector('#drawer-cards .drawer-card[data-idx="3"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  steps.push(snap('放入 slot3'));
  root.querySelector('[data-v3-action="confirm"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(400);
  steps.push(snap('点确认'));
  // 房间刷新（轮询/广播都会重渲染）
  owner.renderRoomInside();
  await sleep2(400);
  steps.push(snap('房间刷新后'));

  // ⑨ 用户报告：在房间里切到某个战团后，房间再来一次渲染就"跳回别的战团 / 显示默认卡组的牌"。
  //    这里把房间成员值故意改回 0（默认），模拟"房间那边的值不是玩家刚点的那个"，
  //    再渲染一次 —— 玩家点过的战团2 必须保住。
  root.querySelector('.deck-tab[data-tab="team2"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(300);
  owner.room.members[0].selectedDeckNo = 0;
  owner.renderRoomInside();
  await sleep2(400);
  steps.push(snap('房间成员值被改回默认后再次渲染'));

  authStore.api.put = apiPut;
  return {
    groups,
    steps,
    stored: Object.fromEntries(['default', 'team1', 'team2', 'team3'].map((g) => [g, DeckSelectView.loadSavedDeck(inventory, db, g)])),
    deckWrites: requests.filter((r) => /\/player\/decks\//.test(r.path)),
  };
});

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const failures = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       ${detail}`}`);
  if (!ok) failures.push(name);
};

console.log('步骤快照：');
for (const s of out.steps) {
  console.log(`  - ${s.label}: 页签=${s.deckTab} DOM高亮=${s.domActive} 卡槽=${JSON.stringify(s.selected)} 房间选组=${s.memberDeckNo} setDeck=${JSON.stringify(s.setDeckCalls)}`);
}
console.log('本地存储：', JSON.stringify(out.stored));

const [entry, clickTab, editSlot, confirm, refresh, refresh2] = out.steps;
check('① 进房页签 = 房间选中的战团（默认），不被"记住的战团2"劫持',
  entry?.deckTab === 'default' && entry?.domActive === 'default', JSON.stringify(entry));
check('② 点 team1 后，房间成员的 selectedDeckNo 同步成 1',
  clickTab?.deckTab === 'team1' && clickTab?.memberDeckNo === 1 && clickTab?.setDeckCalls?.includes(1),
  JSON.stringify(clickTab));
check('③ 编辑后确认：写的是战团1 自己的卡（不是默认卡组）',
  eq(out.stored.team1, [3]), `team1=${JSON.stringify(out.stored.team1)} 期望 [3]`);
check('④ 确认后房间选组仍是 1（刷新不会把页签拉走）',
  confirm?.memberDeckNo === 1 && confirm?.deckTab === 'team1', JSON.stringify(confirm));
check('⑤ 房间刷新后页签仍是 team1、卡槽不变',
  refresh?.deckTab === 'team1' && refresh?.domActive === 'team1' && eq(refresh?.selected, [3]),
  JSON.stringify(refresh));
// 卡组内容按账号接口断言（本 fixture 的 inventory 是内存桩，本地存储读回来是空的）
const writeFor = (deckNo) => out.deckWrites.filter((w) => w.path === `/player/decks/${deckNo}`);
const lastCardsFor = (deckNo) => writeFor(deckNo).at(-1)?.body?.cards ?? null;
console.log('账号写入：', JSON.stringify(out.deckWrites.map((w) => `${w.path}=${JSON.stringify(w.body.cards)}`)));
check('⑥ 战团1 存的是它自己的卡（cardId 4），不是默认卡组那套',
  eq(lastCardsFor(1), [4]), `team1=${JSON.stringify(lastCardsFor(1))}`);
// 只看"战团1 这次保存之后"的写入：任何别的战团都不许再收到战团1 的这套卡
const confirmIndex = out.deckWrites.findLastIndex((w) => w.path === '/player/decks/1' && (w.body?.cards ?? []).includes(4));
const afterConfirm = out.deckWrites.slice(confirmIndex + 1);
check('⑦ 保存战团1 之后，这套卡不会被写进别的战团',
  afterConfirm.every((w) => w.path === '/player/decks/1'),
  JSON.stringify(afterConfirm.map((w) => `${w.path}=${JSON.stringify(w.body?.cards)}`)));
check('⑨ 玩家点过战团2 后，房间渲染不许把他拖走（页签保持战团2，并把房间对齐到 2）',
  refresh2?.deckTab === 'team2' && refresh2?.domActive === 'team2' && refresh2?.memberDeckNo === 2,
  JSON.stringify(refresh2));
check('无页面报错', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
await browser.close();
process.exit(failures.length ? 1 : 0);
