import { pickExactTierCard } from '../../src/core/CardEgg.js';
import { Router } from 'express';
import { createRequire } from 'node:module';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { grantPlayerExp } from '../../src/core/PlayerProgression.js';
import { readPlayerItems20260908 } from '../domain/playerInventoryAuthority20260908.js';
import { readCardInventory } from './cardInventoryPersistence20260906.js';

const require = createRequire(import.meta.url);
const itemRows = require('../../src/data/item.json');
const functionalRows = require('../../src/data/functionalItems.json');
const craftMaterials = require('../../src/data/craftMaterials.json');
const cardRows = require('../../src/data/card.json');
const payRows = require('../../src/data/pay.json');
const packRows = require('../../src/data/tearPackageItem.json');
const expandRows = require('../../src/data/expandBag.json');

export const playerEconomyAuthorityRouter20260908 = Router();
playerEconomyAuthorityRouter20260908.use(requireAuth);

const ITEM_DEFS = new Map();
for (const row of [...itemRows, ...functionalRows, ...(craftMaterials.items ?? [])]) {
  const id = Number(row?.item_id ?? row?.id);
  if (Number.isInteger(id) && id > 0) ITEM_DEFS.set(id, row);
}
const EXPERIENCE_CARD_IDS = new Set([122, 123, 124]);
const COLLECTIBLE_CARDS = cardRows.filter((row) => (
  Number(row?.show_card) === 1
  && Number(row?.card_id) > 0
  && Number(row?.card_id) < 500
  && !EXPERIENCE_CARD_IDS.has(Number(row?.card_id))
));
const FIXED_GIFTS = new Map([
  [1, { gold: 5000 }],
  [2, { diamond: 10 }],
  [3, { honor: 5000 }],
  [4, { stamina: 6 }],
  [5, { exp: 200 }],
]);
const RANDOM_ITEM_POOL = [1, 2, 3, 4, 5, 10001, 10002, 30055];
const MAX_ITEM_COUNT = 327867;
const DEFAULT_ITEM_BAG_SLOTS = 120;
const MAX_ITEM_BAG_SLOTS = Math.max(
  DEFAULT_ITEM_BAG_SLOTS,
  ...expandRows.map((row) => Number(row?.nowBagNum) || 0),
);

let extraTablesPromise = null;
async function ensureExtraTables() {
  if (!extraTablesPromise) {
    extraTablesPromise = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS player_item_bags (
        user_id BIGINT PRIMARY KEY,
        slot_count INTEGER NOT NULL DEFAULT 120
      )`);
      await db.run(`CREATE TABLE IF NOT EXISTS player_extra_resources (
        user_id BIGINT PRIMARY KEY,
        stamina INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    })().catch((error) => {
      extraTablesPromise = null;
      throw error;
    });
  }
  await extraTablesPromise;
}

function clampInt(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function itemDef(itemId) {
  return ITEM_DEFS.get(Number(itemId)) ?? null;
}

async function ensureBagRow(conn, userId) {
  const row = await conn.get('SELECT slot_count AS slotCount FROM player_item_bags WHERE user_id=?', [userId]);
  if (row) return clampInt(row.slotCount, DEFAULT_ITEM_BAG_SLOTS, MAX_ITEM_BAG_SLOTS);
  await conn.run('INSERT INTO player_item_bags(user_id,slot_count) VALUES(?,?)', [userId, DEFAULT_ITEM_BAG_SLOTS]);
  return DEFAULT_ITEM_BAG_SLOTS;
}

async function readBagState(userId) {
  await ensureExtraTables();
  const row = await db.get('SELECT slot_count AS slotCount FROM player_item_bags WHERE user_id=?', [userId]);
  return { slotCount: clampInt(row?.slotCount, DEFAULT_ITEM_BAG_SLOTS, MAX_ITEM_BAG_SLOTS) };
}

async function readFreshProfile(conn, userId) {
  return conn.get(`
    SELECT user_id AS userId, nickname, level, exp, hp, gold,
           diamond, honor, arena, selected_deck_no AS selectedDeckNo
    FROM player_profiles WHERE user_id=?
  `, [userId]);
}

async function readExtraResources(userId) {
  await ensureExtraTables();
  const row = await db.get('SELECT stamina FROM player_extra_resources WHERE user_id=?', [userId]);
  return { stamina: Math.max(0, Number(row?.stamina) || 0) };
}

async function consumeItem(conn, userId, itemId, count = 1, requestedBound = null) {
  const id = Number(itemId);
  const need = clampInt(count, 1, MAX_ITEM_COUNT);
  const rows = await conn.all(`
    SELECT is_bound AS isBound, count
    FROM player_items
    WHERE user_id=? AND item_id=? AND count>0
    ORDER BY is_bound ASC
  `, [userId, id]);
  const candidates = requestedBound === null
    ? rows
    : rows.filter((row) => Boolean(row.isBound) === Boolean(requestedBound));
  const total = candidates.reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0);
  if (total < need) throw new Error('道具数量不足，请刷新背包后重试');
  let left = need;
  for (const row of candidates) {
    if (left <= 0) break;
    const available = Math.max(0, Number(row.count) || 0);
    const take = Math.min(left, available);
    const next = available - take;
    if (next > 0) {
      await conn.run(
        'UPDATE player_items SET count=? WHERE user_id=? AND item_id=? AND is_bound=?',
        [next, userId, id, row.isBound ? 1 : 0],
      );
    } else {
      await conn.run(
        'DELETE FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
        [userId, id, row.isBound ? 1 : 0],
      );
    }
    left -= take;
  }
}

