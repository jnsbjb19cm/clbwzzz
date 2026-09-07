import { Router } from 'express';
import { createRequire } from 'node:module';
import { db, getPlayerSnapshot, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { readCardInventory } from './cardInventoryPersistence20260906.js';

const require = createRequire(import.meta.url);
const cardJson = require('../../src/data/card.json');
const craftRules = require('../../src/data/craftRules.json');
const craftMaterials = require('../../src/data/craftMaterials.json');
const smithyJson = require('../../src/data/smithy.json');
const pieceReward = require('../../src/data/pieceReward.json');

export const smithyAuthorityRouter20260907 = Router();
smithyAuthorityRouter20260907.use(requireAuth);

const EXPERIENCE_CARD_IDS = new Set([122, 123, 124]);
const REVERSE_CARD_ID = 50041;
const MAX_STAR = 15;
const MAX_CARD_SLOTS = 500;
const BASE_STAR_RATES = [100, 45, 40, 35, 30, 25, 20, 18, 16, 14, 12, 10, 9, 8, 7];
const CARD_BY_ID = new Map(cardJson.map((raw) => [Number(raw.card_id), raw]));
const PIECE_BY_CARD = new Map(pieceReward.map((raw) => [Number(raw.card_id), raw]));
const LEVEL_CONFIG = new Map(craftMaterials.levels.map((raw) => [Number(raw.level), raw]));
const MATERIAL_ITEMS = new Map(craftMaterials.items.map((raw) => [Number(raw.item_id), raw]));
const STRENGTH_ROWS = smithyJson[0]?.strength ?? [];
const ALLOWED_MATERIAL_TYPES = new Set(['parchment', 'gem', 'charm']);

await db.run(`
  CREATE TABLE IF NOT EXISTS player_smithy_state (
    user_id BIGINT NOT NULL PRIMARY KEY,
    state_json TEXT NOT NULL
  )
`);

function int(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function cardQuality(card) {
  return Math.max(1, Math.min(5, int(card?.card_quality, 1)));
}

function isCollectible(card) {
  const id = int(card?.card_id);
  return Boolean(card && Number(card.show_card) === 1 && id > 0 && id < 500 && !EXPERIENCE_CARD_IDS.has(id));
}

function isCraftable(card) {
  return EXPERIENCE_CARD_IDS.has(int(card?.card_id)) || (isCollectible(card) && cardQuality(card) <= 4);
}

function defaultSmithyState() {
  return {
    craftPity: {},
    star: { failures: {}, pity: {}, protections: {}, escrow: [] },
  };
}

function normalizeSmithyState(raw) {
  const base = defaultSmithyState();
  if (!raw || typeof raw !== 'object') return base;
  const star = raw.star && typeof raw.star === 'object' ? raw.star : {};
  return {
    craftPity: raw.craftPity && typeof raw.craftPity === 'object' ? raw.craftPity : {},
    star: {
      failures: star.failures && typeof star.failures === 'object' ? star.failures : {},
      pity: star.pity && typeof star.pity === 'object' ? star.pity : {},
      protections: star.protections && typeof star.protections === 'object' ? star.protections : {},
      escrow: Array.isArray(star.escrow) ? star.escrow : [],
    },
  };
}

async function readSmithyState(userId, conn = db) {
  const row = await conn.get('SELECT state_json AS stateJson FROM player_smithy_state WHERE user_id=?', [userId]);
  if (!row?.stateJson) return defaultSmithyState();
  try { return normalizeSmithyState(JSON.parse(row.stateJson)); } catch { return defaultSmithyState(); }
}

async function writeSmithyState(conn, userId, state) {
  const json = JSON.stringify(normalizeSmithyState(state));
  const existing = await conn.get('SELECT user_id AS userId FROM player_smithy_state WHERE user_id=?', [userId]);
  if (existing) await conn.run('UPDATE player_smithy_state SET state_json=? WHERE user_id=?', [json, userId]);
  else await conn.run('INSERT INTO player_smithy_state(user_id,state_json) VALUES(?,?)', [userId, json]);
}

async function itemCount(conn, userId, itemId) {
  const row = await conn.get('SELECT COALESCE(SUM(count),0) AS count FROM player_items WHERE user_id=? AND item_id=?', [userId, itemId]);
  return Math.max(0, int(row?.count));
}

async function consumeItem(conn, userId, itemId, count) {
  let left = Math.max(0, int(count));
  if (!left) return true;
  if (await itemCount(conn, userId, itemId) < left) return false;
  const rows = await conn.all(
    'SELECT is_bound AS isBound, count FROM player_items WHERE user_id=? AND item_id=? AND count>0 ORDER BY is_bound ASC',
    [userId, itemId],
  );
  for (const row of rows) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, int(row.count)));
    const remain = Math.max(0, int(row.count) - take);
    if (remain > 0) {
      await conn.run('UPDATE player_items SET count=? WHERE user_id=? AND item_id=? AND is_bound=?', [remain, userId, itemId, int(row.isBound)]);
    } else {
      await conn.run('DELETE FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?', [userId, itemId, int(row.isBound)]);
    }
    left -= take;
  }
  return left === 0;
}

