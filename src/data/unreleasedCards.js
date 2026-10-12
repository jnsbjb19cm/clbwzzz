/**
 * 「以后要出、但当前不开放」的卡（2026-10-12 用户说明）
 *
 * 背景：怪物冷萃机(126) 是**以后会作为正式卡推出**的卡，但现在它只是敌方机制卡。
 *       它的 show_card = 1，导致被判定成"可收藏" → 「补全卡」会把它发给玩家，
 *       而服务端不认这张卡 → 战团被判定"有未拥有的卡牌"。
 *
 * 为什么不直接按"品质 6"永久排除？—— 因为这张卡以后要上线，
 * 硬编码会让上线时必须改好几个文件。所以这里做成**一张名单 + 一个开关**：
 *
 *   ★ 上线这张卡时的步骤（3 步）：
 *     1) 把它的 id 从下面的 UNRELEASED_CARD_IDS 里删掉
 *     2) 在 src/data/card.json 里把它的 card_quality 调成正常档位（1~5）
 *     3) 确认服务端 server/routes/cardInventoryRefill20260907.js 的
 *        card_quality < 6 过滤与新品质一致
 */
export const UNRELEASED_CARD_IDS = Object.freeze([126]); // 126 = 怪物冷萃机

const UNRELEASED = new Set(UNRELEASED_CARD_IDS.map((id) => Number(id)));

/** 这张卡当前是否已对玩家开放（可收藏 / 可补发 / 可入战团） */
export function isCardReleased(cardId) {
  return !UNRELEASED.has(Number(cardId));
}
