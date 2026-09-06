import { db, getPlayerSnapshot, withTransaction } from '../database.js';

const MIN_SLOTS = 200;
const MAX_SLOTS = 500;
const MAX_CARDS = 500;

await db.run(`
  CREATE TABLE IF NOT EXISTS player_card_instance_state (
    user_id BIGINT NOT NULL,
    slot_index INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    PRIMARY KEY(user_id, slot_index)
  )
`);

function safeJsonParse(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeAttributeRoll(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    atk: Math.max(-20, Math.min(20, Number(value.atk) || 0)),
    hp: Math.max(-20, Math.min(20, Number(value.hp) || 0)),
    cd: Math.max(-20, Math.min(20, Number(value.cd) || 0)),
  };
}

function normalizePowderSpent(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [rawId, rawCount] of Object.entries(value)) {
    const itemId = Number(rawId);
    const count = Math.max(0, Math.min(999999, Math.floor(Number(rawCount) || 0)));
    if (Number.isInteger(itemId) && itemId > 0 && count > 0) out[itemId] = count;
  }
  return out;
}

function normalizeCard(raw, slotCount) {
  const slotIndex = Math.floor(Number(raw?.slotIndex));
  const cardId = Math.floor(Number(raw?.cardId));
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) return null;
  if (!Number.isInteger(cardId) || cardId <= 0) return null;
  return {
    slotIndex,
    cardId,
    star: Math.max(0, Math.min(14, Math.floor(Number(raw?.star) || 0))),
    craftQuality: Math.max(1, Math.min(5, Math.floor(Number(raw?.craftQuality) || 1))),
    exp: Math.max(0, Math.min(2147483647, Math.floor(Number(raw?.exp) || 0))),
    customName: String(raw?.customName || '').trim().slice(0, 24) || null,
    awakened: Boolean(raw?.awakened),
    attributeRoll: normalizeAttributeRoll(raw?.attributeRoll),
    powderSpent: normalizePowderSpent(raw?.powderSpent),
  };
}

function multiset(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

function sameCardCollection(left, right) {
  if (left.length !== right.length) return false;
  const a = multiset(left);
  const b = multiset(right);
  if (a.size !== b.size) return false;
  for (const [id, count] of a) if (b.get(id) !== count) return false;
  return true;
}

export async function readCardInventory(userId) {
  const snapshot = await getPlayerSnapshot(userId);
  if (!snapshot) return null;
  const extras = await db.all(`
    SELECT slot_index AS slotIndex, state_json AS stateJson
    FROM player_card_instance_state
    WHERE user_id=?
  `, [userId]);
  const stateBySlot = new Map(extras.map((row) => [Number(row.slotIndex), safeJsonParse(row.stateJson)]));
  const cards = snapshot.cardInventory.cards.map((card) => {
    const extra = stateBySlot.get(Number(card.slotIndex)) ?? {};
    return {
      ...card,
      exp: Math.max(0, Math.floor(Number(extra.exp) || 0)),
      customName: String(extra.customName || '').trim().slice(0, 24) || null,
      awakened: Boolean(extra.awakened),
      attributeRoll: normalizeAttributeRoll(extra.attributeRoll),
      powderSpent: normalizePowderSpent(extra.powderSpent),
    };
  });
  return { slotCount: snapshot.cardInventory.slotCount, cards };
}

export async function getCardInventoryHandler(req, res) {
  const cardInventory = await readCardInventory(req.user.id);
  if (!cardInventory) return res.status(404).json({ message: '玩家数据不存在' });
  return res.json(cardInventory);
}

export async function putCardInventoryHandler(req, res) {
  const slotCount = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.floor(Number(req.body?.slotCount) || MIN_SLOTS)));
  if (!Array.isArray(req.body?.cards) || req.body.cards.length > MAX_CARDS) {
    return res.status(400).json({ message: '卡牌背包数据无效' });
  }

  const cards = req.body.cards.map((card) => normalizeCard(card, slotCount));
  if (cards.some((card) => !card)) return res.status(400).json({ message: '卡牌数据无效' });
  if (new Set(cards.map((card) => card.slotIndex)).size !== cards.length) {
    return res.status(400).json({ message: '卡牌槽位重复' });
  }

  const current = await db.all(
    'SELECT card_id AS cardId FROM player_cards WHERE user_id=? ORDER BY slot_index',
    [req.user.id],
  );
  if (!sameCardCollection(current.map((row) => Number(row.cardId)), cards.map((card) => card.cardId))) {
    return res.status(409).json({ message: '卡牌新增或移除必须通过掉落、打造或合成系统完成' });
  }

  await withTransaction(async (conn) => {
    await conn.run('DELETE FROM player_cards WHERE user_id=?', [req.user.id]);
    await conn.run('DELETE FROM player_card_instance_state WHERE user_id=?', [req.user.id]);
    for (const card of cards) {
      await conn.run(
        'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
        [req.user.id, card.slotIndex, card.cardId, card.star, card.craftQuality],
      );
      await conn.run(
        'INSERT INTO player_card_instance_state(user_id,slot_index,state_json) VALUES(?,?,?)',
        [req.user.id, card.slotIndex, JSON.stringify({
          exp: card.exp,
          customName: card.customName,
          awakened: card.awakened,
          attributeRoll: card.attributeRoll,
          powderSpent: card.powderSpent,
        })],
      );
    }
    await conn.run('UPDATE player_card_bags SET slot_count=? WHERE user_id=?', [slotCount, req.user.id]);
  });

  return res.json(await readCardInventory(req.user.id));
}
