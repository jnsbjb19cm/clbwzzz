export const CARD_EGG_IDS = Object.freeze({ 1: 93, 2: 94, 3: 95, 4: 96, 5: 97 });

// Keep identities/progress stable while replacing the old fixed-card giveaways.
export function balanceQuestReward(entry, category, index) {
  const milestone = category === 'main' && (index + 1) % 7 === 0;
  const value = Math.max(Number(entry.gold) || 0, (Number(entry.exp) || 0) * 6,
    (Number(entry.gem) || 0) * 100, (Number(entry.honor) || 0) * 30);
  const tier = category === 'main' ? Math.min(5, 1 + Math.floor(index / 7))
    : value >= 20000 ? 5 : value >= 10000 ? 4 : value >= 4500 ? 3 : value >= 1800 ? 2 : 1;
  const periodic = category === 'daily' || category === 'weekly';
  const count = (periodic ? 2 : 3) + tier + (category === 'weekly' ? 3 : 0);
  const items = [{ id: 10000 + tier, count }];
  // Alternate usable crafting supplies and skill growth rewards at comparable effort.
  if (index % 3 === 0) items.push({ id: 50000 + Math.min(4, tier), count: Math.max(1, tier - 1) });
  if (index % 3 === 1) items.push({ id: 50030 + Math.min(4, tier), count: Math.max(1, tier - 1) });
  if (index % 3 === 2) items.push({ id: 50020 + Math.min(4, tier), count: 1 });
  if ((entry.cards?.length || milestone) && !periodic) items.push({ id: CARD_EGG_IDS[tier], count: 1 });
  if (category === 'weekly' || milestone || (category === 'achievement' && tier >= 3)) {
    items.push({ id: 84 + index % 3, count: 1 });
  }
  return { ...entry, cards: [], items };
}

export function levelReward(lv) {
  const tier = Math.min(5, 1 + Math.floor((lv - 1) / 10));
  const milestone = lv % 5 === 0;
  const items = [{ id: 10000 + tier, count: 3 + tier + (milestone ? 3 : 0) }];
  if (lv % 3 === 0) items.push({ id: 50000 + Math.min(4, tier), count: tier });
  if (milestone) {
    items.push({ id: CARD_EGG_IDS[lv === 10 ? 5 : Math.min(5, tier + 1)], count: 1 });
    items.push({ id: 84 + (Math.floor(lv / 5) - 1) % 3, count: 1 });
  }
  if (lv % 10 === 0) items.push({ id: 50010 + Math.min(4, tier), count: 1 });
  return {
    id: `lv${lv}`, lv, goal: lv, name: `Lv.${lv} 等级奖励`,
    desc: `角色达到 Lv.${lv} 后即可领取。`,
    story: lv === 10 ? '十级成长纪念：领取随机5级卡蛋，召唤一位新的森林勇士。' : '积累战斗经验，领取适合当前成长阶段的补给。',
    gold: 600 + lv * 200 + (milestone ? lv * 300 : 0),
    gem: lv % 2 === 0 ? 8 + Math.floor(lv / 2) : 0,
    honor: 50 + lv * 22 + (milestone ? 150 : 0),
    exp: 0, cards: [], items,
  };
}
