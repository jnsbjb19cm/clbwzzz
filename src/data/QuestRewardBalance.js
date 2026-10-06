export const CARD_EGG_IDS = Object.freeze({ 1: 93, 2: 94, 3: 95, 4: 96, 5: 97 });

export const QUEST_ITEM_IDS = Object.freeze({
  powder: { 1: 10001, 2: 10002, 3: 10003, 4: 10004, 5: 10005 },
  parchment: { 1: 50001, 2: 50002, 3: 50003, 4: 50004 },
  gem: { 1: 50011, 2: 50012, 3: 50013, 4: 50014 },
  charm: { 1: 50021, 2: 50022, 3: 50023, 4: 50024 },
  dna: { 1: 50031, 2: 50032, 3: 50033, 4: 50034 },
  reverse: 50041,
  rerollQuality: 80,
  rerollStat: 81,
  qualityStone: 82,
  skillBookAttack: 84,
});

function clampTier(value, max = 5) {
  return Math.max(1, Math.min(max, Math.floor(Number(value) || 1)));
}

function pushItem(items, id, count = 1) {
  const itemId = Number(id);
  const qty = Math.max(1, Math.floor(Number(count) || 1));
  if (!Number.isFinite(itemId) || itemId <= 0) return;
  const old = items.find((it) => Number(it.id) === itemId);
  if (old) old.count += qty;
  else items.push({ id: itemId, count: qty });
}

const PROFILE_BASE = Object.freeze({
  main_step:       { gold: [420,620,850,1100,1400], exp: [140,210,300,400,520], honor: [0,8,14,20,28], gem: [0,0,0,2,3] },
  main_checkpoint: { gold: [800,1150,1550,2050,2700], exp: [260,380,520,680,860], honor: [10,18,28,40,55], gem: [0,2,3,5,8] },
  main_boss:       { gold: [1400,2100,3000,4100,5400], exp: [420,600,820,1050,1350], honor: [30,45,65,90,120], gem: [3,5,8,12,18] },
  main_final:      { gold: [6500,6500,6500,6500,6500], exp: [1800,1800,1800,1800,1800], honor: [260,260,260,260,260], gem: [50,50,50,50,50] },
  side:            { gold: [320,480,680,900,1200], exp: [90,130,180,240,320], honor: [0,0,8,12,18], gem: [0,0,0,0,2] },
  side_growth:     { gold: [380,560,760,980,1300], exp: [100,150,210,280,360], honor: [0,6,10,16,24], gem: [0,0,0,2,3] },
  side_social:     { gold: [400,600,800,1050,1350], exp: [90,130,180,230,300], honor: [12,20,30,42,58], gem: [0,0,2,3,5] },
  daily:           { gold: [220,280,340,400,460], exp: [55,70,85,100,120], honor: [0,0,0,0,0], gem: [0,0,0,0,0] },
  weekly:          { gold: [1300,1700,2200,2800,3500], exp: [280,360,470,600,760], honor: [20,30,45,65,90], gem: [0,0,3,5,8] },
  achievement:     { gold: [1000,1800,3000,4800,7500], exp: [0,0,0,0,0], honor: [35,65,110,180,300], gem: [3,6,10,18,30] },
  challenge:       { gold: [1200,2000,3200,4800,6800], exp: [300,450,650,900,1200], honor: [35,60,95,145,220], gem: [3,6,10,16,25] },
  challenge_boss:  { gold: [1800,2700,3900,5400,7200], exp: [420,600,820,1080,1400], honor: [55,80,120,170,240], gem: [5,8,12,18,28] },
});

function profileBase(profile, tier) {
  const row = PROFILE_BASE[profile] || PROFILE_BASE.side;
  const i = clampTier(tier) - 1;
  return {
    gold: row.gold[i] || 0,
    exp: row.exp[i] || 0,
    honor: row.honor[i] || 0,
    gem: row.gem[i] || 0,
  };
}

