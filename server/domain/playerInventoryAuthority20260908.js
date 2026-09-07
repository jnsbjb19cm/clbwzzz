import { createRequire } from 'node:module';
import { db, getPlayerSnapshot, withTransaction } from '../database.js';

const require = createRequire(import.meta.url);
const craftMaterials = require('../../src/data/craftMaterials.json');

const STARTER_ITEMS = Object.freeze([
  { itemId: 1, count: 20 },
  { itemId: 2, count: 10 },
  { itemId: 3, count: 100 },
  { itemId: 10001, count: 200 },
  { itemId: 10002, count: 150 },
  { itemId: 10003, count: 100 },
  { itemId: 10004, count: 80 },
  { itemId: 10005, count: 50 },
  { itemId: 30055, count: 300 },
  ...Object.entries(craftMaterials.starterCounts ?? {}).map(([itemId, count]) => ({
    itemId: Number(itemId),
    count: Number(count),
  })),
].filter((entry) => Number.isInteger(entry.itemId) && entry.itemId > 0 && Number.isFinite(entry.count) && entry.count > 0));

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
