/**
 * 2026-10-23：恢复的 4 条「秘境材料」支线 —— 服务端领奖链路回归。
 * 用真实 QuestCatalog.findQuestReward + 真实 questRewardAuthority 路由（内存 conn 替身）验证：
 *  ① 材料足够（sq29 铠甲 100/120）→ 200，扣 100 材料、加 1500 金币；
 *  ② 材料不足 → 400 且不发奖、不写领取记录；
 *  ③ 重复领取 → 409；
 *  ④ 带卡牌奖励的 sq28 也走通（卡牌入包、材料扣除）。
 * 不接触真实数据库。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findQuestReward } from '../src/data/QuestCatalog.js';
import { questPeriodKey, questClaimStorageId } from '../src/data/QuestPeriods.js';

const RealDate = Date;
let now = Date.parse('2026-10-23T12:00:00Z');
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};

const claims = new Map();
const items = new Map();     // itemId -> count
const gold = { value: 0 };
let handler = null;
const sqlLog = [];
const key = (params) => params.slice(0, 3).join('|');

const conn = {
  async all(sql) {
    if (sql.includes('FROM player_cards')) return [];
    return [];
  },
  async get(sql, params = []) {
    if (sql.includes('FROM player_quest_reward_claims')) return claims.get(key(params)) || null;
    if (sql.includes('FROM player_profiles')) return { level: 50, exp: 0, gold: gold.value };
    if (sql.includes('FROM player_items')) {
      const itemId = Number(params[1]);
      const count = items.get(itemId) || 0;
      return count > 0 ? { count } : null;
    }
    if (sql.includes('FROM player_card_bags')) return { slotCount: 200 };
    if (sql.includes('FROM player_cards')) return [];
    if (sql.includes('FROM player_quests')) return null;
    return null;
  },
  async run(sql, params = []) {
    sqlLog.push({ sql: sql.replace(/\s+/g, ' ').trim().slice(0, 120), params });
    if (sql.includes('INSERT INTO player_quest_reward_claims')) claims.set(key(params), { claimed_at: new Date().toISOString() });
    if (sql.includes('SET gold=gold+')) gold.value += Number(params[0]) - Number(params[1] || 0);
    // UPDATE player_items SET count=count+? [count,userId,itemId] / SET count=? [left,userId,itemId]
    if (sql.includes('UPDATE player_items SET count=count+')) {
      const itemId = Number(params[2]);
      items.set(itemId, (items.get(itemId) || 0) + Number(params[0]));
    } else if (sql.includes('UPDATE player_items SET count=')) {
      items.set(Number(params[2]), Number(params[0]));
    }
    if (sql.includes('DELETE FROM player_items')) items.delete(Number(params[1]));
    if (sql.includes('INSERT INTO player_items')) items.set(Number(params[1]), Number(params[2]));
    return { changes: 1 };
  },
};

globalThis.__questRouteTest = {
  Router: () => ({ use() {}, post(path, fn) { handler = fn; } }),
  db: conn,
  // 真实事务是「出错回滚」：这里用快照模拟，避免材料不足时把前面的金币/材料改动当成已生效。
  withTransaction: async (fn) => {
    const snapshot = { gold: gold.value, items: new Map(items), claims: new Map(claims) };
    try { return await fn(conn); } catch (error) {
      gold.value = snapshot.gold;
      items.clear(); for (const [id, count] of snapshot.items) items.set(id, count);
      claims.clear(); for (const [id, value] of snapshot.claims) claims.set(id, value);
      throw error;
    }
  },
  requireAuth() {},
  findQuestReward,
  questPeriodKey,
  questClaimStorageId,
  grantPlayerExp(progress, exp) { progress.exp = (progress.exp || 0) + exp; },
  readPlayerItems20260908: async () => [],
  readCardInventory: async () => ({ slots: [] }),
};

let source = readFileSync('server/routes/questRewardAuthority20260908.js', 'utf8');
source = source.replace(/^import .*;\r?\n/gm, '');
source = `const {${Object.keys(globalThis.__questRouteTest).join(',')}}=globalThis.__questRouteTest;\n` + source;
await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const call = async (category, questId) => {
  let status = 200;
  let body;
  await handler({ user: { id: 1 }, body: { category, questId, period: questPeriodKey(category) } }, {
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  });
  return { status, body };
};

const failures = [];
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
};

console.log('=== 秘境材料支线 · 服务端领奖 ===');
await check('材料足够：sq29「铠甲的研发」扣 100 铠甲、发 1500 金币、记录已领取', async () => {
  items.set(53002, 120);
  gold.value = 5000;
  const before = gold.value;
  const result = await call('side', 'sq29');
  assert.equal(result.status, 200, `HTTP ${result.status} ${result.body?.message || ''}`);
  assert.equal(items.get(53002), 20, `应剩 20 个铠甲，实际 ${items.get(53002)}`);
  assert.equal(gold.value - before, 1500, `金币应 +1500，实际 +${gold.value - before}`);
  assert.ok(claims.has('1|side|sq29'), '应写入领取记录');
});

await check('材料不足：返回 400、不发奖、不写领取记录', async () => {
  items.set(53003, 30);
  gold.value = 5000;
  claims.delete('1|side|sq30');
  const result = await call('side', 'sq30');
  assert.equal(result.status, 400, `应 400，实际 ${result.status}`);
  assert.ok(String(result.body?.message || '').includes('材料'), `错误信息应提示材料不足：${result.body?.message}`);
  assert.equal(items.get(53003), 30, '材料不足时不应扣除');
  assert.equal(gold.value, 5000, '材料不足时不应发金币');
  assert.ok(!claims.has('1|side|sq30'), '材料不足时不应写领取记录');
});

await check('重复领取：同一任务第二次返回 409', async () => {
  const result = await call('side', 'sq29');
  assert.equal(result.status, 409, `重复领取应 409，实际 ${result.status}`);
});

await check('带卡牌奖励：sq28「以毒攻毒」扣 50 巫蛊并发剧毒巫师(75)', async () => {
  items.set(53001, 60);
  gold.value = 5000;
  const beforeCards = sqlLog.filter((entry) => entry.sql.includes('INSERT INTO player_cards')).length;
  const result = await call('side', 'sq28');
  assert.equal(result.status, 200, `HTTP ${result.status} ${result.body?.message || ''}`);
  // 60 - 提交 50 + 任务奖励回赠 1 = 11
  assert.equal(items.get(53001), 11, `应剩 11 个巫蛊（60-50+奖励1），实际 ${items.get(53001)}`);
  const cardInserts = sqlLog.filter((entry) => entry.sql.includes('INSERT INTO player_cards'));
  assert.equal(cardInserts.length, beforeCards + 1, '应新增 1 张卡牌');
  assert.equal(Number(cardInserts.at(-1).params[2]), 75, '发放的卡牌应为剧毒巫师(75)');
});

globalThis.Date = RealDate;
delete globalThis.__questRouteTest;
console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
