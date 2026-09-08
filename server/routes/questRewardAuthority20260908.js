import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { grantPlayerExp } from '../../src/core/PlayerProgression.js';
import { readPlayerItems20260908 } from '../domain/playerInventoryAuthority20260908.js';
import { readCardInventory } from './cardInventoryPersistence20260906.js';

export const questRewardAuthorityRouter20260908 = Router();
questRewardAuthorityRouter20260908.use(requireAuth);

const CATEGORIES = new Set(['main', 'side', 'daily', 'weekly', 'achievement', 'challenge', 'level']);
const MAX_REWARD_CURRENCY = 2_000_000;
const MAX_REWARD_EXP = 2_000_000;
const MAX_ITEM_COUNT = 9999;
let readyPromise = null;

async function ensureClaimTable() {
  if (!readyPromise) {
    readyPromise = db.run(`CREATE TABLE IF NOT EXISTS player_quest_reward_claims (
      user_id BIGINT NOT NULL,
      category VARCHAR(32) NOT NULL,
      quest_id VARCHAR(128) NOT NULL,
      claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, category, quest_id)
    )`).catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  await readyPromise;
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeIdentity(body) {
  const category = String(body?.category || '').trim();
  const questId = String(body?.questId || '').trim().slice(0, 128);
  if (!CATEGORIES.has(category)) throw new Error('任务分类无效');
  if (!questId) throw new Error('任务ID无效');
  return { category, questId };
}

function normalizeReward(raw) {
  const reward = raw && typeof raw === 'object' ? raw : {};
  const cards = Array.isArray(reward.cards)
    ? reward.cards.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id < 500).slice(0, 20)
    : [];
  const items = Array.isArray(reward.items)
    ? reward.items.map((entry) => ({
      itemId: Number(entry?.id ?? entry?.itemId),
      count: clampInt(entry?.count ?? 1, 1, MAX_ITEM_COUNT),
    })).filter((entry) => Number.isInteger(entry.itemId) && entry.itemId > 0).slice(0, 50)
    : [];
  return {
    gold: clampInt(reward.gold, 0, MAX_REWARD_CURRENCY),
    diamond: clampInt(reward.gem ?? reward.diamond, 0, MAX_REWARD_CURRENCY),
    honor: clampInt(reward.honor, 0, MAX_REWARD_CURRENCY),
    exp: clampInt(reward.exp, 0, MAX_REWARD_EXP),
    cards,
    items,
  };
}

async function addItem(conn, userId, itemId, count) {
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
    [userId, itemId],
  );
  if (row) {
    await conn.run(
      'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0',
      [count, userId, itemId],
    );
  } else {
    await conn.run(
      'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)',
      [userId, itemId, count],
    );
  }
}

async function addCard(conn, userId, cardId) {
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const slotCount = Math.max(1, Math.min(500, Number(bag?.slotCount) || 200));
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=?', [userId]);
  const occupied = new Set(rows.map((row) => Number(row.slotIndex)));
  let slotIndex = -1;
  for (let index = 0; index < slotCount; index += 1) {
    if (!occupied.has(index)) { slotIndex = index; break; }
  }
  if (slotIndex < 0) throw new Error('卡牌背包已满，任务奖励未领取');
  await conn.run(
    'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
    [userId, slotIndex, cardId, 0, 1],
  );
}

async function readProfile(userId) {
  return db.get(`
    SELECT user_id AS userId, nickname, level, exp, hp, gold,
           diamond, honor, arena, selected_deck_no AS selectedDeckNo
    FROM player_profiles WHERE user_id=?
  `, [userId]);
}

questRewardAuthorityRouter20260908.post('/quests/claim-reward', async (req, res) => {
  const userId = Number(req.user.id);
  try {
    await ensureClaimTable();
    const { category, questId } = normalizeIdentity(req.body);
    const reward = normalizeReward(req.body?.reward);

    await withTransaction(async (conn) => {
      const existing = await conn.get(
        'SELECT 1 AS claimed FROM player_quest_reward_claims WHERE user_id=? AND category=? AND quest_id=?',
        [userId, category, questId],
      );
      if (existing) throw new Error('该任务奖励已经领取');

      const profile = await conn.get('SELECT level, exp FROM player_profiles WHERE user_id=?', [userId]);
      if (!profile) throw new Error('玩家数据不存在');
      const progress = { level: Number(profile.level) || 1, exp: Number(profile.exp) || 0 };
      if (reward.exp > 0) grantPlayerExp(progress, reward.exp);

      await conn.run(`
        UPDATE player_profiles
        SET gold=gold+?, diamond=diamond+?, honor=honor+?, level=?, exp=?, updated_at=CURRENT_TIMESTAMP
        WHERE user_id=?
      `, [reward.gold, reward.diamond, reward.honor, progress.level, progress.exp, userId]);

      for (const cardId of reward.cards) await addCard(conn, userId, cardId);
      for (const item of reward.items) await addItem(conn, userId, item.itemId, item.count);

      await conn.run(
        'INSERT INTO player_quest_reward_claims(user_id,category,quest_id) VALUES(?,?,?)',
        [userId, category, questId],
      );

      const legacyQuestId = `${category}:${questId}`;
      const legacy = await conn.get('SELECT quest_id FROM player_quests WHERE user_id=? AND quest_id=?', [userId, legacyQuestId]);
      if (legacy) {
        await conn.run('UPDATE player_quests SET claimed=1, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND quest_id=?', [userId, legacyQuestId]);
      } else {
        await conn.run(
          'INSERT INTO player_quests(user_id,quest_id,progress,claimed) VALUES(?,?,0,1)',
          [userId, legacyQuestId],
        );
      }
    });

    return res.json({
      ok: true,
      profile: await readProfile(userId),
      items: await readPlayerItems20260908(userId),
      cardInventory: await readCardInventory(userId),
    });
  } catch (error) {
    const message = error?.message || '领取任务奖励失败';
    return res.status(message.includes('已经领取') ? 409 : 400).json({ message });
  }
});
