import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const socialFriendFixRouter = Router();
socialFriendFixRouter.use(requireAuth);

function asUserId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function publicProfile(userId) {
  return db.get(`
    SELECT u.id AS userId, u.username, p.nickname, p.level, p.honor, p.arena
    FROM users u
    JOIN player_profiles p ON p.user_id = u.id
    WHERE u.id = ?
  `, [userId]);
}

async function areFriends(a, b) {
  const row = await db.get(
    'SELECT 1 AS x FROM friends WHERE user_id=? AND friend_id=? LIMIT 1',
    [a, b],
  );
  return Boolean(row);
}

async function writeFriendPair(conn, a, b) {
  // 先删后插：兼容 SQLite/MySQL，不依赖 INSERT OR IGNORE / ON DUPLICATE KEY 方言。
  await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [a, b]);
  await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [b, a]);
  await conn.run('INSERT INTO friends(user_id,friend_id) VALUES(?,?)', [a, b]);
  await conn.run('INSERT INTO friends(user_id,friend_id) VALUES(?,?)', [b, a]);
}

/**
 * 覆盖旧好友申请接口：
 * 旧表 UNIQUE(sender_id, receiver_id) 会保留 accepted/rejected 历史记录，
 * 删除好友以后再次添加时直接 INSERT 会撞唯一键，表现为“搜得到但加不了”。
 * 这里复用历史记录而不是重复 INSERT，并处理反向待处理申请。
 */
socialFriendFixRouter.post('/friends/request', async (req, res) => {
  const senderId = asUserId(req.user?.id);
  const targetId = asUserId(req.body?.userId);
  if (!senderId || !targetId) return res.status(400).json({ message: '玩家参数无效' });
  if (senderId === targetId) return res.status(400).json({ message: '不能添加自己为好友' });

  const target = await publicProfile(targetId);
  if (!target) return res.status(404).json({ message: '玩家不存在' });
  if (await areFriends(senderId, targetId)) {
    return res.status(409).json({ message: '你们已经是好友' });
  }

  const result = await withTransaction(async (conn) => {
    const reverse = await conn.get(
      "SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status='pending' LIMIT 1",
      [targetId, senderId],
    );
    if (reverse) {
      await conn.run("UPDATE friend_requests SET status='accepted' WHERE id=?", [reverse.id]);
      // 清理本方向旧的 accepted/rejected 记录，避免唯一键长期阻塞后续操作。
      await conn.run(
        'DELETE FROM friend_requests WHERE sender_id=? AND receiver_id=?',
        [senderId, targetId],
      );
      await writeFriendPair(conn, senderId, targetId);
      return { accepted: true, requestId: reverse.id };
    }

    const existing = await conn.get(
      'SELECT id, status FROM friend_requests WHERE sender_id=? AND receiver_id=? LIMIT 1',
      [senderId, targetId],
    );
    if (existing?.status === 'pending') {
      return { duplicate: true, requestId: existing.id };
    }
    if (existing) {
      await conn.run(
        "UPDATE friend_requests SET status='pending', created_at=CURRENT_TIMESTAMP WHERE id=?",
        [existing.id],
      );
      return { requested: true, requestId: existing.id, reused: true };
    }

    const inserted = await conn.run(
      "INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES(?,?,'pending')",
      [senderId, targetId],
    );
    return { requested: true, requestId: inserted.lastInsertRowid ?? inserted.insertId ?? null };
  });

  if (result.duplicate) {
    return res.status(409).json({ message: '好友申请已发送，等待对方处理', requestId: result.requestId });
  }
  return res.json({ ok: true, ...result, target });
});

socialFriendFixRouter.post('/friends/accept', async (req, res) => {
  const receiverId = asUserId(req.user?.id);
  const requestId = asUserId(req.body?.requestId);
  if (!receiverId || !requestId) return res.status(400).json({ message: '好友申请参数无效' });

  const result = await withTransaction(async (conn) => {
    const request = await conn.get(
      "SELECT id, sender_id AS senderId FROM friend_requests WHERE id=? AND receiver_id=? AND status='pending' LIMIT 1",
      [requestId, receiverId],
    );
    if (!request) return { missing: true };

    await conn.run("UPDATE friend_requests SET status='accepted' WHERE id=?", [requestId]);
    // 若双方恰好同时申请，将另一方向也收口为 accepted，避免残留“待接受”。
    await conn.run(
      "UPDATE friend_requests SET status='accepted' WHERE sender_id=? AND receiver_id=? AND status='pending'",
      [receiverId, request.senderId],
    );
    await writeFriendPair(conn, receiverId, Number(request.senderId));
    return { ok: true, friendUserId: Number(request.senderId) };
  });

  if (result.missing) return res.status(404).json({ message: '好友申请不存在或已处理' });
  return res.json(result);
});

socialFriendFixRouter.delete('/friends/:userId', async (req, res) => {
  const userId = asUserId(req.user?.id);
  const targetId = asUserId(req.params?.userId);
  if (!userId || !targetId) return res.status(400).json({ message: '参数无效' });

  await withTransaction(async (conn) => {
    await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [userId, targetId]);
    await conn.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', [targetId, userId]);
    // 删除两方向历史申请，保证删除好友以后能够重新添加。
    await conn.run(
      'DELETE FROM friend_requests WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)',
      [userId, targetId, targetId, userId],
    );
  });
  return res.json({ ok: true });
});
