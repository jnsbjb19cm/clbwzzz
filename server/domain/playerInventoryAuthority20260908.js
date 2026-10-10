import { createRequire } from 'node:module';
import { db, getPlayerSnapshot, withTransaction } from '../database.js';

const require = createRequire(import.meta.url);
const craftMaterials = require('../../src/data/craftMaterials.json');

/**
 * 2026-10-10（用户要求）：新号**道具一件都不给**。
 *
 * 这里原来发的是整套试玩材料（20 金币礼盒 + 10 红钻礼盒 + 100 荣誉礼盒 +
 * 几百个强化粉/DNA + craftMaterials 里的 starterCounts ），总量约 1.7 万个。
 * 而且它是**服务端**发的：getAuthoritativePlayerSnapshot20260908() 在登录拉快照时调用
 * ensurePlayerInventoryBootstrap20260908() —— 所以只清客户端是没用的
 * （实测：今天新建的 372 号卡牌只有 2 张，但道具 26 种共 17060 个）。
 *
 * 现在清空：ensurePlayerInventoryBootstrap20260908() 只写一条「已初始化」标记，
 * 不再发任何道具；旧账号里已经发出去的那份用 scripts/clear-trial-data-20261010.mjs 清。
 */
const STARTER_ITEMS = Object.freeze([]);

let bootstrapTableReady = null;

async function ensureBootstrapTable() {
  if (!bootstrapTableReady) {
    bootstrapTableReady = db.run(`
      CREATE TABLE IF NOT EXISTS player_inventory_bootstrap_20260908 (
        user_id BIGINT NOT NULL PRIMARY KEY,
        seeded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      bootstrapTableReady = null;
      throw error;
    });
  }
  await bootstrapTableReady;
}

function safeCount(value) {
  const count = Math.floor(Number(value) || 0);
  return Math.max(0, count);
}

async function addUnbound(conn, userId, itemId, count) {
  const amount = safeCount(count);
  if (!amount) return;
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
    [userId, itemId],
  );
  if (row) {
    await conn.run(
      'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0',
      [amount, userId, itemId],
    );
  } else {
    await conn.run(
      'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)',
      [userId, itemId, amount],
    );
  }
}

export async function ensurePlayerInventoryBootstrap20260908(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return false;
  await ensureBootstrapTable();

  return withTransaction(async (conn) => {
    const already = await conn.get(
      'SELECT user_id AS userId FROM player_inventory_bootstrap_20260908 WHERE user_id=?',
      [uid],
    );
    if (already) return false;

    // 旧版本的初始背包只存在 localStorage。升级到服务器权威后，
    // 只补齐官方初始包的缺口，不接受客户端任意数量，避免形成物品铸造接口。
    for (const starter of STARTER_ITEMS) {
      const owned = await conn.get(
        'SELECT COALESCE(SUM(count),0) AS count FROM player_items WHERE user_id=? AND item_id=?',
        [uid, starter.itemId],
      );
      const deficit = Math.max(0, safeCount(starter.count) - safeCount(owned?.count));
      if (deficit > 0) await addUnbound(conn, uid, starter.itemId, deficit);
    }

    await conn.run(
      'INSERT INTO player_inventory_bootstrap_20260908(user_id) VALUES(?)',
      [uid],
    );
    return true;
  });
}

export async function readPlayerItems20260908(userId) {
  const rows = await db.all(`
    SELECT item_id AS itemId, count, is_bound AS isBound
    FROM player_items
    WHERE user_id=? AND count>0
    ORDER BY item_id, is_bound DESC
  `, [Number(userId)]);
  return rows.map((row) => ({
    itemId: Number(row.itemId),
    count: safeCount(row.count),
    bound: Boolean(row.isBound),
  }));
}

export async function getAuthoritativePlayerSnapshot20260908(userId) {
  await ensurePlayerInventoryBootstrap20260908(userId);
  const snapshot = await getPlayerSnapshot(userId);
  if (!snapshot) return null;
  return {
    ...snapshot,
    items: await readPlayerItems20260908(userId),
  };
}

export { STARTER_ITEMS as PLAYER_STARTER_ITEMS_20260908 };
