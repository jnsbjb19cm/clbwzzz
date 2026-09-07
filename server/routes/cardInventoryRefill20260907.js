import { withTransaction } from '../database.js';
import { getPvpCardDb } from '../battle/PvpCardDb.js';
import { readCardInventory } from './cardInventoryPersistence20260906.js';

const MAX_CARDS = 500;
const DEFAULT_SLOT_COUNT = 200;
const MAX_SLOT_COUNT = 500;

function clampSlotCount(value) {
  return Math.max(DEFAULT_SLOT_COUNT, Math.min(MAX_SLOT_COUNT, Math.floor(Number(value) || DEFAULT_SLOT_COUNT)));
}

/**
 * “补全卡”是一个明确的业务动作，因此必须由服务端改变卡牌集合。
 * 普通 PUT /card-inventory 继续只允许保存已有卡牌实例状态，不能借此新增/删除卡牌。
 */
export async function refillCollectibleCardsHandler(req, res) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ message: '登录状态无效' });
  }

  const collectibleIds = getPvpCardDb().cards
    .filter((card) => card?.isCollectible?.())
    .map((card) => Number(card.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  let added = 0;
  let skipped = 0;

  await withTransaction(async (conn) => {
    const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
    const slotCount = clampSlotCount(bag?.slotCount);
    const rows = await conn.all(
      'SELECT slot_index AS slotIndex, card_id AS cardId FROM player_cards WHERE user_id=? ORDER BY slot_index',
      [userId],
    );

    const occupied = new Set(
      rows
        .map((row) => Number(row.slotIndex))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < slotCount),
    );
    const owned = new Set(rows.map((row) => Number(row.cardId)).filter(Number.isInteger));
    const freeSlots = [];
    for (let index = 0; index < slotCount && freeSlots.length < MAX_CARDS; index += 1) {
      if (!occupied.has(index)) freeSlots.push(index);
    }

    const missing = collectibleIds.filter((cardId) => !owned.has(cardId));
    for (const cardId of missing) {
      const slotIndex = freeSlots.shift();
      if (slotIndex == null) {
        skipped += 1;
        continue;
      }
      await conn.run(
        'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
        [userId, slotIndex, cardId, 2, 5],
      );
      owned.add(cardId);
      added += 1;
    }
  });

  const inventory = await readCardInventory(userId);
  if (!inventory) return res.status(404).json({ message: '玩家数据不存在' });
  return res.json({
    ...inventory,
    added,
    skipped,
    total: inventory.cards.length,
  });
}
