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
const DB_DNA_BY_CARD_NAME = new Map();
for (const entry of items) {
  const matched = /^(.+?)DNA$/.exec(String(entry.item_name ?? '').trim());
  if (matched) DB_DNA_BY_CARD_NAME.set(matched[1].trim(), Number(entry.item_id));
}

/** 这张卡对应的「专属DNA」道具 id：数据库优先，其次才是生成 id。 */
export function specificDnaIdFor(card) {
  const name = String(card?.card_name ?? card?.name ?? '').trim();
  const fromDb = DB_DNA_BY_CARD_NAME.get(name);
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;
  return resetDnaId(card?.id ?? card?.card_id);
}

export const DNA_DROP_CHANCE = 0.02;
const eligible = cards.filter(c => Number(c.show_card) === 1 && Number(c.card_id) < 500
  && ![122, 123, 124].includes(Number(c.card_id)) && c.card_quality >= 1 && c.card_quality <= 4);
export const CARD_DNA_ITEMS = eligible.map((c) => {
  const dbId = DB_DNA_BY_CARD_NAME.get(String(c.card_name).trim());
  const useDb = Number.isFinite(dbId) && dbId > 0;
  return {
    item_id: useDb ? dbId : resetDnaId(c.card_id),
    item_name: useDb ? `${c.card_name}DNA` : `${c.card_name} DNA`,
    quality: Number(c.card_quality),
    cardId: Number(c.card_id), item_type: 2, item_img: 50030 + Number(c.card_quality), sell_price: 0,
    fromDatabase: useDb,
    desc: `${c.card_quality}级专属DNA，仅用于合成${c.card_name}；可替代同等级通用DNA，升变时原样返还。`,
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
