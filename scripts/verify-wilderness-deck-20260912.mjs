// 回归验证：野外冒险（联机 PVE 房间）进出之后，"战团"必须保持玩家选的那套。
//
// 用户报告：保存并选中战团3 → 进游戏 → 从野外冒险退出 → 选中的战团变默认 / 卡组串组 /
//           "在默认/战团1/战团3 都被重定向到战团2"。
// 本脚本故意在进战斗前塞一个"上一场的残留标记"（__activeDeckGroup20260907='default'），
// 保证测的是"以房间里选中的战团为准"，而不是环境标记。
//
// 用法： node scripts/verify-wilderness-deck-20260912.mjs  （需要 3001 API + vite dev）
//   DATABASE_PATH=server/data/xxx.sqlite SERVER_PORT=3001 node server/index.js
//   npx vite --port 5174 ; WEB_BASE=http://127.0.0.1:5174 node scripts/verify-wilderness-deck-20260912.mjs
import { chromium } from 'playwright';

const API = 'http://127.0.0.1:3001';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);

const user = await (async () => {
  for (let i = 0; i < 5; i += 1) {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `wd_${stamp}${i}`, password: 'e2e-pass-123', nickname: '野外探针' }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (json?.token) return json;
    await sleep(1200);
  }
  throw new Error('注册失败');
})();