async function addItem(conn, userId, itemId, count = 1, bound = false) {
  const id = Number(itemId);
  const amount = clampInt(count, 1, MAX_ITEM_COUNT);
  const isBound = bound ? 1 : 0;
  const existing = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, id, isBound],
  );
  if (existing) {
    await conn.run(
      'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=?',
      [amount, userId, id, isBound],
    );
  } else {
    await conn.run(
      'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,?)',
      [userId, id, amount, isBound],
    );
  }
}

async function addCard(conn, userId, cardId) {
  const id = Number(cardId);
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const slotCount = clampInt(bag?.slotCount, 1, 500);
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=?', [userId]);
  const occupied = new Set(rows.map((row) => Number(row.slotIndex)));
  let slotIndex = -1;
  for (let index = 0; index < slotCount; index += 1) {
    if (!occupied.has(index)) { slotIndex = index; break; }
  }
  if (slotIndex < 0) throw new Error('卡牌背包已满');
  await conn.run(
    'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
    [userId, slotIndex, id, 0, 1],
  );
  return slotIndex;
}

function pickWeightedCard(maxQuality) {
  const maxQ = clampInt(maxQuality, 1, 5);
  const pool = COLLECTIBLE_CARDS.filter((card) => clampInt(card.card_quality, 1, 5) <= maxQ);
  if (!pool.length) throw new Error('卡池为空');
  const weights = pool.map((card) => Math.max(1, maxQ - clampInt(card.card_quality, 1, 5) + 1));
  let roll = Math.random() * weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[pool.length - 1];
}

async function buildResponse(userId, extras = {}) {
  const profile = await db.get(`
    SELECT user_id AS userId, nickname, level, exp, hp, gold,
           diamond, honor, arena, selected_deck_no AS selectedDeckNo
    FROM player_profiles WHERE user_id=?
  `, [userId]);
  return {
    ok: true,
    ...extras,
    profile,
    items: await readPlayerItems20260908(userId),
    itemBag: await readBagState(userId),
    extraResources: await readExtraResources(userId),
  };
}

playerEconomyAuthorityRouter20260908.get('/economy-state', async (req, res) => {
  await ensureExtraTables();
  return res.json(await buildResponse(Number(req.user.id)));
});

