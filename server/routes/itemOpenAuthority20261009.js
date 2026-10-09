/**
 * 2026-10-09：新道具的「权威使用」接口。
 *
 * 背景（用户报障）：背包点「打开/使用」时，客户端走的是入库权威路径 POST /player/inventory/use，
 * 而服务端那个接口只认 FIXED_GIFTS / 卡蛋 / fn===1&&礼盒，其余一律 400
 * 「该道具需要选择目标，不能直接使用」——所以新手礼包、神秘的蛋、体验卡这些**全都点不动**。
 *
 * 本路由只接管它认识的道具，其余 next() 交给后面已有的两个 /inventory/use 实现（行为不变）：
 *   - function 60/61/62：礼包/卡蛋/情报 → 按 src/data/giftPools.json 掷奖励
 *   - function 64      ：体验卡        → 给指定卡牌一张带 expiresAt 的限时副本
 *   - function 2 且 show_type 含「礼盒」：按 effect_value 直接给 金币/钻石/经验/体力
 *
 * 必须在 batchInventoryUseAuthority20260908 之前注册（Express 先匹配先赢）。
 */
import { Router } from 'express';
import { createRequire } from 'node:module';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { grantPlayerExp } from '../../src/core/PlayerProgression.js';
import { pickExactTierCard } from '../../src/core/CardEgg.js';
import { readPlayerItems20260908 } from '../domain/playerInventoryAuthority20260908.js';
import { readCardInventory } from './cardInventoryPersistence20260906.js';
import { findGiftPool, rollGiftPool } from '../../src/data/giftPoolRoll.js';

const require = createRequire(import.meta.url);
const giftPools = require('../../src/data/giftPools.json');
const itemRows = require('../../src/data/item.json');
const functionalRows = require('../../src/data/functionalItems.json');
const cardRows = require('../../src/data/card.json');

export const itemOpenAuthorityRouter20261009 = Router();
itemOpenAuthorityRouter20261009.use(requireAuth);

const POOLS = (giftPools && giftPools.default) ? giftPools.default : giftPools;
// 2026-10-09：礼包奖励里的 50001/50011/53001/10001… 只在 item.json 里，
// 之前只读 functionalItems.json → 开出来显示「道具50001」这种裸 ID（用户报的就是这个）。
const ITEM_DEFS = new Map([...itemRows, ...functionalRows].map((row) => [Number(row.item_id), row]));
const ITEM_NAMES = new Map([...itemRows, ...functionalRows].map((row) => [Number(row.item_id), String(row.item_name ?? row.name ?? '')]));

/** 道具名（拿不到名字就退回 #id，绝不显示裸数字）。 */
function itemNameOf(itemId) {
  return ITEM_NAMES.get(Number(itemId)) || `#${itemId}`;
}

/**
 * 卡牌展示名：卡名 + 几级卡。
 * 2026-10-09（用户要求）：开卡蛋 / 神秘卡蛋要能看出「开出来是什么卡」，统一带上等级。
 */
function cardDisplayName(card) {
  const name = String(card?.card_name ?? card?.name ?? '').trim() || `#${card?.card_id}`;
  const quality = int(card?.card_quality, 0);
  return quality > 0 ? `${name}（${quality}级卡）` : name;
}

const GIFT_FUNCTIONS = new Set([60, 61, 62]);
const TRIAL_CARD_FUNCTION = 64;
const MAX_USE_COUNT = 9999;
const EXPERIENCE_CARD_IDS = new Set([122, 123, 124]);

const COLLECTIBLE_CARDS = cardRows.filter((row) => (
  Number(row?.show_card) === 1
  && Number(row?.card_id) > 0
  && Number(row?.card_id) < 500
  && !EXPERIENCE_CARD_IDS.has(Number(row?.card_id))
));
const CARD_BY_ID = new Map(cardRows.map((row) => [Number(row.card_id), row]));

