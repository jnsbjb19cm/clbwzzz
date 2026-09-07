import { Router } from 'express';
import { withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const guildUpgradeAuthorityRouter20260907 = Router();
guildUpgradeAuthorityRouter20260907.use(requireAuth);

const GUILD_UPGRADE_COST = Object.freeze({
  2: 20_000,
  3: 50_000,
  4: 100_000,
  5: 200_000,
});

function affectedRows(result) {
  return Number(result?.affectedRows ?? result?.changes ?? 0);
}

export async function performGuildUpgrade20260907(conn, userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) throw new Error('玩家数据无效');

  const member = await conn.get(`
    SELECT gm.guild_id AS guildId, gm.role, g.level
    FROM guild_members gm
    JOIN guilds g ON g.id=gm.guild_id
    WHERE gm.user_id=?
  `, [uid]);
  if (!member) throw new Error('你不在公会中');
  if (String(member.role || '').trim().toLowerCase() !== 'president') {
    throw new Error('只有会长可以升级公会');
  }

  const currentLevel = Number(member.level) || 1;
  if (currentLevel >= 5) throw new Error('公会已满级');
  const nextLevel = currentLevel + 1;
  const cost = GUILD_UPGRADE_COST[nextLevel];
  if (!cost) throw new Error('公会升级配置无效');

  // 钱包判定和扣款必须是同一条条件更新，不能先在事务外读余额再扣。
  const debit = await conn.run(`
    UPDATE player_profiles
    SET gold=gold-?, updated_at=CURRENT_TIMESTAMP
    WHERE user_id=? AND gold>=?
  `, [cost, uid, cost]);
  if (affectedRows(debit) !== 1) {
    throw new Error(`升级到Lv.${nextLevel}需要 ${cost} 金币`);
  }

  // 防止两个并发升级把公会跨级；失败会让整个事务回滚，包括上面的扣款。
  const levelUpdate = await conn.run(
    'UPDATE guilds SET level=? WHERE id=? AND level=?',
    [nextLevel, Number(member.guildId), currentLevel],
  );
  if (affectedRows(levelUpdate) !== 1) {
    throw new Error('公会等级已变化，请刷新后重试');
  }

  const wallet = await conn.get(
    'SELECT gold FROM player_profiles WHERE user_id=?',
    [uid],
  );
  return {
    level: nextLevel,
    cost,
    gold: Math.max(0, Number(wallet?.gold) || 0),
  };
}

guildUpgradeAuthorityRouter20260907.post('/upgrade', async (req, res) => {
  try {
    const result = await withTransaction((conn) => performGuildUpgrade20260907(conn, req.user.id));
    return res.json({ ok: true, ...result, wallet: { gold: result.gold } });
  } catch (error) {
    const message = error?.message || '公会升级失败';
    const status = message === '你不在公会中' ? 404
      : message === '只有会长可以升级公会' ? 403
        : 400;
    return res.status(status).json({ message });
  }
});