// 复现用户账号里的"历史残留"：旧的 selected_deck_no=2（战团2），权威组 = team3
process.env.DATABASE_PATH = process.env.DATABASE_PATH || 'server/data/_tmp-wild-20260912.sqlite';
const { db } = await import('../server/database.js');
const probeUserId = Number(user.user?.id ?? user.id ?? 0);
await db.run("UPDATE player_profiles SET selected_deck_no=2, selected_deck_group='team3' WHERE user_id=?", [probeUserId]);
const row = await db.get('SELECT selected_deck_no AS no, selected_deck_group AS grp FROM player_profiles WHERE user_id=?', [probeUserId]);
console.log('账号字段（人为造出用户那种残留）:', JSON.stringify(row), 'userId=', probeUserId);

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
  const [cardModule, inventoryModule, deckModule, pref, groupMod] = await Promise.all([
    import(modUrl(/\/src\/core\/CardDatabase\.js(\?|$)/, '/src/core/CardDatabase.js')),
    import(modUrl(/\/src\/core\/CardInventoryStore\.js(\?|$)/, '/src/core/CardInventoryStore.js')),
    import(modUrl(/\/src\/ui\/DeckSelectView\.js(\?|$)/, '/src/ui/DeckSelectView.js')),
    import(modUrl(/\/src\/ui\/DeckGroupPreference20260911\.js(\?|$)/, '/src/ui/DeckGroupPreference20260911.js')),
    import(modUrl(/\/src\/ui\/DeckGroupSelection20260906\.js(\?|$)/, '/src/ui/DeckGroupSelection20260906.js')),
  ]);

  const db = new cardModule.CardDatabase();
  // 房间/战斗用的是 app 自己那份 inventory；这里优先复用它（探针里 new 出来的那份跟它不是一个对象）
  const inventory = app.cardInventory
    ?? app.views?.room?.cardInventory
    ?? new inventoryModule.CardInventoryStore(db);
  if (inventory.getUsedCount() < 12) inventory.grantAllCollectibleCards();
  const usable = inventory.getSlots().map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot && db.getById(slot.cardId)?.battleUsable !== false)
    .slice(0, 12).map(({ index }) => index);

  const groups = {
    default: [usable[0]],
    team1: [usable[1], usable[2]],
    team2: [usable[3]],
    team3: [usable[4], usable[5]],
  };
  for (const [group, sel] of Object.entries(groups)) deckModule.DeckSelectView.saveDeck(sel, inventory, group);

  // 用户操作：保存并选中战团3（= 记住 + 写账号）
  pref.rememberDeckGroup20260911('team3');
  await sleep2(600);

  const roomInventory = () => (app.views?.room?.cardInventory ?? inventory);
  const snap = (label) => {
    const roomView = app.views?.room ?? null;
    const room = roomView?.room ?? null;
    const me = (room?.members ?? []).find((m) => String(m?.userId) === String(roomView?.currentUserId?.()));
    const battleView = app.views?.room?.roomBattleView ?? app.views?.battle ?? null;
    const active = pref.selectedBattleDeck20260912(roomInventory(), db);
    return {
      label,
      remembered: pref.readRememberedDeckGroup20260911(),
      flag: roomInventory().__activeDeckGroup20260907 ?? null,
      handoff: roomInventory().__roomBattleDeckSelection20260908?.group ?? null,
      memberDeckNo: me?.selectedDeckNo ?? null,
      resolvedGroup: active.group,
      resolvedSlots: active.slots,
      roomTab: roomView?.deckSelect?._deckTab ?? null,
      battleDeckGroup: battleView?.pvp?.deckGroup ?? null,
      battleDeckSlots: battleView?.deckSlots ? [...battleView.deckSlots] : null,
      view: app.currentViewName ?? app.view ?? null,
    };
  };

  const steps = [];
  // ① 进入野外冒险房间（PVE）
  app.navigate('room', { stageId: 1, autoCreate: true, stageName: '神秘之森' });
  let dl = Date.now() + 20000;
  while (Date.now() < dl) { if (app.views?.room?.room?.mode === 'pve') break; await sleep2(300); }
  await sleep2(1200);
  steps.push(snap('进野外冒险房间后'));

  // ② 在房间里点"战团3"页签（= 选中战团3）
  document.querySelector('.deck-tab[data-tab="team3"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(600);
  steps.push(snap('房间点选战团3'));

  // ③ 开始战斗前故意留一个"上一场残留"的环境标记（旧代码会按它取卡组 → 串组）
  roomInventory().__activeDeckGroup20260907 = 'default';
  // 记录之后每一次对该标记的写入（谁把它写成 default 的）
  const flagWrites = [];
  let flagValue = roomInventory().__activeDeckGroup20260907;
  Object.defineProperty(roomInventory(), '__activeDeckGroup20260907', {
    configurable: true,
    get: () => flagValue,
    set: (value) => {
      flagValue = value;
      flagWrites.push({
        value,
        stack: String(new Error().stack ?? '').split(String.fromCharCode(10)).slice(2, 5)
          .map((line) => line.trim().replace(/^at /, '').split(' ')[0].slice(0, 60)),
      });
    },
  });
  steps.push(snap('塞入残留标记 default 后'));

  // ③b 开始战斗（野外冒险：走 AdventureCoopBridge → 联机 PVE 战场）
  document.querySelector('#room-ready-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  dl = Date.now() + 25000;
  while (Date.now() < dl) {
    if (app.views?.room?.roomBattleView?.engine || app.views?.battle?.engine) break;
    await sleep2(300);
  }
  await sleep2(3000);
  steps.push(snap('野外冒险战斗中'));

  // ④ 退出战斗
  document.querySelector('#battle-back')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep2(2500);
  steps.push(snap('退出战斗后'));

  // ⑤ 回到房间再看页签
  if (app.views?.room?.room) {
    app.views.room.renderRoomInside?.();
    await sleep2(800);
    steps.push(snap('回房间渲染后'));
  }

  return { groups, steps, flagWrites };
});

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const failures = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `
       ${detail}`}`);
  if (!ok) failures.push(name);
};

console.log('卡组布置：', JSON.stringify(out.groups));
for (const s of out.steps) {
  console.log(`  ${s.label}\n    记住=${s.remembered} 标记=${s.flag} 交接=${s.handoff} 房间成员=${s.memberDeckNo} 解析组=${s.resolvedGroup} 解析卡槽=${JSON.stringify(s.resolvedSlots)}\n    房间页签=${s.roomTab} 战斗组=${s.battleDeckGroup} 战斗卡槽=${JSON.stringify(s.battleDeckSlots)}`);
}
const byLabel = Object.fromEntries(out.steps.map((s) => [s.label, s]));
const inRoom = byLabel['进野外冒险房间后'];
const inBattle = byLabel['野外冒险战斗中'];
const afterExit = byLabel['退出战斗后'];

check('① 进房时"解析出的战团" = 玩家选中的战团3（服务端成员也应是 3）',
  inRoom?.resolvedGroup === 'team3' && inRoom?.memberDeckNo === 3, JSON.stringify(inRoom));
check('② 野外冒险战斗中：战斗用的战团 = 战团3，卡槽 = 战团3 的卡（不受残留标记影响）',
  inBattle?.battleDeckGroup === 'team3' && eq(inBattle?.battleDeckSlots, out.groups.team3), JSON.stringify(inBattle));
check('③ 退出战斗后：选中的战团仍是战团3（不会被重置成默认）',
  afterExit?.remembered === 'team3' && afterExit?.resolvedGroup === 'team3', JSON.stringify(afterExit));
check('④ 退出后战团3 的卡组没丢（还是 [4,5] 那套）',
  eq(afterExit?.resolvedSlots, out.groups.team3), JSON.stringify(afterExit?.resolvedSlots));
check('无页面报错', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
await browser.close();
process.exit(failures.length ? 1 : 0);
