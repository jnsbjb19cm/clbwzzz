// 临时验证（用完即删）：野外冒险(PVE)联机 —— 双客户端真实服务器端到端
import { io } from 'socket.io-client';
import { createRequire } from 'node:module';
import { Card } from '../src/core/Card.js';

const require = createRequire(import.meta.url);
const cardJson = require('../src/data/card.json');

const BASE = process.env.E2E_BASE || 'http://localhost:3002';
const rows = [];
const check = (n, ok, d) => rows.push({ n, ok: Boolean(ok), d });

const stamp = Date.now().toString(36);
async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${data.message || ''}`);
  return data;
}

async function register(tag) {
  return post('/api/auth/register', {
    username: `e2e_${tag}_${stamp}`,
    password: 'e2e-pass-123',
    nickname: `测试${tag}${stamp.slice(-4)}`,
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (e) => reject(new Error(`connect_error: ${e.message}`)));
  });
}

const emit = (socket, event, payload = {}) => socket.timeout(9000).emitWithAck(event, payload);

function firstDeployable() {
  const card = cardJson.map((r) => new Card(r)).find((c) =>
    Number(c.type) === 1 && Number(c.moveSpeed) > 0 && !c.isActiveSkill?.());
  return card;
}

const a = await register('A');
const b = await register('B');
check('注册两名玩家', a?.token && b?.token);

const sa = await connect(a.token);
const sb = await connect(b.token);
check('两名玩家 socket 连接成功', sa.connected && sb.connected);

const roomAck = await emit(sa, 'room:create', { mode: 'pve', stageId: 1, mapId: 1, name: '联机E2E关卡1' });
const roomId = roomAck?.room?.id;
check('创建 PVE 房间', Boolean(roomId) && roomAck.room.mode === 'pve', JSON.stringify(roomAck?.message || roomAck?.room?.mode));

const joinAck = await emit(sb, 'room:join', { roomId });
check('第二人加入同一房间', Boolean(joinAck?.room) && joinAck.room.id === roomId, JSON.stringify(joinAck?.message));
await emit(sb, 'room:ready', { ready: true });

const startAck = await emit(sa, 'room:start', {});
check('房主开始成功', Boolean(startAck?.room), JSON.stringify(startAck?.message));

const latest = { a: null, b: null };
const finished = { a: null, b: null };
const allSnapshots = { a: [], b: [] };
sa.on('pvp:authority:snapshot', (s) => { latest.a = s; allSnapshots.a.push(s); });
sb.on('pvp:authority:snapshot', (s) => { latest.b = s; allSnapshots.b.push(s); });
sa.on('pvp:authority:finished', (s) => { finished.a = s; });
sb.on('pvp:authority:finished', (s) => { finished.b = s; });

const waitFor = async (fn, timeoutMs = 8000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return Boolean(fn());
};

await emit(sa, 'pvp:authority:join', { roomId });
await emit(sb, 'pvp:authority:join', { roomId });
await waitFor(() => latest.a && latest.b, 5000);
const snapA = latest.a;
const snapB = latest.b;
check('两人进入同一场服务端权威战斗(mode=pve)',
  snapA?.mode === 'pve' && snapB?.mode === 'pve',
  JSON.stringify({ a: snapA?.mode, b: snapB?.mode }));
check('快照包含两名玩家', (snapA?.players || []).length === 2,
  JSON.stringify(snapA?.players));
check('快照含真实关卡信息', snapA?.stage?.id === 1,
  JSON.stringify(snapA?.stage));
check('快照含波次信息（无尽波次 total=null 表示∞）', Boolean(snapA?.wave) && (snapA.wave.total === null || Number(snapA.wave.total) >= 0),
  JSON.stringify(snapA?.wave));
check('服务端权威快照带 seq/protocol', Number(snapA?.seq) > 0 && Boolean(snapA?.protocol),
  JSON.stringify({ seq: snapA?.seq, protocol: snapA?.protocol }));

// 部署同步：A 部署，B 应该能收到同一 uid 的单位
const card = firstDeployable();
const before = snapA?.resources ? { ...snapA.resources } : null;
const deployAck = await emit(sa, 'pvp:authority:deploy', {
  cardId: Number(card.id), lane: 2, col: 1, craftQuality: 1, strengthLv: 0,
});
const deployedUid = Number(deployAck?.result?.unit?.uid) || null;
check('A 部署成功', Boolean(deployedUid), JSON.stringify(deployAck?.message || deployAck?.result?.unit));
const after = deployAck?.result?.resources ? { ...deployAck.result.resources } : null;
check('部署扣了资源（阳光或食物）',
  Boolean(before && after) && (after.sun < before.sun || after.food < before.food),
  JSON.stringify({ before, after }));

await waitFor(() => (latest.b?.units || []).some((u) => Number(u.uid) === deployedUid), 6000);
const bSees = (latest.b?.units || []).find((u) => Number(u.uid) === deployedUid);
check('B 端看到 A 部署的单位（同一 uid）', Boolean(bSees), `uid=${deployedUid}`);
check('该单位归属 A 玩家', Number(bSees?.ownerUserId) === Number(a.user.id),
  JSON.stringify({ ownerUserId: bSees?.ownerUserId, aId: a.user.id }));

// 两人看到同一波敌人（uid 集合一致）
await waitFor(() => (latest.a?.units || []).some((u) => u.team === 'enemy'), 25000);
const enemyUidsA = (latest.a?.units || []).filter((u) => u.team === 'enemy').map((u) => Number(u.uid)).sort();
const enemyUidsB = (latest.b?.units || []).filter((u) => u.team === 'enemy').map((u) => Number(u.uid)).sort();
check('两人看到同一波敌人（uid 集合一致）', enemyUidsA.length > 0 && JSON.stringify(enemyUidsA) === JSON.stringify(enemyUidsB),
  JSON.stringify({ a: enemyUidsA.slice(0, 6), b: enemyUidsB.slice(0, 6) }));

// 等待服务端把战斗打到最后（不部署防守，敌方波次会推掉我方基地），验证 finished 广播
const deadline = Date.now() + 150000;
while (Date.now() < deadline && !(finished.a && finished.b)) {
  await new Promise((r) => setTimeout(r, 500));
}
const gotFinish = Boolean(finished.a && finished.b);
check('双方都收到 pvp:authority:finished 广播', gotFinish,
  gotFinish ? '' : '150s 内未结束（可接受，但需人工确认）');
if (gotFinish) {
  check('结束快照仍为 pve 模式', finished.a.mode === 'pve' && finished.b.mode === 'pve',
    JSON.stringify({ a: finished.a.mode, b: finished.b.mode }));
  check('双方 winner 一致', finished.a.winner === finished.b.winner,
    JSON.stringify({ a: finished.a.winner, b: finished.b.winner }));

  // 2026-09-11：服务端权威结算
  const rep = finished.a.battleReport;
  check('服务端结算完成且奖励开启(status=settled, rewardsEnabled)',
    rep?.status === 'settled' && rep?.rewardsEnabled === true,
    JSON.stringify({ status: rep?.status, rewardsEnabled: rep?.rewardsEnabled }));
  const rowA = (rep?.rows || []).find((r) => Number(r.userId) === Number(a.user.id));
  const rowB = (rep?.rows || []).find((r) => Number(r.userId) === Number(b.user.id));
  check('每名玩家各自结算(金币/经验>0)', rowA && rowB && rowA.gold > 0 && rowB.gold > 0 && rowA.exp > 0 && rowB.exp > 0,
    JSON.stringify({ a: rowA && { gold: rowA.gold, exp: rowA.exp }, b: rowB && { gold: rowB.gold, exp: rowB.exp } }));
  if (rep?.winner === 'blue') {
    check('胜利：功勋 + 首通标记', rowA.honor >= 50 && rowB.honor >= 50 && rowA.firstClear === true,
      JSON.stringify({ honorA: rowA.honor, honorB: rowB.honor, firstClearA: rowA.firstClear }));
  }

  // 数据库真的入账（金币 >= 本场结算金币）
  const snap = await fetch(`${BASE}/api/player/snapshot`, { headers: { authorization: `Bearer ${a.token}` } })
    .then((r) => r.json()).catch(() => null);
  check('金币已写入数据库', Number(snap?.profile?.gold) >= Number(rowA?.gold || 0) && Number(rowA?.gold || 0) > 0,
    JSON.stringify({ dbGold: snap?.profile?.gold, settledGold: rowA?.gold }));
  check('通关进度已写入数据库', Boolean(snap), JSON.stringify({ ok: Boolean(snap) }));
}

sa.close();
sb.close();

const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : `  << ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
process.exit(bad.length ? 1 : 0);
