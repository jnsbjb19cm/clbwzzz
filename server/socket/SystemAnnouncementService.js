import { db, withTransaction } from '../database.js';

const STREAK_BROADCAST_MIN = 2;
let announcementIO = null;
let tablesReady = null;
let settlementQueue = Promise.resolve();

function ensureTables() {
  if (!tablesReady) {
    tablesReady = db.run(`
      CREATE TABLE IF NOT EXISTS pvp_win_streaks (
        user_id BIGINT PRIMARY KEY,
        streak INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => { tablesReady = null; throw error; });
  }
  return tablesReady;
}

function emitAnnouncement(io, payload) {
  if (!io) return;
  io.emit('system:announcement', {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    channel: 'system',
    ...payload,
  });
}

// Called only AFTER the smithy transaction has committed. Client-side craft and
// upgrade methods are bypassed by the authoritative HTTP actions.
export function announceSmithyResult(user, result, { fromCardName = '' } = {}) {
  if (!result || !announcementIO) return;
  const nickname = String(user.nickname || user.username || '勇士').slice(0, 24);
  const cardName = String(result.cardName || `卡牌#${result.cardId}`).slice(0, 48);
  const base = { userId: Number(user.id), cardId: Number(result.cardId) || null };
  if (result.outcome === 'ascend') {
    emitAnnouncement(announcementIO, {
      ...base,
      kind: 'craft-ascend', title: '造卡升变',
      text: `恭喜 ${nickname} 制作「${String(fromCardName || '目标卡牌').slice(0, 32)}」时触发升变，获得「${cardName}」！`,
      craftQuality: Number(result.craftQuality) || null,
    });
  } else if (result.success && (Number(result.star) >= 6 || result.double)) {
    emitAnnouncement(announcementIO, {
      ...base,
      kind: 'strengthen', title: result.double ? '强化升变' : '强化捷报',
      text: result.double
        ? `恭喜 ${nickname} 强化「${cardName}」时触发升变，成功提升至 ${result.star} 星！`
        : `恭喜 ${nickname} 将「${cardName}」成功强化至 ${result.star} 星！`,
      star: Number(result.star),
    });
  }
}

// One promise per authoritative battle, not per room. The captured roster remains
// valid even when a player leaves before the asynchronous settlement completes.
export function recordAuthorityPvpResult(io, room, entry) {
  const battle = entry?.battle;
  if (room?.mode !== 'pvp' || battle?.status !== 'finished'
    || !['blue', 'red'].includes(battle.winner)) return Promise.resolve();
  if (entry.announcementSettlement) return entry.announcementSettlement;
  const winner = battle.winner;
  const members = (entry.announcementMembers ?? [
    ...(battle.teamBlue ?? []).map((member) => ({ ...member, team: 'blue' })),
    ...(battle.teamRed ?? []).map((member) => ({ ...member, team: 'red' })),
  ]).filter((member) => Number.isInteger(Number(member.userId))
    && Number(member.userId) > 0 && !member.isBot);

  const settle = async () => {
    await ensureTables();
    const messages = await withTransaction(async (conn) => {
      const messages = [];
      // Lock in a stable order on MySQL; serialize announcement transactions on
      // SQLite. Counts for both teams commit together before any broadcast.
      for (const member of [...members].sort((a, b) => Number(a.userId) - Number(b.userId))) {
        const userId = Number(member.userId);
        await conn.run('UPDATE player_profiles SET user_id=user_id WHERE user_id=?', [userId]);
        const row = await conn.get('SELECT streak FROM pvp_win_streaks WHERE user_id=?', [userId]);
        const previous = Math.max(0, Number(row?.streak) || 0);
        const won = member.team === winner;
        const next = won ? previous + 1 : 0;
        if (row) {
          await conn.run('UPDATE pvp_win_streaks SET streak=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [next, userId]);
        } else {
          await conn.run('INSERT INTO pvp_win_streaks(user_id,streak) VALUES(?,?)', [userId, next]);
        }
        const nickname = String(member.nickname || member.username || '勇士').slice(0, 24);
        if (won && next >= STREAK_BROADCAST_MIN) {
          messages.push({
            kind: 'win-streak', title: `${next} 连胜`,
            text: `${nickname} 已取得 ${next} 连胜，气势正盛！`, userId, streak: next,
          });
        } else if (!won && previous >= STREAK_BROADCAST_MIN) {
          const breaker = members.filter((other) => other.team === winner)
            .map((other) => String(other.nickname || other.username || '勇士').slice(0, 24)).join('、') || '对方阵营';
          messages.push({
            kind: 'streak-ended', title: '连胜中断',
            text: `${breaker} 终结了 ${nickname} 的 ${previous} 连胜！`, userId, streak: previous,
          });
        }
      }
      return messages;
    });
    for (const message of messages) emitAnnouncement(io, message);
    return messages;
  };
  const pending = settlementQueue.then(settle);
  settlementQueue = pending.catch(() => {});
  entry.announcementSettlement = pending.catch((error) => {
    entry.announcementSettlement = null; // Allow retry after a rolled-back transaction.
    throw error;
  });
  return entry.announcementSettlement;
}

export function installSystemAnnouncementService(io) {
  announcementIO = io;
  void ensureTables().catch((error) => console.error('[announcement] init failed', error));
  io.on('connection', (socket) => {
    // Old clients may still report these events. Acknowledge without trusting or
    // counting them: the committed craft / server battle result is the authority.
    for (const event of ['system:announce:strengthen', 'system:announce:craft-ascend', 'pvp:result-report']) {
      socket.on(event, (_payload, ack) => {
        if (typeof ack === 'function') ack({ ok: true, announced: false, authoritative: true });
      });
    }
  });
}
