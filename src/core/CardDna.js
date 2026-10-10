import cards from '../data/card.json' with { type: 'json' };
import items from '../data/item.json' with { type: 'json' };
import { resetDnaId } from '../data/ResetEconomy.js';

/**
 * 2026-10-10（用户反馈）：「明明数据库里面有专属DNA，为什么还要再格外添加一个卡牌专属的DNA？」
 *
 * 确实重复了：item.json 里本来就有 49 条 `XXDNA`（id 30001~30058，玩家真正持有的就是这些），
 * 而这里又按 71000+卡id 生成了一整套（78 条）—— 于是背包里出现两种同名的「XX DNA」，
 * 更糟的是 dnaCandidates() 只认 71000+ 那套，**玩家手里的 30057 反倒用不了**。
 *
 * 现在改成：优先复用数据库里的 DNA 道具；数据库里没有对应条目时才回退到生成 id。
 */
// 2026-10-10（用户补充）：「卡牌DNA人家都有对应的图片，你现在用了个通用图片可不行，
// 图片索引都要正确的引用」—— 所以这里存的不是 id，而是**整条数据库定义**，
// 复用时要连 item_img（每张 DNA 自己的图，如 30057）和 item_name 一起拿来。
const DB_DNA_BY_CARD_NAME = new Map();
for (const entry of items) {
  const matched = /^(.+?)DNA$/.exec(String(entry.item_name ?? '').trim());
  if (matched) DB_DNA_BY_CARD_NAME.set(matched[1].trim(), entry);
}

/** 这张卡对应的「专属DNA」道具 id：数据库优先，其次才是生成 id。 */
export function specificDnaIdFor(card) {
  const name = String(card?.card_name ?? card?.name ?? '').trim();
  const fromDb = DB_DNA_BY_CARD_NAME.get(name);
  if (fromDb && Number(fromDb.item_id) > 0) return Number(fromDb.item_id);
  return resetDnaId(card?.id ?? card?.card_id);
}

export const DNA_DROP_CHANCE = 0.02;
const eligible = cards.filter(c => Number(c.show_card) === 1 && Number(c.card_id) < 500
  && ![122, 123, 124].includes(Number(c.card_id)) && c.card_quality >= 1 && c.card_quality <= 4);
export const CARD_DNA_ITEMS = eligible.map((c) => {
  const dbRow = DB_DNA_BY_CARD_NAME.get(String(c.card_name).trim());
  const useDb = Boolean(dbRow && Number(dbRow.item_id) > 0);
  return {
    item_id: useDb ? Number(dbRow.item_id) : resetDnaId(c.card_id),
    item_name: useDb ? String(dbRow.item_name) : `${c.card_name} DNA`,
    quality: Number(c.card_quality),
    cardId: Number(c.card_id), item_type: 2,
    // 数据库有就用它自己的图（如 30057）；数据库没有的卡只能用同级通用 DNA 图。
    item_img: useDb ? Number(dbRow.item_img) : 50030 + Number(c.card_quality), sell_price: 0,
    fromDatabase: useDb,
    // 2026-10-10（用户给的原文案）：专属 DNA 的描述是「…必定为<卡名>」（句尾不加句号）。
    desc: `合成卡牌时使用，在合成添加后如果合成成功必定为${c.card_name}` ,
  };
});
const byId = new Map(CARD_DNA_ITEMS.map(item => [item.item_id, item]));
export const cardDnaItem = id => byId.get(Number(id));
export function dnaCandidates(card) {
  const level = Number(card?.quality ?? card?.card_quality);
  if (!(level >= 1 && level <= 4)) return [];
  const specific = specificDnaIdFor(card);
  return [...(byId.has(specific) ? [specific] : []), 50030 + level];
}
// Explicit choices must match BOTH target and tier. Automatic selection spends specific DNA first.
export function selectDna(card, countItem, requested = 0) {
  const choices = dnaCandidates(card);
  if (Number(requested)) return choices.includes(Number(requested)) && countItem(Number(requested)) > 0 ? Number(requested) : null;
  return choices.find(id => countItem(id) > 0) ?? null;
}
export function rollCardDna(rng = Math.random) {
  if (rng() >= DNA_DROP_CHANCE) return null;
  const tier = Math.min(4, 1 + Math.floor(rng() * 4));
  const pool = CARD_DNA_ITEMS.filter(item => item.quality === tier);
  if (rng() < 0.5 && pool.length) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].item_id;
  return 50030 + tier;
}
export function appendDnaDeathDrop(engine, unit) {
  const itemId = rollCardDna(() => engine.rng());
  if (!itemId) return null;
  const drop = { id: ++engine._lootDropSeq, itemId, count: 1, kind: 'craft-material',
    lane: unit.lane, col: unit.col, sourceUid: unit.uid, sourceCardId: unit.cardId, createdAt: engine.time };
  engine.lootDrops.push(drop);
  engine.pushLog?.(`[${unit.name}]掉落 ${cardDnaItem(itemId)?.item_name ?? `${itemId - 50030}级通用DNA`}`);
  return drop;
}

/**
 * 2026-10-10（用户给的原文案）：通用（X 级）DNA 的描述是
 * 「合成卡牌时使用，在合成添加后如果合成成功必定为选择的卡牌。」（句尾有句号）。
 * 由 ItemDatabase 合并进道具表时使用；专属 DNA 用另一句（见 CARD_DNA_ITEMS）。
 */
export function genericDnaDesc() {
  return '合成卡牌时使用，在合成添加后如果合成成功必定为选择的卡牌。';
}
