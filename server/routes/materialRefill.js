import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const materialRefillRouter = Router();
materialRefillRouter.use(requireAuth);

const DAILY_LIMIT = 500;
const GRANT_PER_ITEM = 100;

// 强化粉 + 铁匠铺全部制作/加工材料。补发来源统一为绑定。
const REFILL_ITEM_IDS = Object.freeze([
  10001, 10002, 10003, 10004, 10005,
  30055,
  50001, 50002, 50003, 50004,
  50011, 50012, 50013, 50014,
  50021, 50022, 50023, 50024,
  50031, 50032, 50033, 50034,
  50041,
]);

let refillTableReady = null;
const userClaimQueue = new Map();

function chinaDateKey(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function ensureRefillTable() {
  if (!refillTableReady) {
    refillTableReady = db.run(`
      CREATE TABLE IF NOT EXISTS material_refill_daily (
        user_id BIGINT NOT NULL,
        claim_date VARCHAR(10) NOT NULL,
        claim_count INT NOT NULL DEFAULT 0,
        PRIMARY KEY(user_id, claim_date)
      )
    `).catch((error) => {
      refillTableReady = null;
      throw error;
    });
  }
  await refillTableReady;
}

function runPerUser(userId, task) {
  const key = String(userId);
  const previous = userClaimQueue.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  userClaimQueue.set(key, next);
  return next.finally(() => {
    if (userClaimQueue.get(key) === next) userClaimQueue.delete(key);
  });
}

materialRefillRouter.get('/material-refill', async (req, res) => {
  await ensureRefillTable();
  const dateKey = chinaDateKey();
  const row = await db.get(
    'SELECT claim_count AS claimCount FROM material_refill_daily WHERE user_id=? AND claim_date=?',
    [req.user.id, dateKey],
  );
  const claimCount = Math.max(0, Number(row?.claimCount) || 0);
  return res.json({
    ok: true,
    date: dateKey,
    claimCount,
    dailyLimit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - claimCount),
    perItem: GRANT_PER_ITEM,
  });
});

materialRefillRouter.post('/material-refill', async (req, res) => {
  await ensureRefillTable();
  const result = await runPerUser(req.user.id, async () => withTransaction(async (conn) => {
    const dateKey = chinaDateKey();
    const row = await conn.get(
      'SELECT claim_count AS claimCount FROM material_refill_daily WHERE user_id=? AND claim_date=?',
      [req.user.id, dateKey],
    );
    const current = Math.max(0, Number(row?.claimCount) || 0);
    if (current >= DAILY_LIMIT) {
      return { limited: true, dateKey, claimCount: current };
    }

    const nextCount = current + 1;
    if (row) {
      await conn.run(
        'UPDATE material_refill_daily SET claim_count=? WHERE user_id=? AND claim_date=?',
        [nextCount, req.user.id, dateKey],
      );
    } else {
      await conn.run(
        'INSERT INTO material_refill_daily(user_id,claim_date,claim_count) VALUES(?,?,?)',
        [req.user.id, dateKey, nextCount],
      );
    }

    for (const itemId of REFILL_ITEM_IDS) {
      const owned = await conn.get(
        'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=1',
        [req.user.id, itemId],
      );
      if (owned) {
        await conn.run(
          'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=1',
          [GRANT_PER_ITEM, req.user.id, itemId],
        );
      } else {
        await conn.run(
          'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,1)',
          [req.user.id, itemId, GRANT_PER_ITEM],
        );
      }
    }

    return { limited: false, dateKey, claimCount: nextCount };
  }));

  if (result.limited) {
    return res.status(429).json({
      message: `今日材料补发已达到 ${DAILY_LIMIT} 次上限`,
      date: result.dateKey,
      claimCount: result.claimCount,
      dailyLimit: DAILY_LIMIT,
      remaining: 0,
    });
  }

  return res.json({
    ok: true,
    date: result.dateKey,
    claimCount: result.claimCount,
    dailyLimit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - result.claimCount),
    perItem: GRANT_PER_ITEM,
    bound: true,
    items: REFILL_ITEM_IDS.map((itemId) => ({ itemId, count: GRANT_PER_ITEM, bound: true })),
  });
});
