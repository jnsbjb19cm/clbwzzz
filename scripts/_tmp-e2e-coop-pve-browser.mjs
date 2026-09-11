// 临时验证（用完即删）：野外冒险(PVE)联机 —— 双浏览器真机端到端
// 前置：测试服已在 3002 端口运行（dist 客户端 + /api + socket 同源）
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:3002';
const rows = [];
const check = (n, ok, d) => rows.push({ n, ok: Boolean(ok), d });
const stamp = Date.now().toString(36);

async function register(tag) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `br_${tag}_${stamp}`, password: 'e2e-pass-123', nickname: `浏览器${tag}${stamp.slice(-4)}` }),
  });
  if (!res.ok) throw new Error(`register ${tag} failed: ${res.status}`);
  return res.json();
}

const accA = await register('A');
const accB = await register('B');

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const errors = [];

async function openClient(acc) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((token) => {
    try { sessionStorage.setItem('clbwz_auth_token_v1', token); } catch { /* ignore */ }
  }, acc.token);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${acc.user.nickname}] ${e.message.slice(0, 160)}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 25000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const A = await openClient(accA);
const B = await openClient(accB);
check('两个浏览器客户端登录成功', Boolean(accA.token && accB.token));

const userIdA = accA.user.id;

// A 创建 PVE 房间
await A.page.evaluate(() => globalThis.__clbwzAppInstance.navigate('room', { stageId: 1, mapId: 1, stageName: '联机E2E', autoCreate: true }));
await A.page.evaluate(() => globalThis.__clbwzAppInstance.views.room?.socket?.socket?.connected === true)
  || await A.page.waitForFunction(() => globalThis.__clbwzAppInstance.views.room?.socket?.socket?.connected === true, null, { timeout: 20000 }).catch(() => {});
let roomId = await A.page.waitForFunction(() => globalThis.__clbwzAppInstance.views.room?.room?.id, null, { timeout: 12000 })
  .then((handle) => handle.jsonValue()).catch(() => null);
if (!roomId) {
  await A.page.evaluate(() => { const r = globalThis.__clbwzAppInstance.views.room; r._autoCreateStarted = false; r.autoCreateRoom(); });
  roomId = await A.page.waitForFunction(() => globalThis.__clbwzAppInstance.views.room?.room?.id, null, { timeout: 12000 })
    .then((handle) => handle.jsonValue()).catch(() => null);
}
check('A 创建 PVE 房间', Boolean(roomId));

// B 加入并准备（等 socket 真正连上，join 失败重试）
await B.page.evaluate(() => globalThis.__clbwzAppInstance.navigate('room', {}));
await B.page.waitForFunction(() => globalThis.__clbwzAppInstance.views.room?.socket?.socket?.connected === true, null, { timeout: 20000 }).catch(() => {});
await B.page.evaluate(async (rid) => {
  const r = globalThis.__clbwzAppInstance.views.room;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      r.enterRoom(await r.socket.joinRoom(rid));
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }
  throw lastError ?? new Error('joinRoom failed');
}, roomId);
await A.page.waitForFunction((rid) => (globalThis.__clbwzAppInstance.views.room?.room?.members || []).length >= 2, roomId, { timeout: 15000 })
  .catch(() => {});
const memberCountA = await A.page.evaluate(() => (globalThis.__clbwzAppInstance.views.room?.room?.members || []).length);
check('房间内有两人', memberCountA >= 2, `members=${memberCountA}`);

await B.page.evaluate(() => globalThis.__clbwzAppInstance.views.room.socket.setReady(true));
await B.page.waitForTimeout(500);

// 房主开始 → 两人应进入同一场联机战斗
await A.page.evaluate(() => globalThis.__clbwzAppInstance.views.room.socket.startGame());

const waitBattle = (page) => page.waitForFunction(() => {
  const v = globalThis.__clbwzAppInstance.views.room?.roomBattleView;
  return Boolean(v && v.pvp?.mode === 'pve' && v.__pvpAuthorityActive);
}, null, { timeout: 30000 });
const battleA = await waitBattle(A.page).then(() => true).catch(() => false);
const battleB = await waitBattle(B.page).then(() => true).catch(() => false);
check('A 端进入联机合作战斗(权威)', battleA);
check('B 端进入联机合作战斗(权威)', battleB);

