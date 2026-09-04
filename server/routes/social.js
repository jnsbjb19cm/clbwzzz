import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { isOnline } from '../online.js';

export const socialRouter = Router();
socialRouter.use(requireAuth);

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function publicProfile(userId) {
  return db.get(`
    SELECT u.id AS userId, u.username,
           p.nickname, p.level, p.honor, p.arena, p.gold, p.diamond,
           p.selected_deck_no AS selectedDeckNo
    FROM users u
    JOIN player_profiles p ON p.user_id = u.id
    WHERE u.id = ?
  `, [Number(userId)]);
}

async function friendCards(userId) {
  const rows = await db.all(`
    SELECT card_id AS cardId, star, craft_quality AS craftQuality
    FROM player_cards
    WHERE user_id=?
    ORDER BY slot_index
  `, [Number(userId)]);
  return rows;
}

async function areFriends(a, b) {
  const row = await db.get(
    'SELECT 1 AS x FROM friends WHERE user_id=? AND friend_id=?',
    [Number(a), Number(b)],
  );
  return Boolean(row);
}

socialRouter.get('/friends', async (req, res) => {
  const rows = await db.all(`
    SELECT f.friend_id AS userId, u.username, p.nickname, p.level, p.honor, p.arena,
           p.gold, p.diamond
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    JOIN player_profiles p ON p.user_id = f.friend_id
    WHERE f.user_id=?
    ORDER BY p.nickname
  `, [req.user.id]);
  const friends = rows.map((row) => ({
    ...row,
    online: isOnline(row.userId),
  }));
  return res.json({ ok: true, friends });
});

socialRouter.get('/requests', async (req, res) => {
  const rows = await db.all(`
    SELECT fr.id AS requestId, fr.sender_id AS userId, u.username,
           p.nickname, p.level
    FROM friend_requests fr
    JOIN users u ON u.id = fr.sender_id
    JOIN player_profiles p ON p.user_id = fr.sender_id
    WHERE fr.receiver_id=? AND fr.status='pending'
    ORDER BY fr.created_at DESC
  `, [req.user.id]);
  return res.json({ ok: true, requests: rows.map((row) => ({ ...row, online: isOnline(row.userId) })) });
});

socialRouter.post('/friends/request', async (req, res) => {
  const targetId = clampInt(req.body.userId, 1, 2_000_000_000);
  if (targetId === Number(req.user.id)) {
    return res.status(400).json({ message: '不能添加自己为好友' });
  }
  const target = await publicProfile(targetId);
  if (!target) return res.status(404).json({ message: '玩家不存在' });

  if (await areFriends(req.user.id, targetId)) {
    return res.status(409).json({ message: '你们已经是好友' });
  }

  const existing = await db.get(
    'SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status="pending"',
    [req.user.id, targetId],
  );
  if (existing) return res.status(409).json({ message: '好友申请已发送，等待对方处理' });

  const reverse = await db.get(
    'SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status="pending"',
    [targetId, req.user.id],
  );
  if (reverse) {
    // 对方已经申请过你：直接接受
    await withTransaction(async (conn) => {
      await conn.run(
        'UPDATE friend_requests SET status="accepted" WHERE id=?',
        [reverse.id],
      );
      await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [req.user.id, targetId]);
      await conn.run('INSERT INTO friends(user_id,friend_id) VALUES(?,?)', [req.user.id, targetId]);
      await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [targetId, req.user.id]);
      await conn.run('INSERT INTO friends(user_id,friend_id) VALUES(?,?)', [targetId, req.user.id]);
    });
    return res.json({ ok: true, requestId: reverse.id, accepted: true });
  }

  await db.run(
    'INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES(?,?,"pending")',
    [req.user.id, targetId],
  );
  return res.json({ ok: true, requested: true, target }); 
});

