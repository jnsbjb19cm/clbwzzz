import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { isOnline } from '../online.js';

export const guildRouter = Router();
guildRouter.use(requireAuth);

const GUILD_BONUS = [0.03, 0.05, 0.07, 0.10, 0.15]; // 等级1~5 合成/强化卡牌概率加成
const ROLES = new Set(['president', 'vice_president', 'elite', 'member']);
const ROLE_LABEL = {
  president: '会长',
  vice_president: '副会长',
  elite: '长老',
  member: '会员',
};

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function getUserMember(userId) {
  return db.get(`
    SELECT gm.guild_id AS guildId, gm.role, g.name AS guildName,
           g.level, g.notice, g.created_by AS createdBy
    FROM guild_members gm
    JOIN guilds g ON g.id=gm.guild_id
    WHERE gm.user_id=?
  `, [Number(userId)]);
}

guildRouter.get('/my', async (req, res) => {
  const my = await getUserMember(req.user.id);
  if (!my) return res.json({ ok: true, guild: null });
  return res.json({
    ok: true,
    guild: {
      ...my,
      craftStrengthBonus: GUILD_BONUS[Math.min(Math.max(my.level, 1), 5) - 1] ?? 0,
    },
  });
});

guildRouter.post('/create', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 16) {
    return res.status(400).json({ message: '公会名长度必须为2到16个字符' });
  }
  const existing = await getUserMember(req.user.id);
  if (existing) return res.status(409).json({ message: '你已经加入了公会' });

  const sameName = await db.get('SELECT id FROM guilds WHERE name=?', [name]);
  if (sameName) return res.status(409).json({ message: '公会名已存在' });

  const guildId = await withTransaction(async (conn) => {
    const result = await conn.run(
      'INSERT INTO guilds(name,notice,level,created_by) VALUES(?,?,1,?)',
      [name, '', req.user.id],
    );
    const id = result.lastInsertRowid ?? result.insertId;
    await conn.run(
      'INSERT INTO guild_members(guild_id,user_id,role) VALUES(?,?,"president")',
      [id, req.user.id],
    );
    return id;
  });

  return res.json({ ok: true, guildId, message: '公会创建成功，你是会长' });
});

guildRouter.post('/join', async (req, res) => {
  const guildId = clampInt(req.body.guildId, 1, 2_000_000_000);
  const my = await getUserMember(req.user.id);
  if (my) return res.status(409).json({ message: '你已经加入了公会' });
  const guild = await db.get('SELECT id FROM guilds WHERE id=?', [guildId]);
  if (!guild) return res.status(404).json({ message: '公会不存在' });
  await db.run('INSERT INTO guild_members(guild_id,user_id,role) VALUES(?,?,"member")', [guildId, req.user.id]);
  return res.json({ ok: true });
});

guildRouter.post('/leave', async (req, res) => {
  const my = await getUserMember(req.user.id);
  if (!my) return res.status(404).json({ message: '你不在公会中' });
  if (my.role === 'president') {
    const members = await db.all(
      'SELECT user_id AS userId FROM guild_members WHERE guild_id=? AND role!="president" ORDER BY joined_at LIMIT 1',
      [my.guildId],
    );
    if (!members.length) {
      // 无成员，直接解散
      await db.run('DELETE FROM guilds WHERE id=?', [my.guildId]);
      return res.json({ ok: true, message: '公会已解散' });
    }
    // 转让会长给最早加入的成员
    const next = members[0];
    await withTransaction(async (conn) => {
      await conn.run('UPDATE guild_members SET role="member" WHERE guild_id=? AND user_id=?', [my.guildId, req.user.id]);
      await conn.run('UPDATE guild_members SET role="president" WHERE guild_id=? AND user_id=?', [my.guildId, next.userId]);
    });
    return res.json({ ok: true, message: '会长已转让并退出成功' });
  }
  await db.run('DELETE FROM guild_members WHERE guild_id=? AND user_id=?', [my.guildId, req.user.id]);
  return res.json({ ok: true });
});

