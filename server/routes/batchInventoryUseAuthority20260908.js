import { Router } from 'express';
import { createRequire } from 'node:module';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { grantPlayerExp } from '../../src/core/PlayerProgression.js';
import { readPlayerItems20260908 } from '../domain/playerInventoryAuthority20260908.js';
import { readCardInventory } from './cardInventoryPersistence20260906.js';

const require = createRequire(import.meta.url);
const itemRows = require('../../src/data/item.json');
const cardRows = require('../../src/data/card.json');

export const batchInventoryUseAuthorityRouter20260908 = Router();
batchInventoryUseAuthorityRouter20260908.use(requireAuth);

const MAX_BATCH_COUNT = 327867;
const CARD_TARGET_ITEMS = new Set([80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91]);
const FIXED_GIFTS = new Map([
  [1, { gold: 5000 }],
  [2, { diamond: 10 }],
  [3, { honor: 5000 }],
  [4, { stamina: 6 }],
  [5, { exp: 200 }],
]);
const RANDOM_ITEM_POOL = [1, 2, 3, 4, 5, 10001, 10002, 30055];
const ITEM_DEFS = new Map(itemRows.map((row) => [Number(row.item_id), row]));
const EXPERIENCE_CARD_IDS = new Set([122, 123, 124]);
const COLLECTIBLE_CARDS = cardRows.filter((row) => (
  Number(row?.show_card) === 1
  && Number(row?.card_id) > 0
  && Number(row?.card_id) < 500
  && !EXPERIENCE_CARD_IDS.has(Number(row?.card_id))
));

