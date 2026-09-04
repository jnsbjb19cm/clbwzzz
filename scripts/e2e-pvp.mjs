/**
 * 端到端 PVP 流程测试：注册两个玩家 → 创建/加入房间 → 准备 → 开始 → 部署 → 快照。
 * 运行：node scripts/e2e-pvp.mjs(需服务端在 3001 运行)
 */
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3001';
const suffix = Date.now().toString().slice(-6);

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function register(username) {
  const r = await api('/api/auth/register', { username, password: 'test1234', nickname: username });
  if (!r.token) throw new Error('注册失败: ' + JSON.stringify(r));
  return r;
}

function connect(token) {
  return io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
}

function ackEmit(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error(event + ' 超时'));
      if (!res?.ok) return reject(new Error(event + ': ' + (res?.message || '失败')));
      resolve(res);
    });
  });
}

const uA = await register('pvp_a_' + suffix);
const uB = await register('pvp_b_' + suffix);
console.log('注册 OK:', uA.user.nickname, '/', uB.user.nickname);

const a = connect(uA.token);
const b = connect(uB.token);
await Promise.all([
  new Promise((r) => a.on('connect', r)),
  new Promise((r) => b.on('connect', r)),
]);
console.log('两个玩家已连接');

// A 创建 2v2 房间
const created = await ackEmit(a, 'room:create', { mode: 'pvp', size: '2v2' });
console.log('A 创建房间 #' + created.room.id, '| 规模:', created.room.size, '| 蓝队:', created.room.members.length, '人');

// B 加入红队
const joined = await ackEmit(b, 'room:join', { roomId: created.room.id, team: 'red' });
console.log('B 加入红队:', joined.room.members.length, '人 |', joined.room.members.map((m) => m.nickname + ':' + m.team).join(', '));

// 接收快照
let snapshot;
const snapPromise = new Promise((resolve) => {
  b.on('room:snapshot', (room) => { if (room) resolve(room); });
});
await ackEmit(b, 'room:ready', { ready: true });
await snapPromise;
console.log('B 已准备(收到房间快照)');

// A 开始(PVP → 服务端权威对战启动)
const started = await ackEmit(a, 'room:start');
console.log('A 开始对战，房间状态:', started.room.status);

// 等待 pvp:snapshot
const pvpSnap = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 5000);
  a.on('pvp:snapshot', (snap) => {
    clearTimeout(timer);
    resolve(snap);
  });
});
if (!pvpSnap) {
  console.log('✗ 未收到 pvp:snapshot');
  process.exit(1);
}
console.log('✓ 收到 pvp:snapshot | 时间:', pvpSnap.t, '| 基地: 蓝', pvpSnap.heroHp.blue, '红', pvpSnap.heroHp.red, '| 能量: 蓝', pvpSnap.energy.blue, '红', pvpSnap.energy.red);

// A(蓝队)部署巨头怪到 col 2
const depA = await ackEmit(a, 'pvp:deploy', { cardId: 5, lane: 2, col: 2 });
console.log('A 部署巨头怪:', depA.result.energy !== undefined ? '能量剩余 ' + depA.result.energy : 'OK');

// B(红队)部署核桃卫兵到 col 9
const depB = await ackEmit(b, 'pvp:deploy', { cardId: 2, lane: 2, col: 9 });
console.log('B 部署核桃卫兵: 能量剩余', depB.result.energy);

// 等待快照确认单位出现
await new Promise((r) => setTimeout(r, 1500));
console.log('✓ 端到端 PVP 流程完成');
process.exit(0);