async function addItem(conn, userId, itemId, count, isBound = 0) {
  const amount = Math.max(0, int(count));
  if (!amount) return;
  const bound = isBound ? 1 : 0;
  const existing = await conn.get('SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?', [userId, itemId, bound]);
  if (existing) {
    await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=?', [amount, userId, itemId, bound]);
  } else {
    await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,?)', [userId, itemId, amount, bound]);
  }
}

async function cardBagSlotCount(conn, userId) {
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  return Math.max(200, Math.min(MAX_CARD_SLOTS, int(bag?.slotCount, 200)));
}

async function nextCardSlot(conn, userId) {
  const slotCount = await cardBagSlotCount(conn, userId);
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=? ORDER BY slot_index', [userId]);
  const used = new Set(rows.map((row) => int(row.slotIndex)).filter((index) => index >= 0));
  for (let index = 0; index < slotCount; index += 1) if (!used.has(index)) return index;
  return -1;
}

async function readCardSlot(conn, userId, slotIndex) {
  const row = await conn.get(`
    SELECT pc.slot_index AS slotIndex, pc.card_id AS cardId, pc.star, pc.craft_quality AS craftQuality,
           ps.state_json AS stateJson
    FROM player_cards pc
    LEFT JOIN player_card_instance_state ps ON ps.user_id=pc.user_id AND ps.slot_index=pc.slot_index
    WHERE pc.user_id=? AND pc.slot_index=?
  `, [userId, slotIndex]);
  if (!row) return null;
  let extra = {};
  try { extra = JSON.parse(row.stateJson || '{}') || {}; } catch {}
  return {
    slotIndex: int(row.slotIndex),
    cardId: int(row.cardId),
    star: Math.max(0, int(row.star)),
    strengthLv: Math.max(0, int(row.star)),
    craftQuality: Math.max(1, Math.min(5, int(row.craftQuality, 1))),
    exp: Math.max(0, int(extra.exp)),
    customName: extra.customName || null,
    awakened: Boolean(extra.awakened),
    attributeRoll: extra.attributeRoll ?? null,
    powderSpent: extra.powderSpent && typeof extra.powderSpent === 'object' ? extra.powderSpent : {},
  };
}

