import { withTransaction } from '../database.js';
// 未开放卡（与服务端一致）：126 = 怪物冷萃机，以后才上线
const UNRELEASED_CARD_IDS = new Set([126]);

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
    // “补全卡”只补白~金卡；红卡（原始 card_quality=6）保留为正常获取内容。
    // 2026-10-14 用户反馈"补完卡再改品质，补的卡没了"：
    // 根因是本过滤与服务端/客户端不一致 —— 原来按 < 6 排除，于是 55(战争古树)/118(狂暴法师)
    // 这类 quality=6 的卡**只有客户端有**；一旦某次服务端同步（改品质那条路）回写卡表，
    // 本地这几张就被覆盖没了。
    // 现在改为与客户端同一套规则：可收藏 && **不在未开放名单**（其它一律补），
    // 这样两边卡表完全一致，任何同步都不会再"吃掉"卡。
    .filter((card) => card?.isCollectible?.() && !UNRELEASED_CARD_IDS.has(Number(card.id)))
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
