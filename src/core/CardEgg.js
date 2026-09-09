// Fixed-tier eggs differ from legacy packs, which can include lower-tier cards.
export function pickExactTierCard(cards, tier, random = Math.random) {
  const pool = cards.filter(card => Number(card.card_quality ?? card.quality) === Number(tier));
  if (!pool.length) throw new Error('该等级卡池为空');
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index];
}