async function writeCardExtra(conn, userId, slot) {
  const payload = JSON.stringify({
    exp: Math.max(0, int(slot.exp)),
    customName: slot.customName || null,
    awakened: Boolean(slot.awakened),
    attributeRoll: slot.attributeRoll ?? null,
    powderSpent: slot.powderSpent && typeof slot.powderSpent === 'object' ? slot.powderSpent : {},
  });
  const existing = await conn.get('SELECT user_id AS userId FROM player_card_instance_state WHERE user_id=? AND slot_index=?', [userId, slot.slotIndex]);
  if (existing) await conn.run('UPDATE player_card_instance_state SET state_json=? WHERE user_id=? AND slot_index=?', [payload, userId, slot.slotIndex]);
  else await conn.run('INSERT INTO player_card_instance_state(user_id,slot_index,state_json) VALUES(?,?,?)', [userId, slot.slotIndex, payload]);
}

async function insertCard(conn, userId, { cardId, star = 0, craftQuality = 1, ...extra }) {
  const slotIndex = await nextCardSlot(conn, userId);
  if (slotIndex < 0) throw new Error('卡牌背包已满');
  const card = CARD_BY_ID.get(int(cardId));
  if (!card || (!isCollectible(card) && !EXPERIENCE_CARD_IDS.has(int(cardId)))) throw new Error('无效卡牌');
  const safeStar = Math.max(0, Math.min(MAX_STAR, int(star)));
  const safeCraftQuality = Math.max(1, Math.min(5, int(craftQuality, 1)));
  await conn.run(
    'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
    [userId, slotIndex, int(cardId), safeStar, safeCraftQuality],
  );
  const slot = { slotIndex, cardId: int(cardId), star: safeStar, craftQuality: safeCraftQuality, ...extra };
  await writeCardExtra(conn, userId, slot);
  return slot;
}

