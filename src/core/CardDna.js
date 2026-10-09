import cards from '../data/card.json' with { type: 'json' };
import { resetDnaId } from '../data/ResetEconomy.js';

export const DNA_DROP_CHANCE = 0.02;
const eligible = cards.filter(c => Number(c.show_card) === 1 && Number(c.card_id) < 500
  && ![122, 123, 124].includes(Number(c.card_id)) && c.card_quality >= 1 && c.card_quality <= 4);
export const CARD_DNA_ITEMS = eligible.map(c => ({
  item_id: resetDnaId(c.card_id), item_name: `${c.card_name} DNA`, quality: Number(c.card_quality),
  cardId: Number(c.card_id), item_type: 2, item_img: 50030 + Number(c.card_quality), sell_price: 0,
  desc: `${c.card_quality}级专属DNA，仅用于合成${c.card_name}；可替代同等级通用DNA，升变时原样返还。`,
}));
const byId = new Map(CARD_DNA_ITEMS.map(item => [item.item_id, item]));
export const cardDnaItem = id => byId.get(Number(id));
export function dnaCandidates(card) {
  const level = Number(card?.quality ?? card?.card_quality);
  if (!(level >= 1 && level <= 4)) return [];
  const specific = resetDnaId(card.id ?? card.card_id);
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
