import { Router } from 'express';
import { db } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { isOnline } from '../online.js';

export const socialSearchFixRouter = Router();
socialSearchFixRouter.use(requireAuth);

/**
 * 好友搜索最终入口：
 * - 支持玩家数字 ID 精确搜索；
 * - 支持登录账号 / 游戏昵称模糊搜索；
 * - 不依赖 ESCAPE '\\' 的 SQL 方言差异，兼容 MySQL 与 SQLite；
 * - 该路由必须挂在旧 socialRouter 前面，以覆盖旧 /search。
 */
socialSearchFixRouter.get('/search', async (req, res) => {
  const query = String(req.query.q ?? '').trim().slice(0, 64);
  if (!query) return res.json({ ok: true, results: [] });

  const numericId = /^\d{1,18}$/.test(query) ? Number(query) : -1;
  const like = `%${query}%`;
  const rows = await db.all(`
    SELECT u.id AS userId, u.username, p.nickname, p.level, p.honor, p.arena
    FROM users u
    JOIN player_profiles p ON p.user_id = u.id
    WHERE u.id <> ?
      AND (
        u.id = ?
        OR LOWER(u.username) LIKE LOWER(?)
        OR LOWER(COALESCE(p.nickname, '')) LIKE LOWER(?)
      )
    ORDER BY
      CASE
        WHEN u.id = ? THEN 0
        WHEN LOWER(u.username) = LOWER(?) THEN 1
        WHEN LOWER(COALESCE(p.nickname, '')) = LOWER(?) THEN 2
        ELSE 3
      END,
      p.level DESC,
      u.id ASC
    LIMIT 30
  `, [req.user.id, numericId, like, like, numericId, query, query]);

  return res.json({
    ok: true,
    query,
    results: rows.map((row) => ({
      ...row,
      online: isOnline(row.userId),
    })),
  });
});