async function removeCard(conn, userId, slotIndex) {
  await conn.run('DELETE FROM player_card_instance_state WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
  await conn.run('DELETE FROM player_cards WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
}

async function updateCardStar(conn, userId, slotIndex, star, extraPatch = null) {
  const slot = await readCardSlot(conn, userId, slotIndex);
  if (!slot) throw new Error('卡牌不存在');
  const safeStar = Math.max(0, Math.min(MAX_STAR, int(star)));
  await conn.run('UPDATE player_cards SET star=? WHERE user_id=? AND slot_index=?', [safeStar, userId, slotIndex]);
  slot.star = safeStar;
  slot.strengthLv = safeStar;
  if (extraPatch) Object.assign(slot, extraPatch);
  await writeCardExtra(conn, userId, slot);
  return slot;
}

function randomPick(list, excludeId = null) {
  const filtered = excludeId == null ? list : list.filter((card) => int(card.card_id) !== int(excludeId));
  const pool = filtered.length ? filtered : list;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function craftOutcomeRates(tier, highTier) {
  let targetRate = Number(tier.targetRate) || 0;
  let ascendRate = Number(tier.ascendRate) || 0;
  let wrongRate = Number(tier.wrongRate) || 0;
  if (highTier) {
    const bonus = Number(craftRules.highTierBonus?.ascendRate) || 0;
    ascendRate += bonus;
    if (wrongRate >= bonus) wrongRate -= bonus;
    else {
      const rest = bonus - wrongRate;
      wrongRate = 0;
      targetRate = Math.max(0, targetRate - rest);
    }
  }
  const total = targetRate + ascendRate + wrongRate;
  if (total > 0 && Math.abs(total - 1) > 1e-9) {
    targetRate /= total;
    ascendRate /= total;
    wrongRate /= total;
  }
  return { targetRate, ascendRate, wrongRate };
}

function rollCraftQuality(useCharm) {
  const mult = useCharm ? 1 + (Number(craftRules.charmBonus?.qualityWeight) || 0) : 1;
  const weights = craftRules.craftQualityWeights.map((entry) => ({
    id: Math.max(1, int(entry.id, 1)),
    weight: Number(entry.weight) * (int(entry.id) >= 2 ? mult : 1),
  }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return Math.max(1, Math.min(5, entry.id));
  }
  return 1;
}

async function responseSnapshot(userId, extra = {}) {
  const [cardInventory, snapshot, smithyState] = await Promise.all([
    readCardInventory(userId),
    getPlayerSnapshot(userId),
    readSmithyState(userId),
  ]);
  return {
    ok: true,
    ...extra,
    cardInventory,
    items: snapshot?.items ?? [],
    profile: snapshot?.profile ?? null,
    smithyState,
  };
}

smithyAuthorityRouter20260907.get('/state', async (req, res) => {
  return res.json(await responseSnapshot(req.user.id));
});

smithyAuthorityRouter20260907.post('/craft', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await withTransaction(async (conn) => {
      const targetId = int(req.body?.targetCardId);
      const useCharm = Boolean(req.body?.useCharm);
      const useDna = Boolean(req.body?.useDna);
      const highTier = Boolean(req.body?.highTier);
      const target = CARD_BY_ID.get(targetId);
      if (!target || !isCraftable(target)) throw new Error('该卡牌不可制造');
      if (await nextCardSlot(conn, userId) < 0) throw new Error('卡牌背包已满');

      const level = Math.min(4, cardQuality(target));
      const material = LEVEL_CONFIG.get(level);
      const need = craftRules.materialsPerCraft;
      if (!material) throw new Error('制作材料配置不存在');
      if (await itemCount(conn, userId, material.parchment) < int(need.parchment)) throw new Error('羊皮纸不足');
      if (await itemCount(conn, userId, material.gem) < int(need.gem)) throw new Error('宝石不足');
      if (useCharm && await itemCount(conn, userId, material.charm) < 1) throw new Error('保护符不足');
      if (useDna && await itemCount(conn, userId, material.dna) < 1) throw new Error('DNA不足');

      const state = await readSmithyState(userId, conn);
      const tier = craftRules.tierRules[String(level)];
      let successRate = state.craftPity[String(targetId)] ? 1 : Number(tier.successRate);
      if (useCharm) successRate = Math.min(1, successRate + (Number(craftRules.charmBonus?.successRate) || 0));
      const success = Math.random() < successRate;

      if (!success) {
        if (useCharm) {
          await consumeItem(conn, userId, material.charm, 1);
          await writeSmithyState(conn, userId, state);
          return { result: 'fail_protected', message: '制作失败，保护符已消耗，材料已保留' };
        }
        await consumeItem(conn, userId, material.parchment, int(need.parchment));
        await consumeItem(conn, userId, material.gem, int(need.gem));
        const compensateLevel = Math.max(1, level - 1);
        const compensation = LEVEL_CONFIG.get(compensateLevel);
        if (compensation) await addItem(conn, userId, compensation.gem, int(craftRules.failureCompensate));
        await writeSmithyState(conn, userId, state);
        return { result: 'fail', message: `制作失败，补偿${compensateLevel}级宝石×${int(craftRules.failureCompensate)}` };
      }

      await consumeItem(conn, userId, material.parchment, int(need.parchment));
      await consumeItem(conn, userId, material.gem, int(need.gem));
      if (useCharm) await consumeItem(conn, userId, material.charm, 1);
      if (useDna) await consumeItem(conn, userId, material.dna, 1);

      const rates = EXPERIENCE_CARD_IDS.has(targetId)
        ? { targetRate: 1, ascendRate: 0, wrongRate: 0 }
        : craftOutcomeRates(tier, highTier);
      const roll = Math.random();
      let outcome = 'target';
      let resultCard = target;
      let dnaRefunded = false;
      if (rates.ascendRate > 0 && roll < rates.ascendRate) {
        outcome = 'ascend';
        const pool = cardJson.filter((card) => isCollectible(card) && cardQuality(card) === level + 1);
        resultCard = randomPick(pool, targetId) ?? target;
        if (useDna) {
          await addItem(conn, userId, material.dna, 1);
          dnaRefunded = true;
        }
      } else if (useDna || roll < rates.ascendRate + rates.targetRate) {
        outcome = 'target';
      } else if (rates.wrongRate > 0) {
        outcome = 'wrong';
        const pool = cardJson.filter((card) => isCollectible(card) && cardQuality(card) === level);
        resultCard = randomPick(pool, targetId) ?? target;
      }

      const craftQuality = EXPERIENCE_CARD_IDS.has(int(resultCard.card_id)) ? 1 : rollCraftQuality(useCharm);
      await insertCard(conn, userId, { cardId: int(resultCard.card_id), star: 0, craftQuality });
      if (outcome === 'wrong') state.craftPity[String(targetId)] = true;
      else delete state.craftPity[String(targetId)];
      await writeSmithyState(conn, userId, state);
      const label = outcome === 'target' ? '制作成功' : outcome === 'ascend' ? '升变' : '歪了';
      return {
        result: outcome,
        outcome,
        cardId: int(resultCard.card_id),
        cardName: String(resultCard.card_name || ''),
        craftQuality,
        dnaRefunded,
        message: `${label}：${String(resultCard.card_name || resultCard.card_id)}${dnaRefunded ? '，DNA已返还' : ''}`,
      };
    });
    return res.json(await responseSnapshot(userId, result));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '制造失败' });
  }
});

