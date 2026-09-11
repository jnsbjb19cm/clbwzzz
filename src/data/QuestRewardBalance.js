export const CARD_EGG_IDS = Object.freeze({ 1: 93, 2: 94, 3: 95, 4: 96, 5: 97 });

function withAdventureGuide(entry, category, index) {
  if (category !== 'main') return entry;

  // 前两条主线直接承担“野外冒险”入口教学。
  // 保留 m1/m2 的任务 ID 与后续 requires 链，只调整实际目标和引导文案。
  if (index === 0) {
    return {
      ...entry,
      name: '初到魔幻森林',
      desc: '进入【野外冒险】，完成1个冒险关卡。',
      story: '任务猫头鹰带来了第一份紧急委托：从主城进入【野外冒险】，选择一个可挑战的关卡并完成战斗。先熟悉冒险地图，之后的森林防线任务都会从这里展开。',
      goal: 1,
      event: 'adventure_complete',
    };
  }

  if (index === 1) {
    return {
      ...entry,
      name: '冒险的号角',
      desc: '在【野外冒险】累计完成3个关卡。',
      story: '你已经熟悉了第一次出征。继续从主城进入【野外冒险】，沿着森林道路推进，完成累计3个冒险关卡，为埃尔夫守卫清理前线道路。',
      goal: 3,
      event: 'adventure_complete',
    };
  }

  return entry;
}

// Keep identities/progress stable while replacing the old fixed-card giveaways.
export function balanceQuestReward(entry, category, index) {
  const guidedEntry = withAdventureGuide(entry, category, index);
  const milestone = category === 'main' && (index + 1) % 7 === 0;
  const value = Math.max(Number(guidedEntry.gold) || 0, (Number(guidedEntry.exp) || 0) * 6,
    (Number(guidedEntry.gem) || 0) * 100, (Number(guidedEntry.honor) || 0) * 30);
  const tier = category === 'main' ? Math.min(5, 1 + Math.floor(index / 7))
    : value >= 20000 ? 5 : value >= 10000 ? 4 : value >= 4500 ? 3 : value >= 1800 ? 2 : 1;
  const periodic = category === 'daily' || category === 'weekly';

  // 试玩阶段任务奖励更慷慨：基础材料约为旧版的 2~3 倍，
  // 周常、挑战和主线里程碑再额外提高，减少玩家卡养成材料的情况。
  const categoryBonus = {
    main: 5,
    side: 3,
    daily: 2,
    weekly: 8,
    achievement: 5,
    challenge: 8,
  }[category] ?? 3;
  const count = (periodic ? 4 : 6) + tier * 2 + categoryBonus + (category === 'weekly' ? 4 : 0);
  const items = [{ id: 10000 + tier, count }];

  // 制作、技能成长类材料同样提高，避免任务只给大量单一基础材料。
  const growthCount = Math.max(2, tier * 2 + (category === 'weekly' ? 2 : 0));
  if (index % 3 === 0) items.push({ id: 50000 + Math.min(4, tier), count: growthCount });
  if (index % 3 === 1) items.push({ id: 50030 + Math.min(4, tier), count: growthCount });
  if (index % 3 === 2) items.push({ id: 50020 + Math.min(4, tier), count: Math.max(2, Math.ceil(tier / 2)) });

  // 卡蛋属于高价值奖励，不做无脑翻倍；主线阶段里程碑和高阶挑战才额外给 1 个。
  if ((guidedEntry.cards?.length || milestone) && !periodic) {
    const eggCount = milestone || (category === 'challenge' && tier >= 4) ? 2 : 1;
    items.push({ id: CARD_EGG_IDS[tier], count: eggCount });
  }

  // 原本只有 1 个的稀有补给也提高到 2~3 个。
  if (category === 'weekly' || milestone || (category === 'achievement' && tier >= 3)) {
    items.push({ id: 84 + index % 3, count: category === 'weekly' ? 3 : 2 });
  }

  return { ...guidedEntry, cards: [], items };
}

export function levelReward(lv) {
  const tier = Math.min(5, 1 + Math.floor((lv - 1) / 10));
  const milestone = lv % 5 === 0;

  // 等级奖励同步增量，避免任务奖励提高后等级奖励反而显得太少。
  const items = [{ id: 10000 + tier, count: 7 + tier * 2 + (milestone ? 5 : 0) }];
  if (lv % 3 === 0) items.push({ id: 50000 + Math.min(4, tier), count: Math.max(2, tier * 2) });
  if (milestone) {
    items.push({ id: CARD_EGG_IDS[lv === 10 ? 5 : Math.min(5, tier + 1)], count: lv % 10 === 0 ? 2 : 1 });
    items.push({ id: 84 + (Math.floor(lv / 5) - 1) % 3, count: 2 });
  }
  if (lv % 10 === 0) items.push({ id: 50010 + Math.min(4, tier), count: 2 });
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