function int(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

function clampCount(value) {
  return Math.max(1, Math.min(MAX_USE_COUNT, int(value, 1)));
}

function isEffectValueGift(def) {
  // 2026-10-09（用户报「开礼盒显示获得 0 金币 / 0 钻石」）：
  // 旧礼盒 1 金币礼盒 / 2 红钻礼盒 / 3 荣誉礼盒 也是 fn=2 + show_type=礼盒，但 effect_value=0，
  // 它们本来由旧路由的 FIXED_GIFTS 发放（5000 金币 / 10 红钻 / 5000 荣誉）。
  // 之前这里只判断 fn + show_type，把这几个抢了过来 → 算出 0。
  // 现在只接管 effect_value > 0 的（60020~60023），旧礼盒照旧 next() 交给旧路由。
  return int(def?.function) === 2 && /礼盒/.test(String(def?.show_type ?? '')) && int(def?.effect_value, 0) > 0;
}

function isTrialCardItem(def) {
  return int(def?.function) === TRIAL_CARD_FUNCTION;
}

function trialCardIdOf(def) {
  const explicit = int(def?.trial_card_id);
  if (explicit > 0) return explicit;
  return int(def?.effect_value);
}

function trialDaysOf(def) {
  return Math.max(1, int(def?.trial_days, 7) || 7);
}

// 供验证脚本直接断言分类逻辑（不依赖数据库）。
export {
  ITEM_DEFS as ITEM_DEFS_20261009,
  openableKind as openableKind20261009,
  trialCardIdOf as trialCardIdOf20261009,
  trialDaysOf as trialDaysOf20261009,
  itemNameOf as itemNameOf20261009,
};

/** 2026-10-09：一次性随机道具（用户报「远古召唤卷没法使用」）。 */
const ROULETTE_FUNCTIONS = new Set([
  50, // 藏宝图：随机珍贵物品
  51, // 随机技能书
  53, // 远古召唤卷：随机 2~4 级卡牌
]);

/** 藏宝图池（都是「珍贵」档，别再开出 1 级材料）。 */
const TREASURE_ITEM_POOL = [82, 83, 60105, 50004, 50014, 53001, 53002, 53003, 53004];
const SKILL_BOOK_POOL = [84, 85, 86];

/** 只有本路由认识的道具才接管；其余交给后续路由。 */
function openableKind(def) {
  if (!def) return null;
  if (GIFT_FUNCTIONS.has(int(def.function))) return 'gift_pool';
  if (isTrialCardItem(def)) return 'trial_card';
  if (isEffectValueGift(def)) return 'effect_value_gift';
  if (ROULETTE_FUNCTIONS.has(int(def.function))) return 'roulette';
  return null;
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

function pickCardForEntry(entry) {
  const wrap = (card) => (card
    ? { cardId: Number(card.card_id), cardName: String(card.card_name || card.card_id), raw: card }
    : null);
  if (entry?.cardId != null) return wrap(CARD_BY_ID.get(int(entry.cardId)));
  if (entry?.quality != null) {
    const pool = COLLECTIBLE_CARDS.filter((card) => int(card.card_quality, 1) === int(entry.quality));
    if (!pool.length) return null;
    return wrap(pickExactTierCard(pool, int(entry.quality)));
  }
  return null;
}

/** 找 need 个空卡牌槽位（可能少于 need）。 */
async function freeCardSlots(conn, userId, need) {
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const slotCount = Math.max(1, Math.min(500, int(bag?.slotCount, 0) || 0));
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=?', [userId]);
  const occupied = new Set(rows.map((row) => int(row.slotIndex, -1)));
  const free = [];
  for (let index = 0; index < slotCount && free.length < need; index += 1) {
    if (!occupied.has(index)) free.push(index);
  }
  return free;
}

/** 塞一张卡；带 expiresAt 时写进实例 state_json（体验卡）。 */
async function addCardInstance(conn, userId, slotIndex, cardId, expiresAt = 0) {
  await conn.run(
    'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
    [userId, slotIndex, cardId, 0, 1],
  );
  await conn.run('DELETE FROM player_card_instance_state WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
  await conn.run(
    'INSERT INTO player_card_instance_state(user_id,slot_index,state_json) VALUES(?,?,?)',
    [userId, slotIndex, JSON.stringify(expiresAt > 0 ? { expiresAt } : {})],
  );
}

async function grantGiftRoll(conn, userId, out) {
  const names = [];
  const cardEntries = [...out.cards];
  const itemEntries = [...out.items, ...out.extraItems];
  if (cardEntries.length) {
    const slots = await freeCardSlots(conn, userId, cardEntries.length);
    let cursor = 0;
    for (const entry of cardEntries) {
      const card = pickCardForEntry(entry);
      if (!card) { names.push('（卡池为空）'); continue; }
      if (cursor >= slots.length) { names.push(`卡牌「${cardDisplayName(card.raw)}」（卡牌背包已满）`); continue; }
      await addCardInstance(conn, userId, slots[cursor], card.cardId, 0);
      cursor += 1;
      names.push(`卡牌「${cardDisplayName(card.raw)}」`);
    }
  }
  for (const row of itemEntries) {
    const count = Math.max(1, int(row.count, 1));
    await addItem(conn, userId, int(row.itemId), count, false);
    names.push(`${itemNameOf(row.itemId)}×${count}`);
  }
  return names;
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
    itemBag: { slotCount: Math.max(120, int(bag?.slotCount, 0) || 120) },
    extraResources: { stamina: Math.max(0, int(extra?.stamina, 0)) },
  };
}

itemOpenAuthorityRouter20261009.post('/inventory/use', async (req, res, next) => {
  const itemId = int(req.body?.itemId);
  const def = ITEM_DEFS.get(itemId);
  const kind = openableKind(def);
  // 不认识的道具 → 交给后续路由（原有行为完全不变）
  if (!kind) return next();

  const userId = Number(req.user.id);
  const requestedCount = clampCount(req.body?.count ?? 1);
  const requestedBound = req.body?.bound === true ? true : req.body?.bound === false ? false : null;

  try {
    const result = await withTransaction(async (conn) => {
      const needLevel = Math.max(0, int(def.open_level, 0));
      if (needLevel > 1) {
        const profile = await conn.get('SELECT level FROM player_profiles WHERE user_id=?', [userId]);
        const level = Math.max(1, int(profile?.level, 1) || 1);
        if (level < needLevel) throw new Error(`需要 ${needLevel} 级才能开启「${def.item_name}」`);
      }

      if (kind === 'gift_pool') {
        const pool = findGiftPool(POOLS, itemId);
        const isLock = pool?.kind === 'lock';
        const count = isLock ? 1 : requestedCount;
        if (!isLock) await consumeItem(conn, userId, itemId, count, requestedBound);
        const names = [];
        for (let i = 0; i < count; i += 1) {
          names.push(...await grantGiftRoll(conn, userId, rollGiftPool(pool)));
        }
        const message = isLock
          ? `已查看「${def.item_name}」（不消耗）`
          : names.length ? `打开「${def.item_name}」获得：${names.join('、')}` : `打开「${def.item_name}」但没有获得任何物品`;
        return { message, used: isLock ? 0 : count, granted: names.length };
      }

      if (kind === 'trial_card') {
        const cardId = trialCardIdOf(def);
        if (!CARD_BY_ID.has(cardId)) throw new Error('体验卡未配置卡牌');
        const slots = await freeCardSlots(conn, userId, requestedCount);
        if (!slots.length) throw new Error('卡牌背包已满');
        const count = Math.min(requestedCount, slots.length);
        await consumeItem(conn, userId, itemId, count, requestedBound);
        const expiresAt = Date.now() + trialDaysOf(def) * 24 * 60 * 60 * 1000;
        for (const slot of slots.slice(0, count)) {
          await addCardInstance(conn, userId, slot, cardId, expiresAt);
        }
        const cardName = cardDisplayName(CARD_BY_ID.get(cardId));
        return {
          message: `获得「${cardName}」体验卡（${trialDaysOf(def)} 天）`,
          used: count,
          cardId,
        };
      }

      // 2026-10-09：藏宝图 / 随机技能书 / 远古召唤卷 —— 一次性随机奖励。
      if (kind === 'roulette') {
        const fn = int(def.function);
        const count = requestedCount;
        await consumeItem(conn, userId, itemId, count, requestedBound);
        const names = [];
        for (let i = 0; i < count; i += 1) {
          if (fn === 53) {
            // 远古召唤卷：随机 2~4 级卡牌
            const pool = COLLECTIBLE_CARDS.filter((card) => int(card.card_quality, 1) >= 2 && int(card.card_quality, 1) <= 4);
            const card = pool.length ? pool[Math.floor(Math.random() * pool.length) % pool.length] : null;
            if (!card) throw new Error('卡池为空');
            const slots = await freeCardSlots(conn, userId, 1);
            if (!slots.length) throw new Error('卡牌背包已满');
            await addCardInstance(conn, userId, slots[0], Number(card.card_id), 0);
            names.push(`卡牌「${cardDisplayName(card)}」`);
            continue;
          }
          const pool = fn === 51 ? SKILL_BOOK_POOL : TREASURE_ITEM_POOL;
          const rewardId = pool[Math.floor(Math.random() * pool.length) % pool.length];
          await addItem(conn, userId, rewardId, 1, false);
          names.push(`${itemNameOf(rewardId)}×1`);
        }
        return {
          message: `打开「${def.item_name}」获得：${names.join('、')}`,
          used: count,
          granted: names.length,
        };
      }

      // effect_value 礼盒：金币 / 钻石 / 经验 / 体力
      const value = Math.max(0, int(def.effect_value, 0));
      const count = requestedCount;
      await consumeItem(conn, userId, itemId, count, requestedBound);
      const total = value * count;
      const showType = String(def.show_type ?? '');
      if (/红钻|钻石/.test(def.item_name ?? '') || /红钻|钻石/.test(def.desc ?? '')) {
        await conn.run('UPDATE player_profiles SET diamond=diamond+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [total, userId]);
        return { message: `获得 ${total} 钻石`, used: count };
      }
      if (/体力/.test(def.item_name ?? '') || /体力/.test(def.desc ?? '')) {
        const current = await conn.get('SELECT stamina FROM player_extra_resources WHERE user_id=?', [userId]);
        if (current) {
          await conn.run('UPDATE player_extra_resources SET stamina=stamina+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [total, userId]);
        } else {
          await conn.run('INSERT INTO player_extra_resources(user_id,stamina) VALUES(?,?)', [userId, total]);
        }
        return { message: `恢复 ${total} 点体力`, used: count };
      }
      if (/经验/.test(def.item_name ?? '') || /经验/.test(def.desc ?? '')) {
        const current = await conn.get('SELECT level, exp FROM player_profiles WHERE user_id=?', [userId]);
        const player = { level: int(current?.level, 1) || 1, exp: int(current?.exp, 0) };
        grantPlayerExp(player, total);
        await conn.run('UPDATE player_profiles SET level=?, exp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [player.level, player.exp, userId]);
        return { message: `获得 ${total} 经验`, used: count };
      }
      await conn.run('UPDATE player_profiles SET gold=gold+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [total, userId]);
      void showType;
      return { message: `获得 ${total} 金币`, used: count };
    });

    const response = await buildResponse(userId, { used: result.used, message: result.message });
    if (result?.cardId || /卡牌/.test(result.message ?? '')) {
      response.cardInventory = await readCardInventory(userId);
    }
    return res.json(response);
  } catch (error) {
    return res.status(400).json({ message: error?.message || '道具使用失败' });
  }
});