function starBindingKey(slot) {
  return `${slot.cardId}:${slot.craftQuality ?? 1}`;
}

function powderNeed(card, star) {
  const row = STRENGTH_ROWS[star];
  if (!row) return null;
  const key = `powder_${Math.min(5, Math.max(1, cardQuality(card)))}`;
  const raw = String(row[key] || '');
  const [itemId, count] = raw.split('|').map(Number);
  if (!itemId || !count) return null;
  return { itemId, count };
}

function purgeEscrow(state, now = Date.now()) {
  state.star.escrow = state.star.escrow.filter((entry) => Number(entry?.expiresAt) > now);
}

smithyAuthorityRouter20260907.post('/star-upgrade', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await withTransaction(async (conn) => {
      const route = req.body?.route === 'duplicate' ? 'duplicate' : 'powder';
      const mainIndex = int(req.body?.mainIndex, -1);
      const subIndices = [...new Set(Array.isArray(req.body?.subIndices) ? req.body.subIndices.map((v) => int(v, -1)) : [])]
        .filter((index) => index >= 0 && index !== mainIndex)
        .slice(0, 5);
      const charmId = req.body?.charmId == null ? null : int(req.body.charmId);
      const main = await readCardSlot(conn, userId, mainIndex);
      if (!main) throw new Error('请先放入主卡');
      const card = CARD_BY_ID.get(main.cardId);
      if (!card) throw new Error('主卡无效');
      const star = Math.max(0, int(main.star));
      if (star >= MAX_STAR) throw new Error(`已达到${MAX_STAR}星上限`);

      const subs = [];
      if (route === 'duplicate') {
        if (!subIndices.length) throw new Error('必须放入至少一张同卡、同星级副卡');
        for (const index of subIndices) {
          const slot = await readCardSlot(conn, userId, index);
          if (!slot || slot.cardId !== main.cardId || int(slot.star) !== star) throw new Error('副卡必须与主卡相同，并且星级一致');
          subs.push(slot);
        }
      }

      const state = await readSmithyState(userId, conn);
      purgeEscrow(state);
      const key = starBindingKey(main);
      const baseRate = BASE_STAR_RATES[Math.min(star, BASE_STAR_RATES.length - 1)];
      const count = subs.length;
      const sameCardBonus = star <= 5 ? 50 : 25;
      const formulaBonus = star * count;
      const charmLevel = charmId ? Math.max(1, Math.min(4, charmId - 50020)) : 0;
      if (charmId && (charmId < 50021 || charmId > 50024)) throw new Error('保护符无效');
      if (charmId && await itemCount(conn, userId, charmId) < 1) throw new Error('所选保护符数量不足');
      const storedProtection = state.star.protections[key];
      const storedLevel = Number(storedProtection?.charges) > 0 ? int(storedProtection?.level) : 0;
      const protectionBonus = Math.max(charmLevel, storedLevel) * 5;
      const pityActive = Boolean(state.star.pity[key]);
      let rawRate = baseRate + sameCardBonus * count + formulaBonus + protectionBonus;
      if (pityActive) rawRate *= 2;
      if (star === 0) rawRate = 100;
      const successRate = Math.min(100, rawRate);
      const doubleRate = Math.min(100, Math.max(0, rawRate - 100));

      if (route === 'powder') {
        const need = powderNeed(card, star);
        if (!need) throw new Error('当前星级没有可用强化粉配置');
        if (await itemCount(conn, userId, need.itemId) < need.count) throw new Error('强化粉不足');
        await consumeItem(conn, userId, need.itemId, need.count);
        main.powderSpent = { ...(main.powderSpent ?? {}) };
        main.powderSpent[need.itemId] = (int(main.powderSpent[need.itemId]) || 0) + need.count;
        await writeCardExtra(conn, userId, main);
      }

      if (charmId) state.star.protections[key] = { itemId: charmId, level: charmLevel, charges: charmLevel };
      const now = Date.now();
      for (const sub of subs) {
        await removeCard(conn, userId, sub.slotIndex);
        const highTier = Number(sub.craftQuality || 1) >= 4;
        state.star.escrow.push({
          id: `${now}-${sub.slotIndex}-${Math.random().toString(36).slice(2)}`,
          slot: sub,
          consumedAt: now,
          expiresAt: now + (highTier ? 5 : 3) * 24 * 60 * 60 * 1000,
        });
      }

      const success = Math.random() * 100 < successRate;
      if (success) {
        const double = doubleRate > 0 && Math.random() * 100 < doubleRate;
        const gain = double ? 2 : 1;
        const nextStar = Math.min(MAX_STAR, star + gain);
        await updateCardStar(conn, userId, mainIndex, nextStar, { powderSpent: main.powderSpent });
        state.star.failures[key] = 0;
        state.star.pity[key] = false;
        const protection = state.star.protections[key];
        if (protection?.itemId && await itemCount(conn, userId, protection.itemId) > 0) {
          await consumeItem(conn, userId, protection.itemId, 1);
        }
        delete state.star.protections[key];
        await writeSmithyState(conn, userId, state);
        return {
          success: true,
          double,
          star: nextStar,
          message: double ? `升变成功，提升至${nextStar}星！` : `升星成功，提升至${nextStar}星！`,
        };
      }

      const failures = int(state.star.failures[key]) + 1;
      state.star.failures[key] = failures;
      if (failures >= 9) state.star.pity[key] = true;
      const protection = state.star.protections[key];
      let dropped = false;
      if (protection?.charges > 0) protection.charges -= 1;
      else if (!state.star.pity[key] && failures % 3 === 0 && star > 0) {
        await updateCardStar(conn, userId, mainIndex, star - 1, { powderSpent: main.powderSpent });
        dropped = true;
      }
      await writeSmithyState(conn, userId, state);
      return {
        success: false,
        failures,
        dropped,
        pityActive: Boolean(state.star.pity[key]),
        message: dropped
          ? `连续失败${failures}次，主卡降低1星；副卡已进入销毁层。`
          : `升星失败(连续${failures}次)；副卡已进入销毁层。`,
      };
    });
    return res.json(await responseSnapshot(userId, result));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '强化失败' });
  }
});