guildRouter.get('/:guildId/members', async (req, res) => {
  const guildId = Number(req.params.guildId);
  if (!Number.isFinite(guildId)) return res.status(400).json({ message: '参数无效' });
  const rows = await db.all(`
    SELECT gm.user_id AS userId, gm.role, gm.joined_at AS joinedAt,
           p.nickname, p.level, p.honor
    FROM guild_members gm
    JOIN player_profiles p ON p.user_id=gm.user_id
    WHERE gm.guild_id=?
    ORDER BY CASE gm.role
      WHEN 'president' THEN 0
      WHEN 'vice_president' THEN 1
      WHEN 'elite' THEN 2
      ELSE 3 END,
      gm.joined_at
  `, [guildId]);
  return res.json({
    ok: true,
    members: rows.map((row) => ({
      ...row,
      roleLabel: ROLE_LABEL[row.role] || row.role,
      online: isOnline(row.userId),
    })),
  });
});

guildRouter.post('/:guildId/promote', async (req, res) => {
  const guildId = Number(req.params.guildId);
  const my = await getUserMember(req.user.id);
  if (!my || my.guildId !== guildId || my.role !== 'president') {
    return res.status(403).json({ message: '只有会长可以调整职位' });
  }
  const userId = clampInt(req.body.userId, 1, 2_000_000_000);
  const role = String(req.body.role || 'member');
  if (!ROLES.has(role)) return res.status(400).json({ message: '职位无效' });
  if (role === 'president') return res.status(400).json({ message: '请用转让会长的逻辑' });
  const target = await db.get('SELECT user_id FROM guild_members WHERE guild_id=? AND user_id=?', [guildId, userId]);
  if (!target) return res.status(404).json({ message: '该成员不在公会' });
  await db.run('UPDATE guild_members SET role=? WHERE guild_id=? AND user_id=?', [role, guildId, userId]);
  return res.json({ ok: true });
});

guildRouter.get('/:guildId/warehouse', async (req, res) => {
  const guildId = Number(req.params.guildId);
  const rows = await db.all(`
    SELECT item_id AS itemId, count
    FROM guild_warehouse
    WHERE guild_id=? AND count>0
    ORDER BY item_id
  `, [guildId]);
  return res.json({ ok: true, items: rows });
});

guildRouter.post('/:guildId/warehouse/deposit', async (req, res) => {
  const guildId = Number(req.params.guildId);
  const my = await getUserMember(req.user.id);
  if (!my || my.guildId !== guildId) return res.status(403).json({ message: '只有本公会成员可以使用仓库' });
  const itemId = clampInt(req.body.itemId, 1, 100_000);
  const count = clampInt(req.body.count, 1, 10_000);
  const owned = await db.get('SELECT count FROM player_items WHERE user_id=? AND item_id=?', [req.user.id, itemId]);
  if (!owned || owned.count < count) return res.status(400).json({ message: '道具数量不足' });

  await withTransaction(async (conn) => {
    await conn.run('UPDATE player_items SET count=count-? WHERE user_id=? AND item_id=?', [count, req.user.id, itemId]);
    const existing = await conn.get('SELECT * FROM guild_warehouse WHERE guild_id=? AND item_id=?', [guildId, itemId]);
    if (existing) {
      await conn.run('UPDATE guild_warehouse SET count=count+?, updated_at=CURRENT_TIMESTAMP WHERE guild_id=? AND item_id=?', [count, guildId, itemId]);
    } else {
      await conn.run('INSERT INTO guild_warehouse(guild_id,item_id,count) VALUES(?,?,?)', [guildId, itemId, count]);
    }
  });
  return res.json({ ok: true });
});

guildRouter.post('/:guildId/warehouse/withdraw', async (req, res) => {
  const guildId = Number(req.params.guildId);
  const my = await getUserMember(req.user.id);
  if (!my || my.guildId !== guildId) return res.status(403).json({ message: '只有本公会成员可以使用仓库' });
  const itemId = clampInt(req.body.itemId, 1, 100_000);
  const count = clampInt(req.body.count, 1, 10_000);
  const stored = await db.get('SELECT * FROM guild_warehouse WHERE guild_id=? AND item_id=?', [guildId, itemId]);
  if (!stored || stored.count < count) return res.status(400).json({ message: '仓库道具不足' });

  await withTransaction(async (conn) => {
    await conn.run('UPDATE guild_warehouse SET count=count-?, updated_at=CURRENT_TIMESTAMP WHERE guild_id=? AND item_id=?', [count, guildId, itemId]);
    const existing = await conn.get('SELECT * FROM player_items WHERE user_id=? AND item_id=?', [req.user.id, itemId]);
    if (existing) {
      await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=?', [count, req.user.id, itemId]);
    } else {
      await conn.run('INSERT INTO player_items(user_id,item_id,count) VALUES(?,?,?)', [req.user.id, itemId, count]);
    }
  });
  return res.json({ ok: true });
});