playerEconomyAuthorityRouter20260908.post('/inventory/use', async (req, res) => {
  await ensureExtraTables();
  const userId = Number(req.user.id);
  const itemId = Number(req.body?.itemId);
  const requestedBound = req.body?.bound === true ? true : req.body?.bound === false ? false : null;
  const def = itemDef(itemId);
  if (!def) return res.status(400).json({ message: '道具配置不存在' });

  try {
    const result = await withTransaction(async (conn) => {
      const fixed = FIXED_GIFTS.get(itemId);
      if (fixed) {
        await consumeItem(conn, userId, itemId, 1, requestedBound);
        const current = await conn.get('SELECT level, exp FROM player_profiles WHERE user_id=?', [userId]);
        if (fixed.gold) await conn.run('UPDATE player_profiles SET gold=gold+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [fixed.gold, userId]);
        if (fixed.diamond) await conn.run('UPDATE player_profiles SET diamond=diamond+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [fixed.diamond, userId]);
        if (fixed.honor) await conn.run('UPDATE player_profiles SET honor=honor+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [fixed.honor, userId]);
        if (fixed.exp) {
          const player = { level: Number(current?.level) || 1, exp: Number(current?.exp) || 0 };
          grantPlayerExp(player, fixed.exp);
          await conn.run('UPDATE player_profiles SET level=?, exp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [player.level, player.exp, userId]);
        }
        if (fixed.stamina) {
          const extra = await conn.get('SELECT stamina FROM player_extra_resources WHERE user_id=?', [userId]);
          if (extra) await conn.run('UPDATE player_extra_resources SET stamina=stamina+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [fixed.stamina, userId]);
          else await conn.run('INSERT INTO player_extra_resources(user_id,stamina) VALUES(?,?)', [userId, fixed.stamina]);
        }
        return { message: '道具使用成功' };
      }

      if (itemId === 92) {
        const currentSlots = await ensureBagRow(conn, userId);
        const nextSlots = Math.min(MAX_ITEM_BAG_SLOTS, currentSlots + 10);
        if (nextSlots <= currentSlots) throw new Error('背包已达最大容量');
        await consumeItem(conn, userId, itemId, 1, requestedBound);
        await conn.run('UPDATE player_item_bags SET slot_count=? WHERE user_id=?', [nextSlots, userId]);
        return { message: `背包永久增加到 ${nextSlots} 格`, slotCount: nextSlots };
      }

      const fn = Number(def.function);
      const showType = String(def.show_type ?? '');
      if (fn === 13 || /卡包|卡蛋/.test(showType)) {
        const card = def.card_pool_quality ? pickExactTierCard(COLLECTIBLE_CARDS, def.card_pool_quality) : pickWeightedCard(def.quality ?? 2);
        await consumeItem(conn, userId, itemId, 1, requestedBound);
        await addCard(conn, userId, card.card_id);
        return { message: `获得 ${card.card_name}`, cardId: Number(card.card_id) };
      }

      if (fn === 1 && /礼盒/.test(showType)) {
        const rewardId = RANDOM_ITEM_POOL[Math.floor(Math.random() * RANDOM_ITEM_POOL.length)];
        await consumeItem(conn, userId, itemId, 1, requestedBound);
        await addItem(conn, userId, rewardId, 1, false);
        return { message: `获得道具 #${rewardId}`, rewardItemId: rewardId };
      }

      throw new Error('该道具需要选择目标，不能直接使用');
    });
    const response = await buildResponse(userId, result);
    if (result?.cardId) response.cardInventory = await readCardInventory(userId);
    return res.json(response);
  } catch (error) {
    return res.status(400).json({ message: error?.message || '道具使用失败' });
  }
});

playerEconomyAuthorityRouter20260908.post('/inventory/sell', async (req, res) => {
  const userId = Number(req.user.id);
  const itemId = Number(req.body?.itemId);
  const count = clampInt(req.body?.count ?? 1, 1, 9999);
  const bound = req.body?.bound === true ? true : req.body?.bound === false ? false : null;
  const def = itemDef(itemId);
  if (!def) return res.status(400).json({ message: '道具配置不存在' });
  const unitPrice = Math.max(0, Number(def.sell_price ?? def.sellPrice) || 0);
  try {
    await withTransaction(async (conn) => {
      await consumeItem(conn, userId, itemId, count, bound);
      await conn.run('UPDATE player_profiles SET gold=gold+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [unitPrice * count, userId]);
    });
    return res.json(await buildResponse(userId, { sold: count, gain: unitPrice * count }));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '出售失败' });
  }
});

playerEconomyAuthorityRouter20260908.post('/inventory/drop', async (req, res) => {
  const userId = Number(req.user.id);
  const itemId = Number(req.body?.itemId);
  const count = clampInt(req.body?.count ?? 1, 1, 9999);
  const bound = req.body?.bound === true ? true : req.body?.bound === false ? false : null;
  if (!itemDef(itemId)) return res.status(400).json({ message: '道具配置不存在' });
  try {
    await withTransaction((conn) => consumeItem(conn, userId, itemId, count, bound));
    return res.json(await buildResponse(userId, { dropped: count }));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '丢弃失败' });
  }
});

playerEconomyAuthorityRouter20260908.post('/inventory/expand', async (req, res) => {
  await ensureExtraTables();
  const userId = Number(req.user.id);
  try {
    const result = await withTransaction(async (conn) => {
      const currentSlots = await ensureBagRow(conn, userId);
      const cfg = expandRows.find((row) => Number(row?.nowBagNum) === currentSlots + 1);
      if (!cfg) throw new Error('背包已达最大容量');
      const target = clampInt(cfg.nowBagNum, currentSlots + 1, MAX_ITEM_BAG_SLOTS);
      const cost = Math.max(0, Number(cfg.cost) || 0);
      const debit = await conn.run(
        'UPDATE player_profiles SET diamond=diamond-?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND diamond>=?',
        [cost, userId, cost],
      );
      const affected = Number(debit?.affectedRows ?? debit?.changes ?? 0);
      if (affected !== 1) throw new Error(`红钻不足，扩容需要 ${cost} 红钻`);
      await conn.run('UPDATE player_item_bags SET slot_count=? WHERE user_id=?', [target, userId]);
      return { slotCount: target, gemCost: cost };
    });
    return res.json(await buildResponse(userId, result));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '扩容失败' });
  }
});