smithyAuthorityRouter20260907.post('/restore-escrow', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await withTransaction(async (conn) => {
      const entryId = String(req.body?.entryId || '');
      const state = await readSmithyState(userId, conn);
      purgeEscrow(state);
      const index = state.star.escrow.findIndex((entry) => String(entry?.id) === entryId);
      if (index < 0) throw new Error('该副卡已过期或不存在');
      const entry = state.star.escrow[index];
      const reverseCount = Number(entry.slot?.craftQuality || 1) > 4 ? 2 : 1;
      if (await itemCount(conn, userId, REVERSE_CARD_ID) < reverseCount) throw new Error(`逆转卡不足，需要${reverseCount}张`);
      if (await nextCardSlot(conn, userId) < 0) throw new Error('卡牌背包已满');
      await consumeItem(conn, userId, REVERSE_CARD_ID, reverseCount);
      await insertCard(conn, userId, entry.slot);
      state.star.escrow.splice(index, 1);
      await writeSmithyState(conn, userId, state);
      return { message: `副卡已还原，消耗逆转卡×${reverseCount}。` };
    });
    return res.json(await responseSnapshot(userId, result));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '还原失败' });
  }
});

smithyAuthorityRouter20260907.post('/decompose', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await withTransaction(async (conn) => {
      const slotIndex = int(req.body?.slotIndex, -1);
      const slot = await readCardSlot(conn, userId, slotIndex);
      if (!slot) throw new Error('未选择卡牌');
      const card = CARD_BY_ID.get(slot.cardId);
      if (!card) throw new Error('无效卡牌');
      const quality = cardQuality(card);
      const base = craftRules.decomposeBase[String(quality)] ?? craftRules.decomposeBase['1'];
      const craftBonus = Number(slot.craftQuality ?? 1) >= 3 ? 1 : 0;
      const materialLevel = Math.min(4, Math.max(1, quality));
      const material = LEVEL_CONFIG.get(materialLevel);
      const piece = PIECE_BY_CARD.get(slot.cardId);
      const rewards = {
        gem: int(base.gem) + craftBonus,
        gemId: material?.gem ?? null,
        parchmentChance: Number(base.parchmentChance) || 0,
        parchmentId: material?.parchment ?? null,
        pieceItemId: piece?.item_id ?? null,
        pieceCount: piece ? Math.max(1, Math.floor(Number(piece.need_num) / 4)) : 0,
      };
      await removeCard(conn, userId, slotIndex);
      if (rewards.gemId) await addItem(conn, userId, rewards.gemId, rewards.gem);
      if (rewards.parchmentId && Math.random() < rewards.parchmentChance) await addItem(conn, userId, rewards.parchmentId, 1);
      if (rewards.pieceItemId && rewards.pieceCount > 0) await addItem(conn, userId, rewards.pieceItemId, rewards.pieceCount);
      return { rewards, message: `已分解「${String(card.card_name || slot.cardId)}」` };
    });
    return res.json(await responseSnapshot(userId, result));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '分解失败' });
  }
});

smithyAuthorityRouter20260907.post('/material-combine', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await withTransaction(async (conn) => {
      const type = String(req.body?.type || '');
      const fromLevel = int(req.body?.fromLevel);
      if (!ALLOWED_MATERIAL_TYPES.has(type)) throw new Error('材料类型无效');
      const from = LEVEL_CONFIG.get(fromLevel);
      const to = LEVEL_CONFIG.get(fromLevel + 1);
      if (!from || !to || !from[type] || !to[type]) throw new Error('已达最高等级');
      const ratio = Math.max(1, int(craftMaterials.combineRatio, 10));
      if (await itemCount(conn, userId, from[type]) < ratio) throw new Error(`需要 ${ratio} 个低级材料`);
      await consumeItem(conn, userId, from[type], ratio);
      await addItem(conn, userId, to[type], 1);
      return {
        toLevel: fromLevel + 1,
        itemId: to[type],
        itemName: MATERIAL_ITEMS.get(to[type])?.item_name ?? '',
        message: `加工成功：${MATERIAL_ITEMS.get(to[type])?.item_name ?? to[type]}`,
      };
    });
    return res.json(await responseSnapshot(userId, result));
  } catch (error) {
    return res.status(400).json({ message: error?.message || '加工失败' });
  }
});
