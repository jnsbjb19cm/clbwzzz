/**
 * 2026-10-09：储藏室（服务端权威）。
 *
 * 需求：形态 = 背包工具栏加入口 + 独立界面 + 道具在 背包 ↔ 储藏室 互转，容量 2000。
 * 容量按「格子数」算（不同道具各占一格），跟背包的槽位概念对齐。
 *
 * 表结构注意：服务端同时支持 MySQL / SQLite —— 不用 SQLite 专有的 upsert 语法，
 * 统一走「先查再 UPDATE/INSERT」，和 player_items 的写法保持一致。
 */
import { Router } from 'express';
import { db, withTransaction, whenDatabaseReady } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { readPlayerItems20260908 } from '../domain/playerInventoryAuthority20260908.js';

export const storageAuthorityRouter20261009 = Router();
storageAuthorityRouter20261009.use(requireAuth);

export const STORAGE_CAPACITY_20261009 = 2000;
const MAX_STACK = 9999;

// 可失败降级：数据库不可用时不要让模块加载失败（历史 502 的根因）。
await whenDatabaseReady(`
  CREATE TABLE IF NOT EXISTS player_storage_items (
    user_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    is_bound TINYINT NOT NULL DEFAULT 0,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, item_id, is_bound)
  )
`, 'player_storage_items');

function int(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clampMove(value) {
  return Math.max(1, Math.min(MAX_STACK, int(value, 1)));
}

async function readStorageRows(conn, userId) {
  const rows = await conn.all(`
    SELECT item_id AS itemId, is_bound AS isBound, count
    FROM player_storage_items
    WHERE user_id=? AND count>0
    ORDER BY item_id, is_bound DESC
  `, [userId]);
  return rows.map((row) => ({
    itemId: Number(row.itemId),
    count: Math.max(0, int(row.count)),
    bound: Boolean(row.isBound),
  }));
}

async function readStorage(userId) {
  return readStorageRows(db, Number(userId));
}

async function storageUsed(conn, userId) {
  const row = await conn.get(
    'SELECT COUNT(*) AS used FROM player_storage_items WHERE user_id=? AND count>0',
    [userId],
  );
  return Math.max(0, int(row?.used));
}

async function addStorage(conn, userId, itemId, count, bound) {
  const b = bound ? 1 : 0;
  const row = await conn.get(
    'SELECT count FROM player_storage_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, itemId, b],
  );
  if (row) {
    await conn.run(
      'UPDATE player_storage_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=?',
      [count, userId, itemId, b],
    );
  } else {
    await conn.run(
      'INSERT INTO player_storage_items(user_id,item_id,is_bound,count) VALUES(?,?,?,?)',
      [userId, itemId, b, count],
    );
  }
}

/** 从储藏室取回：只取到实际有的数量；取空则删行。返回实际取出的数量。 */
async function takeStorage(conn, userId, itemId, want, bound) {
  const b = bound ? 1 : 0;
  const row = await conn.get(
    'SELECT count FROM player_storage_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, itemId, b],
  );
  const owned = Math.max(0, int(row?.count));
  const taken = Math.min(owned, want);
  if (taken <= 0) return 0;
  const left = owned - taken;
  if (left > 0) {
    await conn.run(
      'UPDATE player_storage_items SET count=? WHERE user_id=? AND item_id=? AND is_bound=?',
      [left, userId, itemId, b],
    );
  } else {
    await conn.run(
      'DELETE FROM player_storage_items WHERE user_id=? AND item_id=? AND is_bound=?',
      [userId, itemId, b],
    );
  }
  return taken;
}

async function addBagItem(conn, userId, itemId, count, bound) {
  const b = bound ? 1 : 0;
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, itemId, b],
  );
  if (row) {
    await conn.run(
      'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=?',
      [count, userId, itemId, b],
    );
  } else {
    await conn.run(
      'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,?)',
      [userId, itemId, count, b],
    );
  }
}

/** 从背包取走：只取到实际有的数量；取空则删行。返回实际取出的数量。 */
async function takeBagItem(conn, userId, itemId, want, bound) {
  const b = bound ? 1 : 0;
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, itemId, b],
  );
  const owned = Math.max(0, int(row?.count));
  const taken = Math.min(owned, want);
  if (taken <= 0) return 0;
  const left = owned - taken;
  if (left > 0) {
    await conn.run(
      'UPDATE player_items SET count=? WHERE user_id=? AND item_id=? AND is_bound=?',
      [left, userId, itemId, b],
    );
  } else {
    await conn.run(
      'DELETE FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
      [userId, itemId, b],
    );
  }
  return taken;
}

async function snapshot(userId, extra = {}) {
  const [items, storage, used] = await Promise.all([
    readPlayerItems20260908(userId),
    readStorage(userId),
    db.get('SELECT COUNT(*) AS used FROM player_storage_items WHERE user_id=? AND count>0', [Number(userId)])
      .then((row) => Math.max(0, int(row?.used)))
      .catch(() => 0),
  ]);
  return { ok: true, ...extra, items, storage, capacity: STORAGE_CAPACITY_20261009, used };
}

storageAuthorityRouter20261009.get('/storage', async (req, res) => {
  try {
    return res.json(await snapshot(req.user.id));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '读取储藏室失败' });
  }
});

storageAuthorityRouter20261009.post('/storage/deposit', async (req, res) => {
  const userId = Number(req.user.id);
  try {
    const itemId = int(req.body?.itemId);
    const bound = Boolean(req.body?.bound);
    const want = clampMove(req.body?.count);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new Error('道具无效');
    const result = await withTransaction(async (conn) => {
      const moved = await takeBagItem(conn, userId, itemId, want, bound);
      if (moved <= 0) throw new Error('背包里没有这个道具');
      const alreadyStored = await conn.get(
        'SELECT count FROM player_storage_items WHERE user_id=? AND item_id=? AND is_bound=?',
        [userId, itemId, bound ? 1 : 0],
      );
      // 新格子才占容量：已有同道具格子时只加数量。
      if (!alreadyStored && await storageUsed(conn, userId) >= STORAGE_CAPACITY_20261009) {
        throw new Error(`储藏室已满（上限 ${STORAGE_CAPACITY_20261009} 格）`);
      }
      await addStorage(conn, userId, itemId, moved, bound);
      return { moved };
    });
    return res.json(await snapshot(userId, { moved: result.moved, direction: 'deposit' }));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '存入失败' });
  }
});

storageAuthorityRouter20261009.post('/storage/withdraw', async (req, res) => {
  const userId = Number(req.user.id);
  try {
    const itemId = int(req.body?.itemId);
    const bound = Boolean(req.body?.bound);
    const want = clampMove(req.body?.count);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new Error('道具无效');
    const result = await withTransaction(async (conn) => {
      const moved = await takeStorage(conn, userId, itemId, want, bound);
      if (moved <= 0) throw new Error('储藏室里没有这个道具');
      await addBagItem(conn, userId, itemId, moved, bound);
      return { moved };
    });
    return res.json(await snapshot(userId, { moved: result.moved, direction: 'withdraw' }));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '取出失败' });
  }
});
