export const CARD_EGG_IDS = Object.freeze({ 1: 93, 2: 94, 3: 95, 4: 96, 5: 97 });

const POWDER_IDS = Object.freeze({ 1: 10001, 2: 10002, 3: 10003, 4: 10004, 5: 10005 });
const PARCHMENT_IDS = Object.freeze({ 1: 50001, 2: 50002, 3: 50003, 4: 50004 });
const GEM_IDS = Object.freeze({ 1: 50011, 2: 50012, 3: 50013, 4: 50014 });
const CHARM_IDS = Object.freeze({ 1: 50021, 2: 50022, 3: 50023, 4: 50024 });
const DNA_IDS = Object.freeze({ 1: 50031, 2: 50032, 3: 50033, 4: 50034 });

function clampTier(tier, max = 5) {
  return Math.max(1, Math.min(max, Number(tier) || 1));
}

function questTier(category, index) {
  if (category === 'main') return clampTier(1 + Math.floor(index / 7));
  if (category === 'side') return clampTier(1 + Math.floor(index / 12));
  if (category === 'daily') return clampTier(1 + Math.floor(index / 4));
  if (category === 'weekly') return clampTier(2 + Math.floor(index / 4));
  if (category === 'achievement') return clampTier(1 + Math.floor(index / 4));
  if (category === 'challenge') return clampTier(3 + Math.floor(index / 5));
  return 1;
}

function pushItem(items, id, count) {
  const itemId = Number(id);
  const qty = Math.max(1, Math.floor(Number(count) || 1));
  const old = items.find((it) => Number(it.id) === itemId);
  if (old) old.count += qty;
  else items.push({ id: itemId, count: qty });
}

function basicMaterialPack(category, tier, index, event) {
  const items = [];
  const matTier = clampTier(tier, 4);
  const base = {
    main: 10,
    side: 8,
    daily: 5,
    weekly: 15,
    achievement: 12,
    challenge: 16,
  }[category] ?? 8;

  // 强化粉是最常见成长资源；高阶任务给对应阶级而不是大量一级材料。
  pushItem(items, POWDER_IDS[tier], base + tier * 2);

  // 按任务玩法把第二奖励定向到对应养成资源，避免所有任务都发同一套东西。
  if (event === 'card_strengthen' || event === 'card_upgrade') {
    pushItem(items, PARCHMENT_IDS[matTier], Math.max(4, Math.ceil(base * 0.7)));
    if (tier >= 3) pushItem(items, CHARM_IDS[matTier], Math.max(2, Math.floor(tier / 2)));
  } else if (event === 'card_craft' || event === 'material_combine' || event === 'item_synthesis') {
    pushItem(items, PARCHMENT_IDS[matTier], base);
    pushItem(items, DNA_IDS[matTier], Math.max(3, Math.ceil(base * 0.45)));
  } else if (event === 'adventure_complete' || event === 'battle_complete' || event === 'battle_win') {
    pushItem(items, PARCHMENT_IDS[matTier], Math.max(5, Math.ceil(base * 0.75)));
    if (index % 2 === 0) pushItem(items, GEM_IDS[matTier], Math.max(3, Math.ceil(base * 0.35)));
  } else {
    pushItem(items, PARCHMENT_IDS[matTier], Math.max(4, Math.ceil(base * 0.6)));
    if (index % 3 === 0) pushItem(items, DNA_IDS[matTier], Math.max(3, Math.ceil(base * 0.35)));
  }

  return items;
}

