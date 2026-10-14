/**
 * 2026-10-12：直接调用**服务端补卡逻辑**给玩家补齐可收藏卡
 *
 * 背景：
 *   · 客户端「补全卡」原本只改本地，服务端 player_cards 一直没有那些卡 ✗
 *   · 补上 applyServerSnapshot 后，客户端会采纳服务端卡表 → 于是"补的卡不见了"
 *   · 根治办法：把服务端也补上（服务端 player.js 保存战团时就是按 player_cards 校验的）
 *
 * 用法：
 *   node scripts/grant-server-collectibles-20261012.mjs            # 预演：只打印会补什么（不写库）
 *   node scripts/grant-server-collectibles-20261012.mjs --apply    # 真正写入
 *   node scripts/grant-server-collectibles-20261012.mjs --apply --user 371
 */
import * as dbmod from '../server/database.js';
import { refillCollectibleCardsHandler } from '../server/routes/cardInventoryRefill20260907.js';

const mod = dbmod.default ?? dbmod;
const db = mod.db ?? mod;
const all = (sql, params = []) => (typeof db.all === 'function' ? db.all(sql, params) : (async () => {
  const [rows] = await db.query(sql, params);
  return rows;
})());

const apply = process.argv.includes('--apply');
const userArg = process.argv.includes('--user') ? Number(process.argv[process.argv.indexOf('--user') + 1]) : 0;

const users = userArg ? [{ id: userArg }] : await all('SELECT id FROM users ORDER BY id DESC');
console.log(`模式: ${apply ? '✅ 写入 (--apply)' : '🔍 预演（不写库）'}  目标玩家: ${users.length} 个`);

/** 用假 req/res 调服务端 handler，拿到它实际补了多少 */
async function refillFor(userId) {
  let payload = null;
  const req = { user: { id: userId }, body: {} };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { payload = { status: this.statusCode, body }; return this; },
  };
  await refillCollectibleCardsHandler(req, res);
  return payload;
}

let totalAdded = 0;
for (const user of users) {
  const ownedBefore = await all('SELECT card_id FROM player_cards WHERE user_id=?', [user.id]);
  const before = ownedBefore.length;
  if (!apply) {
    // 预演：只统计"会新增多少"——用与 handler 相同的过滤规则
    const { getPvpCardDb } = await import('../server/battle/PvpCardDb.js');
    const want = getPvpCardDb().cards
      .filter((c) => c?.isCollectible?.() && Number(c.card_quality ?? c.quality) < 6)
      .map((c) => Number(c.id));
    const owned = new Set(ownedBefore.map((r) => Number(r.card_id)));
    const missing = want.filter((id) => !owned.has(id));
    console.log(`  #${user.id}  现有 ${before} 张 → 可补 ${missing.length} 张`);
    totalAdded += missing.length;
    continue;
  }
  const result = await refillFor(user.id);
  const ownedAfter = await all('SELECT card_id FROM player_cards WHERE user_id=?', [user.id]);
  console.log(`  #${user.id}  ${before} 张 → ${ownedAfter.length} 张   (added=${result?.body?.added ?? '?'} skipped=${result?.body?.skipped ?? '?'})`);
  totalAdded += ownedAfter.length - before;
}

console.log(apply ? `\n完成：共新增 ${totalAdded} 张` : `\n预演合计可补 ${totalAdded} 张（加 --apply 真正写入）`);
process.exit(0);