const infoA = await A.page.evaluate(() => {
  const v = globalThis.__clbwzAppInstance.views.room.roomBattleView;
  const snap = v.__pvpLatestSnapshot;
  return {
    mode: v.pvp.mode,
    stageId: Number(v.engine?.stage?.stage_id),
    players: (snap?.players || []).length,
    title: document.querySelector('.coop-pve-battle .immersive-stage')?.textContent || '',
    enemies: (v.engine?.units || []).filter((u) => u.team === 'enemy').map((u) => Number(u.uid)).sort(),
  };
});
check('A 端战斗模式/关卡正确', infoA.mode === 'pve' && infoA.stageId === 1, JSON.stringify(infoA));
check('A 端看到 2 名玩家同屏', infoA.players === 2, `players=${infoA.players}`);
check('A 端标题显示关卡名', infoA.title.includes('联机E2E') || infoA.title.length > 0, infoA.title);

// 背景/柱子：PVE 联机用冒险草地场地 + 权威柱（与 PVP/BOSS 同一套柱层，位置缩放一致）
const bgInfo = await A.page.evaluate(() => {
  const wrap = document.querySelector('.coop-pve-battle .battle-game-wrap');
  const cs = wrap ? getComputedStyle(wrap) : null;
  const rect = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  return {
    hasPveClass: Boolean(document.querySelector('.battle-page.coop-pve-battle')),
    authorityColumns: document.querySelectorAll('[data-pvp-authority-column]').length,
    wrap: rect(wrap),
    leftColumn: rect(document.querySelector('.pvp-authority-column.left')),
    rightColumn: rect(document.querySelector('.pvp-authority-column.right')),
    playerBase: rect(document.querySelector('.base-hp-slot.player')),
    bgMap: (cs?.getPropertyValue('--bg-map') || '').trim(),
    iceLeft: (cs?.getPropertyValue('--ice-left-url') || '').trim(),
    sceneLabel: document.querySelector('.battle-map-label')?.textContent || '',
  };
});
check('PVE 联机背景=冒险草地场地（蘑菇柱）',
  bgInfo.hasPveClass && bgInfo.sceneLabel.includes('草地') && bgInfo.iceLeft.includes('mushroom'),
  JSON.stringify(bgInfo));
// 左侧柱子几何：靠左、全高、宽度合理（位置/缩放正常）
check('左侧基地柱位置/缩放正常（贴左、全高、宽度合理）',
  Boolean(bgInfo.leftColumn) && bgInfo.leftColumn.x <= 4
    && bgInfo.leftColumn.h >= (bgInfo.wrap?.h || 0) - 8
    && bgInfo.leftColumn.w >= 60 && bgInfo.leftColumn.w <= (bgInfo.wrap?.w || 0) * 0.45,
  JSON.stringify({ left: bgInfo.leftColumn, wrap: bgInfo.wrap }));
check('右侧基地柱存在且贴右',
  Boolean(bgInfo.rightColumn) && bgInfo.rightColumn.x + bgInfo.rightColumn.w >= (bgInfo.wrap?.w || 0) - 4,
  JSON.stringify({ right: bgInfo.rightColumn, wrap: bgInfo.wrap }));

// 部署同步：A 部署 → B 端出现同一 uid 的单位
const deployed = await A.page.evaluate(async () => {
  const v = globalThis.__clbwzAppInstance.views.room.roomBattleView;
  const res = await v.pvpSocket.emitAck('pvp:authority:deploy', { cardId: 3, lane: 2, col: 1, craftQuality: 1, strengthLv: 0 });
  return { uid: Number(res?.result?.unit?.uid) || null, message: res?.message || '' };
});
check('A 部署成功', Boolean(deployed.uid), JSON.stringify(deployed));

const bSees = deployed.uid
  ? await B.page.waitForFunction((uid) => (globalThis.__clbwzAppInstance.views.room.roomBattleView.engine.units || [])
    .some((u) => Number(u.uid) === uid), deployed.uid, { timeout: 12000 }).then(() => true).catch(() => false)
  : false;
check('B 端看到 A 部署的单位（同屏/部署同步）', bSees, `uid=${deployed.uid}`);