// 保留任务 ID / 进度链，只重做任务奖励。测试任务 d14 的 380000 经验明确不参与平衡。
export function balanceQuestReward(entry, category, index) {
  const tier = questTier(category, index);
  const items = basicMaterialPack(category, tier, index, entry.event);
  const milestone = category === 'main' && (index + 1) % 5 === 0;
  const majorMilestone = category === 'main' && (index + 1) % 10 === 0;

  // 普通任务主要给材料；卡蛋只出现在阶段节点、较高成就和挑战中。
  if (milestone) pushItem(items, CARD_EGG_IDS[Math.min(5, majorMilestone ? tier + 1 : tier)], majorMilestone ? 2 : 1);
  if (category === 'weekly' && index % 3 === 2) pushItem(items, CARD_EGG_IDS[Math.min(5, tier)], 1);
  if (category === 'achievement' && tier >= 3 && index % 4 === 3) pushItem(items, CARD_EGG_IDS[Math.min(5, tier)], 1);
  if (category === 'challenge' && index % 5 === 4) pushItem(items, CARD_EGG_IDS[Math.min(5, tier)], 2);

  // BOSS相关任务偏向DNA与保护符，不直接赠送BOSS成品卡。
  if (entry.bossId) {
    pushItem(items, DNA_IDS[Math.min(4, tier)], 10 + tier * 2);
    pushItem(items, CHARM_IDS[Math.min(4, tier)], Math.max(2, tier));
  }

  // 若任务本身显式指定了道具奖励，叠加而不是覆盖。
  for (const it of entry.items || []) pushItem(items, it.id, it.count);

  return {
    ...entry,
    exp: entry.id === 'd14' ? 380000 : (Number(entry.exp) || 0),
    cards: Array.isArray(entry.cards) ? entry.cards : [],
    items,
  };
}

function levelTier(lv) {
  if (lv <= 10) return 1;
  if (lv <= 20) return 2;
  if (lv <= 30) return 3;
  if (lv <= 40) return 4;
  return 5;
}

export function levelReward(lv) {
  const tier = levelTier(lv);
  const matTier = clampTier(tier, 4);
  const milestone = lv % 5 === 0;
  const major = lv % 10 === 0;
  const items = [];

  // 每一级都有小补给。
  pushItem(items, POWDER_IDS[tier], 4 + tier * 2 + (milestone ? 6 : 0));
  pushItem(items, PARCHMENT_IDS[matTier], 3 + tier + (milestone ? 5 : 0));

  // 每5级明显礼包；每10级再提高卡蛋数量。
  if (milestone) {
    if (lv === 5) pushItem(items, CARD_EGG_IDS[1], 1);
    else if (lv === 10) pushItem(items, CARD_EGG_IDS[1], 2);
    else if (lv === 15) pushItem(items, CARD_EGG_IDS[2], 1);
    else if (lv === 20) pushItem(items, CARD_EGG_IDS[2], 2);
    else if (lv === 25) pushItem(items, CARD_EGG_IDS[3], 1);
    else if (lv === 30) pushItem(items, CARD_EGG_IDS[3], 1);
    else if (lv === 35) pushItem(items, CARD_EGG_IDS[4], 1);
    else if (lv === 40) pushItem(items, CARD_EGG_IDS[4], 2);
    else if (lv === 45) pushItem(items, CARD_EGG_IDS[5], 2);
    else if (lv === 50) pushItem(items, CARD_EGG_IDS[5], 3);

    pushItem(items, GEM_IDS[matTier], 3 + tier * 2);
    pushItem(items, DNA_IDS[matTier], lv >= 35 ? 10 + tier * 2 : 5 + tier);
  }

  if (major) pushItem(items, CHARM_IDS[matTier], Math.max(2, tier + 1));

  return {
    id: `lv${lv}`,
    lv,
    goal: lv,
    name: `Lv.${lv} 等级奖励`,
    desc: `角色达到 Lv.${lv} 后即可领取。`,
    story: milestone
      ? `达到 Lv.${lv}，任务猫头鹰为你送来阶段成长礼包。继续强化战团，准备迎接更高难度的冒险与BOSS挑战。`
      : '等级提升后领取日常成长补给，为后续冒险、强化和制作积累材料。',
    gold: 500 + lv * 180 + (milestone ? lv * 220 : 0),
    gem: major ? 20 + lv : (milestone ? 10 + Math.floor(lv / 2) : 0),
    honor: 30 + lv * 12 + (milestone ? 80 + lv * 3 : 0),
    exp: 0,
    cards: [],
    items,
  };
}