playerEconomyAuthorityRouter20260908.post('/shop/buy-item', async (req, res) => {
  const userId = Number(req.user.id);
  const itemId = Number(req.body?.itemId);
  const count = clampInt(req.body?.count ?? 1, 1, 9999);
  const goldCost = clampInt(req.body?.goldCost ?? 0, 0, 2_000_000_000);
  const gemCost = clampInt(req.body?.gemCost ?? 0, 0, 2_000_000_000);
  const def = itemDef(itemId);
  if (!def) return res.status(400).json({ message: '商品道具配置不存在' });
  try {
    await withTransaction(async (conn) => {
      const debit = await conn.run(
        'UPDATE player_profiles SET gold=gold-?, diamond=diamond-?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND gold>=? AND diamond>=?',
        [goldCost, gemCost, userId, goldCost, gemCost],
      );
      const affected = Number(debit?.affectedRows ?? debit?.changes ?? 0);
      if (affected !== 1) throw new Error(gemCost > 0 ? '钻石不足' : '金币不足');
      await addItem(conn, userId, itemId, count, false);
    });
    return res.json(await buildResponse(userId, { purchasedItemId: itemId, purchasedCount: count }));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '购买失败' });
  }
});

playerEconomyAuthorityRouter20260908.post('/shop/buy-pack', async (req, res) => {
  const userId = Number(req.user.id);
  const packId = Number(req.body?.packId);
  const pack = packRows.find((row) => Number(row?.item_id) === packId);
  if (!pack) return res.status(400).json({ message: '卡牌包不存在' });
  const goldCost = Math.max(0, Number(pack.gold) || 0);
  const gemCost = Math.max(0, Number(pack.redDiamond) || 0);
  try {
    const result = await withTransaction(async (conn) => {
      const debit = await conn.run(
        'UPDATE player_profiles SET gold=gold-?, diamond=diamond-?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND gold>=? AND diamond>=?',
        [goldCost, gemCost, userId, goldCost, gemCost],
      );
      const affected = Number(debit?.affectedRows ?? debit?.changes ?? 0);
      if (affected !== 1) throw new Error(gemCost > 0 ? '钻石不足' : '金币不足');
      const qualities = [pack.firstQuality, pack.secondQuality, pack.thirdQuality]
        .map(Number).filter((value) => Number.isInteger(value) && value > 0);
      if (!qualities.length) throw new Error('卡牌包品质配置无效');
      const quality = qualities[Math.floor(Math.random() * qualities.length)];
      const pool = COLLECTIBLE_CARDS.filter((card) => clampInt(card.card_quality, 1, 5) === clampInt(quality, 1, 5));
      if (!pool.length) throw new Error('卡池为空');
      const card = pool[Math.floor(Math.random() * pool.length)];
      await addCard(conn, userId, card.card_id);
      return { cardId: Number(card.card_id), cardName: String(card.card_name || card.card_id) };
    });
    return res.json({ ...await buildResponse(userId, result), cardInventory: await readCardInventory(userId) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || '购买卡牌包失败' });
  }
});

playerEconomyAuthorityRouter20260908.post('/shop/recharge-demo', async (req, res) => {
  const userId = Number(req.user.id);
  const payId = Number(req.body?.payId);
  const pay = payRows.find((row) => Number(row?.pay_id) === payId);
  if (!pay) return res.status(400).json({ message: '充值档位不存在' });
  const amount = Math.max(0, Number(pay.pay_value) || 0) + Math.max(0, Number(pay.pay_give) || 0);
  await db.run('UPDATE player_profiles SET diamond=diamond+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [amount, userId]);
  return res.json(await buildResponse(userId, { diamondGain: amount }));
});

playerEconomyAuthorityRouter20260908.post('/cards/discard', async (req, res) => {
  const userId = Number(req.user.id);
  const slotIndex = clampInt(req.body?.slotIndex, 0, 499);
  try {
    await withTransaction(async (conn) => {
      const row = await conn.get('SELECT card_id AS cardId FROM player_cards WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
      if (!row) throw new Error('卡牌不存在，请刷新后重试');
      await conn.run('DELETE FROM player_cards WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
      await conn.run('DELETE FROM player_card_instance_state WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
    });
    return res.json({ ...await buildResponse(userId), cardInventory: await readCardInventory(userId) });
  } catch (error) {
    return res.status(400).json({ message: error?.message || '移除卡牌失败' });
  }
});
