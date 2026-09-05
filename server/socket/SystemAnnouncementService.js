import { db } from '../database.js';
import { roomManager } from '../rooms/RoomManager.js';

const STREAK_BROADCAST_MIN = 2;
const recentStrengthen = new Map();
const reportedPvpResult = new Set();

async function ensureTables() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS pvp_win_streaks (
      user_id BIGINT PRIMARY KEY,
      streak INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(async () => {
    // SQLite 对 BIGINT/TIMESTAMP 同样可接受；兜底保留更宽松定义。
    await db.run(`
      CREATE TABLE IF NOT EXISTS pvp_win_streaks (
        user_id INTEGER PRIMARY KEY,
        streak INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });
}

async function getStreak(userId) {
  const row = await db.get('SELECT streak FROM pvp_win_streaks WHERE user_id=?', [Number(userId)]);
  return Math.max(0, Number(row?.streak) || 0);
}

async function setStreak(userId, streak) {
  const id = Number(userId);
  const value = Math.max(0, Math.floor(Number(streak) || 0));
  const row = await db.get('SELECT user_id FROM pvp_win_streaks WHERE user_id=?', [id]);
  if (row) {
    await db.run('UPDATE pvp_win_streaks SET streak=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [value, id]);
  } else {
    await db.run('INSERT INTO pvp_win_streaks(user_id,streak) VALUES(?,?)', [id, value]);
  }
}

function emitAnnouncement(io, payload) {
  io.emit('system:announcement', {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    ...payload,
  });
}

/**
 * 世界播报：
 * - 卡牌强化到 6 星及以上；
 * - PVP 2 连胜起播报；
 * - 2 连胜及以上被打断时播报连胜中断。
 */
export function installSystemAnnouncementService(io) {
  void ensureTables().catch((error) => console.error('[announcement] init failed', error));

  io.on('connection', (socket) => {
    socket.on('system:announce:strengthen', (payload = {}, ack) => {
      try {
        const star = Math.max(0, Math.min(15, Math.floor(Number(payload.star) || 0)));
        if (star < 6) return typeof ack === 'function' && ack({ ok: true, announced: false });

        const now = Date.now();
        const last = recentStrengthen.get(Number(socket.user.id)) || 0;
        if (now - last < 1200) return typeof ack === 'function' && ack({ ok: true, announced: false });
        recentStrengthen.set(Number(socket.user.id), now);

        const cardName = String(payload.cardName || `卡牌#${Number(payload.cardId) || '?'}`).trim().slice(0, 32);
        const nickname = String(socket.user.nickname || socket.user.username || '勇士').slice(0, 24);
        emitAnnouncement(io, {
          kind: 'strengthen',
          title: '强化捷报',
          text: `恭喜 ${nickname} 将「${cardName}」成功强化至 ${star} 星！`,
          userId: Number(socket.user.id),
          star,
          cardId: Number(payload.cardId) || null,
        });
        if (typeof ack === 'function') ack({ ok: true, announced: true });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, message: error.message || '播报失败' });
      }
    });

    socket.on('pvp:result-report', async (payload = {}, ack) => {
      try {
        const userId = Number(socket.user.id);
        const room = roomManager.getRoomByUser(userId);
        if (!room || room.mode !== 'pvp') throw new Error('当前不在 PVP 房间中');
        const member = room.members.get(userId);
        if (!member || member.isBot) throw new Error('PVP 成员状态无效');

        const reportKey = `${room.id}:${userId}`;
        if (reportedPvpResult.has(reportKey)) {
          if (typeof ack === 'function') ack({ ok: true, duplicate: true });
          return;
        }
        reportedPvpResult.add(reportKey);
        setTimeout(() => reportedPvpResult.delete(reportKey), 6 * 60 * 60 * 1000).unref?.();

        const won = Boolean(payload.won);
        const previous = await getStreak(userId);
        const nickname = String(socket.user.nickname || socket.user.username || '勇士').slice(0, 24);

        if (won) {
          const next = previous + 1;
          await setStreak(userId, next);
          if (next >= STREAK_BROADCAST_MIN) {
            emitAnnouncement(io, {
              kind: 'win-streak',
              title: `${next} 连胜`,
              text: `${nickname} 已取得 ${next} 连胜，气势正盛！`,
              userId,
              streak: next,
            });
          }
          if (typeof ack === 'function') ack({ ok: true, streak: next });
          return;
        }

        await setStreak(userId, 0);
        if (previous >= STREAK_BROADCAST_MIN) {
          const opponents = [...room.members.values()]
            .filter((m) => m.team !== member.team && m.isBot !== true)
            .map((m) => m.nickname)
            .filter(Boolean);
          const breaker = opponents.length ? opponents.join('、') : '对方阵营';
          emitAnnouncement(io, {
            kind: 'streak-ended',
            title: '连胜中断',
            text: `${breaker} 终结了 ${nickname} 的 ${previous} 连胜！`,
            userId,
            streak: previous,
          });
        }
        if (typeof ack === 'function') ack({ ok: true, streak: 0, ended: previous });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, message: error.message || '记录失败' });
      }
    });
  });
}