let extraTablesReady = null;
async function ensureExtraTables() {
  if (!extraTablesReady) {
    extraTablesReady = Promise.all([
      db.run(`CREATE TABLE IF NOT EXISTS player_extra_resources (
        user_id BIGINT PRIMARY KEY,
        stamina INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.run(`CREATE TABLE IF NOT EXISTS player_item_bags (
        user_id BIGINT PRIMARY KEY,
        slot_count INTEGER NOT NULL DEFAULT 120
      )`),
    ]).catch((error) => {
      extraTablesReady = null;
      throw error;
    });
  }
  await extraTablesReady;
}

function clampInt(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

async function consumeItem(conn, userId, itemId, count, requestedBound) {
  const rows = await conn.all(`
    SELECT is_bound AS isBound, count
    FROM player_items
    WHERE user_id=? AND item_id=? AND count>0
    ORDER BY is_bound ASC
  `, [userId, itemId]);
  const candidates = requestedBound === null
    ? rows
    : rows.filter((row) => Boolean(row.isBound) === Boolean(requestedBound));
  const total = candidates.reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0);
  if (total < count) throw new Error(`道具数量不足：数据库仅有 ${total} 个`);

  let left = count;
  for (const row of candidates) {
    if (left <= 0) break;
    const available = Math.max(0, Number(row.count) || 0);
    const take = Math.min(left, available);
    const remaining = available - take;
    if (remaining > 0) {
      await conn.run(
        'UPDATE player_items SET count=? WHERE user_id=? AND item_id=? AND is_bound=?',
        [remaining, userId, itemId, row.isBound ? 1 : 0],
      );
    } else {
      await conn.run(
        'DELETE FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
        [userId, itemId, row.isBound ? 1 : 0],
      );
    }
    left -= take;
  }
}

async function addItem(conn, userId, itemId, count, bound = false) {
  const isBound = bound ? 1 : 0;
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, itemId, isBound],
  );
  if (row) {
    await conn.run(
      'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=?',
      [count, userId, itemId, isBound],
    );
  } else {
    await conn.run(
      'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,?)',
      [userId, itemId, count, isBound],
    );
  }
}

function pickWeightedCard(maxQuality) {
  const maxQ = clampInt(maxQuality, 1, 5);
  const pool = COLLECTIBLE_CARDS.filter((card) => clampInt(card.card_quality, 1, 5) <= maxQ);
  if (!pool.length) throw new Error('卡池为空');
  const weights = pool.map((card) => Math.max(1, maxQ - clampInt(card.card_quality, 1, 5) + 1));
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[pool.length - 1];
}

async function addCards(conn, userId, count, maxQuality) {
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const slotCount = clampInt(bag?.slotCount, 1, 500);
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=?', [userId]);
  const occupied = new Set(rows.map((row) => Number(row.slotIndex)));
  const free = [];
  for (let index = 0; index < slotCount && free.length < count; index += 1) {
    if (!occupied.has(index)) free.push(index);
  }
  if (free.length < count) throw new Error(`卡牌背包空间不足，需要 ${count} 个空位`);

  const cards = [];
  for (let index = 0; index < count; index += 1) {
    const card = pickWeightedCard(maxQuality);
    await conn.run(
      'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
      [userId, free[index], Number(card.card_id), 0, 1],
    );
    cards.push({ cardId: Number(card.card_id), cardName: String(card.card_name || card.card_id) });
  }
  return cards;
}

async function buildResponse(userId, extras = {}) {
  const profile = await db.get(`
    SELECT user_id AS userId, nickname, level, exp, hp, gold,
           diamond, honor, arena, selected_deck_no AS selectedDeckNo
    FROM player_profiles WHERE user_id=?
  `, [userId]);
  const extra = await db.get('SELECT stamina FROM player_extra_resources WHERE user_id=?', [userId]);
  const bag = await db.get('SELECT slot_count AS slotCount FROM player_item_bags WHERE user_id=?', [userId]);
  return {
    ok: true,
    ...extras,
    profile,
    items: await readPlayerItems20260908(userId),
    itemBag: { slotCount: Math.max(120, Number(bag?.slotCount) || 120) },
    extraResources: { stamina: Math.max(0, Number(extra?.stamina) || 0) },
  };
}

batchInventoryUseAuthorityRouter20260908.post('/inventory/use', async (req, res, next) => {
  const requestedCount = clampInt(req.body?.count ?? 1, 1, MAX_BATCH_COUNT);
  if (requestedCount <= 1) return next();

  await ensureExtraTables();
  const userId = Number(req.user.id);
  const itemId = Number(req.body?.itemId);
  const requestedBound = req.body?.bound === true ? true : req.body?.bound === false ? false : null;
  const def = ITEM_DEFS.get(itemId);
  if (!def) return res.status(400).json({ message: '道具配置不存在' });
  if (CARD_TARGET_ITEMS.has(itemId)) {
    return res.status(400).json({ message: '该道具需要逐个选择目标，不能批量使用' });
  }
  if (itemId === 92) {
    return res.status(400).json({ message: '背包扩容符请逐个使用，避免超过容量上限' });
  }

  try {
    const result = await withTransaction(async (conn) => {
      const fixed = FIXED_GIFTS.get(itemId);
      if (fixed) {
        await consumeItem(conn, userId, itemId, requestedCount, requestedBound);
        if (fixed.gold) {
          await conn.run(
            'UPDATE player_profiles SET gold=gold+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
            [fixed.gold * requestedCount, userId],
          );
        }
        if (fixed.diamond) {
          await conn.run(
            'UPDATE player_profiles SET diamond=diamond+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
            [fixed.diamond * requestedCount, userId],
          );
        }
        if (fixed.honor) {
          await conn.run(
            'UPDATE player_profiles SET honor=honor+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
            [fixed.honor * requestedCount, userId],
          );
        }
        if (fixed.exp) {
          const current = await conn.get('SELECT level, exp FROM player_profiles WHERE user_id=?', [userId]);
          const player = { level: Number(current?.level) || 1, exp: Number(current?.exp) || 0 };
          grantPlayerExp(player, fixed.exp * requestedCount);
          await conn.run(
            'UPDATE player_profiles SET level=?, exp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
            [player.level, player.exp, userId],
          );
        }
        if (fixed.stamina) {
          const amount = fixed.stamina * requestedCount;
          const current = await conn.get('SELECT stamina FROM player_extra_resources WHERE user_id=?', [userId]);
          if (current) {
            await conn.run(
              'UPDATE player_extra_resources SET stamina=stamina+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
              [amount, userId],
            );
          } else {
            await conn.run('INSERT INTO player_extra_resources(user_id,stamina) VALUES(?,?)', [userId, amount]);
          }
        }
        return { used: requestedCount, message: `已使用 ${requestedCount} 个道具` };
      }

      const fn = Number(def.function);
      const showType = String(def.show_type ?? '');
      if (fn === 13 || /卡包|卡蛋/.test(showType)) {
        const cards = await addCards(conn, userId, requestedCount, def.quality ?? 2);
        await consumeItem(conn, userId, itemId, requestedCount, requestedBound);
        return { used: requestedCount, cards, message: `已打开 ${requestedCount} 个卡包` };
      }

      if (fn === 1 && /礼盒/.test(showType)) {
        await consumeItem(conn, userId, itemId, requestedCount, requestedBound);
        const rewards = new Map();
        for (let index = 0; index < requestedCount; index += 1) {
          const rewardId = RANDOM_ITEM_POOL[Math.floor(Math.random() * RANDOM_ITEM_POOL.length)];
          rewards.set(rewardId, (rewards.get(rewardId) ?? 0) + 1);
        }
        for (const [rewardId, count] of rewards) await addItem(conn, userId, rewardId, count, false);
        return {
          used: requestedCount,
          rewards: [...rewards].map(([rewardItemId, count]) => ({ rewardItemId, count })),
          message: `已打开 ${requestedCount} 个礼盒`,
        };
      }

      throw new Error('该道具不支持批量使用');
    });

    const response = await buildResponse(userId, result);
    if (result.cards?.length) response.cardInventory = await readCardInventory(userId);
    return res.json(response);
  } catch (error) {
    return res.status(400).json({ message: error?.message || '批量使用失败' });
  }
});