function themedItems(theme, tier, profile) {
  const t = clampTier(tier);
  const mt = clampTier(t, 4);
  const items = [];
  const ids = QUEST_ITEM_IDS;

  // 普通任务只给“一小步”养成资源，不再按数组位置自动发大礼包。
  if (theme === 'adventure') {
    pushItem(items, ids.powder[t], 2 + t);
  } else if (theme === 'strengthen') {
    pushItem(items, ids.powder[t], 3 + t * 2);
    if (t >= 3 && !profile.startsWith('daily')) pushItem(items, ids.charm[Math.min(4, t - 1)], 1);
  } else if (theme === 'craft') {
    pushItem(items, ids.parchment[mt], 2);
    pushItem(items, ids.gem[mt], 3);
    if (t >= 4) pushItem(items, ids.dna[mt], 1);
  } else if (theme === 'material') {
    const sourceTier = Math.max(1, mt - 1);
    pushItem(items, ids.parchment[sourceTier], 5 + t);
    pushItem(items, ids.gem[sourceTier], 5 + t);
  } else if (theme === 'boss') {
    pushItem(items, ids.dna[mt], 1 + Math.ceil(t / 2));
    pushItem(items, ids.charm[mt], 1);
  } else if (theme === 'collection') {
    // 收集任务不给同类材料，改给强化粉，避免“交材料又返同材料”的空转。
    pushItem(items, ids.powder[t], 2 + t);
  } else if (theme === 'workshop') {
    pushItem(items, ids.powder[t], 2 + t);
    pushItem(items, ids.parchment[mt], 1 + Math.floor(t / 2));
  }

  // 日常只保留轻量补给；周常和大节点才可能给额外物品。
  if (profile === 'daily' && items.length > 1) return items.slice(0, 1);
  return items;
}

function mergeItems(...groups) {
  const out = [];
  for (const group of groups) for (const item of group || []) pushItem(out, item.id, item.count);
  return out;
}

function defaultProfile(category) {
  return ({
    main: 'main_step',
    side: 'side',
    daily: 'daily',
    weekly: 'weekly',
    achievement: 'achievement',
    challenge: 'challenge',
  })[category] || 'side';
}

export function balanceQuestReward(entry, category) {
  const profile = entry.rewardProfile || defaultProfile(category);
  const tier = clampTier(entry.rewardTier || 1);
  const base = profileBase(profile, tier);
  const theme = entry.rewardTheme || (
    entry.bossId ? 'boss'
      : entry.event === 'card_strengthen' ? 'strengthen'
      : entry.event === 'card_craft' ? 'craft'
      : entry.event === 'material_combine' ? 'material'
      : ['adventure_complete','battle_complete','battle_win','battle_nodeath','battle_duration'].includes(entry.event) ? 'adventure'
      : entry.event === 'item_gain' ? 'collection'
      : entry.event === 'card_upgrade' ? 'workshop'
      : null
  );
  const themed = themedItems(theme, tier, profile);
  const items = mergeItems(themed, entry.items);

  return {
    ...entry,
    gold: entry.gold ?? base.gold,
    exp: entry.exp ?? base.exp,
    honor: entry.honor ?? base.honor,
    gem: entry.gem ?? base.gem,
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
  const mt = clampTier(tier, 4);
  const milestone = lv % 5 === 0;
  const major = lv % 10 === 0;
  const items = [];

  // 每级只给轻量成长补给，避免等级奖励本身压过关卡掉落。
  pushItem(items, QUEST_ITEM_IDS.powder[tier], 2 + tier + (milestone ? 2 : 0));

  if (milestone) {
    const eggTier = lv <= 10 ? 1 : lv <= 20 ? 2 : lv <= 30 ? 3 : lv <= 40 ? 4 : 5;
    pushItem(items, CARD_EGG_IDS[eggTier], lv === 50 ? 2 : 1);
    pushItem(items, QUEST_ITEM_IDS.parchment[mt], 2);
    pushItem(items, QUEST_ITEM_IDS.gem[mt], 3);
  }

  // 十级节点给真正有辨识度的功能道具，而不是继续堆普通材料。
  if (lv === 20) pushItem(items, QUEST_ITEM_IDS.rerollStat, 1);
  if (lv === 30) pushItem(items, QUEST_ITEM_IDS.rerollQuality, 1);
  if (lv === 40) pushItem(items, QUEST_ITEM_IDS.skillBookAttack, 1);
  if (lv === 50) pushItem(items, QUEST_ITEM_IDS.qualityStone, 1);

  return {
    id: `lv${lv}`,
    lv,
    goal: lv,
    name: `等级 ${lv}`,
    desc: `角色达到 Lv.${lv}`,
    story: milestone
      ? `达到 Lv.${lv}。这是一个阶段节点，领取对应的成长补给。`
      : '等级提升后可领取一份基础补给。',
    gold: 180 + lv * 55 + (milestone ? 500 + lv * 20 : 0),
    gem: major ? 8 + Math.floor(lv / 5) : (milestone ? 3 + Math.floor(lv / 10) : 0),
    honor: milestone ? 20 + lv * 2 : 0,
    exp: 0,
    cards: [],
    items,
  };
}
