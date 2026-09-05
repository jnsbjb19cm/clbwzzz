import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const guildWarehouseGridRouter = Router();
guildWarehouseGridRouter.use(requireAuth);

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function requireGuildMember(req, res, guildId) {
  const row = await db.get(
    'SELECT guild_id AS guildId FROM guild_members WHERE guild_id=? AND user_id=?',
    [guildId, req.user.id],
  );
  if (!row) {
    res.status(403).json({ message: '只有本公会成员可以使用仓库' });
    return false;
  }
  return true;
}

/** 左侧“我的背包”：公会仓库只允许流通非绑定物品，避免绑定物品通过仓库洗成可交易物品。 */
guildWarehouseGridRouter.get('/:guildId/warehouse/my-items', async (req, res) => {
  const guildId = Number(req.params.guildId);
  if (!await requireGuildMember(req, res, guildId)) return;
  const rows = await db.all(`
    SELECT item_id AS itemId, SUM(count) AS count
    FROM player_items
    WHERE user_id=? AND is_bound=0 AND count>0
    GROUP BY item_id
    ORDER BY item_id
  `, [req.user.id]);
  return res.json({ ok: true, items: rows });
});

guildWarehouseGridRouter.post('/:guildId/warehouse/deposit', async (req, res) => {
  const guildId = Number(req.params.guildId);
  if (!await requireGuildMember(req, res, guildId)) return;
  const itemId = clampInt(req.body.itemId, 1, 100_000);
  const count = clampInt(req.body.count, 1, 10_000);
  const owned = await db.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
    [req.user.id, itemId],
  );
  if (!owned || Number(owned.count) < count) return res.status(400).json({ message: '可存入的非绑定道具不足' });

  await withTransaction(async (conn) => {
    await conn.run(
      'UPDATE player_items SET count=count-? WHERE user_id=? AND item_id=? AND is_bound=0',
      [count, req.user.id, itemId],
    );
    const existing = await conn.get(
      'SELECT count FROM guild_warehouse WHERE guild_id=? AND item_id=?',
      [guildId, itemId],
    );
    if (existing) {
      await conn.run(
        'UPDATE guild_warehouse SET count=count+?, updated_at=CURRENT_TIMESTAMP WHERE guild_id=? AND item_id=?',
        [count, guildId, itemId],
      );
    } else {
      await conn.run(
        'INSERT INTO guild_warehouse(guild_id,item_id,count) VALUES(?,?,?)',
        [guildId, itemId, count],
      );
    }
  });
  return res.json({ ok: true });
});

guildWarehouseGridRouter.post('/:guildId/warehouse/withdraw', async (req, res) => {
  const guildId = Number(req.params.guildId);
  if (!await requireGuildMember(req, res, guildId)) return;
  const itemId = clampInt(req.body.itemId, 1, 100_000);
  const count = clampInt(req.body.count, 1, 10_000);
  const stored = await db.get(
    'SELECT count FROM guild_warehouse WHERE guild_id=? AND item_id=?',
    [guildId, itemId],
  );
  if (!stored || Number(stored.count) < count) return res.status(400).json({ message: '仓库道具不足' });

  await withTransaction(async (conn) => {
    await conn.run(
      'UPDATE guild_warehouse SET count=count-?, updated_at=CURRENT_TIMESTAMP WHERE guild_id=? AND item_id=?',
      [count, guildId, itemId],
    );
    const existing = await conn.get(
      'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
      [req.user.id, itemId],
    );
    if (existing) {
      await conn.run(
        'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0',
        [count, req.user.id, itemId],
      );
    } else {
      await conn.run(
        'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)',
        [req.user.id, itemId, count],
      );
    }
  });
  return res.json({ ok: true });
});