socialRouter.post('/friends/accept', async (req, res) => {
  const requestId = clampInt(req.body.requestId, 1, 2_000_000_000);
  const request = await db.get(
    'SELECT * FROM friend_requests WHERE id=? AND receiver_id=? AND status="pending"',
    [requestId, req.user.id],
  );
  if (!request) return res.status(404).json({ message: '好友申请不存在或已处理' });

  await withTransaction(async (conn) => {
    await conn.run('UPDATE friend_requests SET status="accepted" WHERE id=?', [requestId]);
    await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [req.user.id, request.sender_id]);
    await conn.run('INSERT INTO friends(user_id,friend_id) VALUES(?,?)', [req.user.id, request.sender_id]);
    await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [request.sender_id, req.user.id]);
    await conn.run('INSERT INTO friends(user_id,friend_id) VALUES(?,?)', [request.sender_id, req.user.id]);
  });
  return res.json({ ok: true });
});

socialRouter.delete('/friends/:userId', async (req, res) => {
  const targetId = Number(req.params.userId);
  if (!Number.isFinite(targetId)) return res.status(400).json({ message: '参数无效' });
  await withTransaction(async (conn) => {
    await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [req.user.id, targetId]);
    await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [targetId, req.user.id]);
  });
  return res.json({ ok: true });
});

socialRouter.get('/players/:userId', async (req, res) => {
  const targetId = Number(req.params.userId);
  if (!Number.isFinite(targetId)) return res.status(400).json({ message: '参数无效' });
  const profile = await publicProfile(targetId);
  if (!profile) return res.status(404).json({ message: '玩家不存在' });

  const isFriend = targetId === Number(req.user.id) || await areFriends(req.user.id, targetId);
  const cards = isFriend ? await friendCards(targetId) : [];
  return res.json({
    ok: true,
    profile: { ...profile, online: isOnline(targetId) },
    cards,
  });
});

socialRouter.get('/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ ok: true, results: [] });
  const like = `%${query.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
  const rows = await db.all(`
    SELECT u.id AS userId, u.username, p.nickname, p.level, p.honor, p.arena
    FROM users u
    JOIN player_profiles p ON p.user_id=u.id
    WHERE u.username LIKE ? ESCAPE '\\' OR p.nickname LIKE ? ESCAPE '\\'
    LIMIT 20
  `, [like, like]);
  return res.json({
    ok: true,
    results: rows
      .filter((row) => Number(row.userId) !== Number(req.user.id))
      .map((row) => ({ ...row, online: isOnline(row.userId) })),
  });
});

socialRouter.get('/hall-of-fame', async (req, res) => {
  const honor = await db.all(`
    SELECT u.id AS userId, p.nickname, p.level, p.honor, p.arena,
           p.gold, p.diamond
    FROM player_profiles p
    JOIN users u ON u.id=p.user_id
    WHERE p.honor > 0
    ORDER BY p.honor DESC, p.updated_at ASC
    LIMIT 50
  `);

  const fastest = await db.all(`
    SELECT s.stage_id AS stageId, s.best_time_ms AS bestTimeMs,
           u.id AS userId, p.nickname, p.level
    FROM player_stage_progress s
    JOIN users u ON u.id=s.user_id
    JOIN player_profiles p ON p.user_id=s.user_id
    WHERE s.cleared=1 AND s.best_time_ms > 0
    ORDER BY s.best_time_ms ASC
    LIMIT 50
  `);

  const adventure = await db.all(`
    SELECT u.id AS userId, p.nickname, p.level, p.honor,
           COALESCE(SUM(s.cleared), 0) AS clearedStages,
           COUNT(s.stage_id) AS totalRecordedStages
    FROM users u
    JOIN player_profiles p ON p.user_id=u.id
    LEFT JOIN player_stage_progress s ON s.user_id=u.id AND s.cleared=1
    GROUP BY u.id
    ORDER BY clearedStages DESC, p.honor DESC
    LIMIT 50
  `);

  return res.json({
    ok: true,
    honor: honor.map((row) => ({ ...row, online: isOnline(row.userId) })),
    fastest: fastest.map((row) => ({ ...row, online: isOnline(row.userId) })),
    adventure: adventure.map((row) => ({ ...row, online: isOnline(row.userId) })),
  });
});