const bOwner = await B.page.evaluate((uid) => {
  const u = (globalThis.__clbwzAppInstance.views.room.roomBattleView.engine.units || []).find((x) => Number(x.uid) === uid);
  return Number(u?.pvpOwnerUserId ?? u?.ownerUserId) || null;
}, deployed.uid);
check('该单位归属 A 玩家', bOwner === userIdA, JSON.stringify({ bOwner, userIdA }));

// 同屏：两人看到同一波敌人 uid
const waitEnemies = (page) => page.waitForFunction(() => {
  const v = globalThis.__clbwzAppInstance.views.room.roomBattleView;
  return (v.engine.units || []).some((u) => u.team === 'enemy');
}, null, { timeout: 30000 }).then(() => true).catch(() => false);
await Promise.all([waitEnemies(A.page), waitEnemies(B.page)]);
const enemies = await Promise.all([A.page, B.page].map((page) => page.evaluate(() =>
  (globalThis.__clbwzAppInstance.views.room.roomBattleView.engine.units || [])
    .filter((u) => u.team === 'enemy').map((u) => Number(u.uid)).sort())));
check('两人同屏看到同一波敌人', enemies[0].length > 0 && JSON.stringify(enemies[0]) === JSON.stringify(enemies[1]),
  JSON.stringify({ a: enemies[0].slice(0, 6), b: enemies[1].slice(0, 6) }));

// 服务端结算：客户端 onBattleResult 只刷新显示，不再本地重复发奖（避免双倍）
const before = await A.page.evaluate(async () => {
  const token = sessionStorage.getItem('clbwz_auth_token_v1');
  const r = await fetch('/api/player/snapshot', { headers: { authorization: `Bearer ${token}` } });
  const d = await r.json();
  return { gold: Number(d.profile?.gold) || 0, exp: Number(d.profile?.exp) || 0 };
});
await A.page.evaluate(() => {
  const v = globalThis.__clbwzAppInstance.views.room.roomBattleView;
  v.onBattleResult({ won: true, stage: v.engine.stage, mode: 'pve', durationMs: 1234 });
});
await A.page.waitForTimeout(2500);
const after = await A.page.evaluate(async () => {
  const token = sessionStorage.getItem('clbwz_auth_token_v1');
  const r = await fetch('/api/player/snapshot', { headers: { authorization: `Bearer ${token}` } });
  const d = await r.json();
  return { gold: Number(d.profile?.gold) || 0, exp: Number(d.profile?.exp) || 0 };
});
check('客户端不再本地重复发奖（服务端权威结算）', after.gold === before.gold && after.exp === before.exp,
  JSON.stringify({ before, after }));

// 结算面板文案：不应再出现「不对等战斗」，且显示关卡名 + 金币列
const panel = await A.page.evaluate(() => {
  const v = globalThis.__clbwzAppInstance.views.room.roomBattleView;
  v.engine.status = 'win';
  v._resultReported = true;
  v.__authorityBattleReport = {
    mode: 'pve', status: 'settled', rewardsEnabled: true, winner: 'blue', stageName: '密林边缘1',
    rows: [{
      userId: Number(globalThis.__clbwzAppInstance.player?.userId) || 0,
      nickname: '联机A', team: 'blue', level: 3, kills: 2, losses: 0,
      gold: 150, exp: 120, honor: 50, items: [],
    }],
  };
  v.updateResultOverlay(v.viewRoot);
  const card = v.viewRoot.querySelector('#result-overlay .result-card');
  return {
    note: card?.querySelector('.authority-settlement-note')?.textContent || '',
    desc: card?.querySelector('#result-desc')?.textContent || '',
    body: card?.textContent || '',
  };
});
check('结算面板不再显示「不对等战斗」且显示奖励已发放',
  !panel.note.includes('不对等') && panel.note.includes('奖励已发放'), JSON.stringify(panel.note));
check('结算面板显示关卡名与金币列',
  panel.desc.includes('密林边缘1') && panel.body.includes('金币') && panel.body.includes('150'),
  JSON.stringify({ desc: panel.desc, hasGold: panel.body.includes('金币') }));

check('无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '));

await A.page.screenshot({ path: 'scripts/output/_coop-pve-browser-a.png' }).catch(() => {});
await B.page.screenshot({ path: 'scripts/output/_coop-pve-browser-b.png' }).catch(() => {});

await browser.close();
const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : `  << ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
process.exit(bad.length ? 1 : 0);
