/** 制作品质 2–5；旧存档 0/1 统一升级为普通，不重排其它品质编号。 */
export const CRAFT_QUALITY = {
  2: { id: 1, name: '普通', color: '#fefefe', baseLabel: '白' },
  3: { id: 2, name: '精良', color: '#4caf50', baseLabel: '绿' },
  4: { id: 3, name: '优秀', color: '#2196f3', baseLabel: '蓝' },
  5: { id: 4, name: '完美', color: '#9c27b0', baseLabel: '紫' },
};

/** 品质倍率 P(基础品质 0/1 对齐 card.json，1:1)。 */
export const CRAFT_QUALITY_MULT = Object.freeze({
  1: 1.0,
  2: 1.0,
  3: 1.0,
  4: 1.22,
  5: 1.5,
  6: 1.8,
});

export function normalizeCraftQuality(craftQuality) {
  const value = Number(craftQuality);
  if (value === 0 || value === 1) return 2;
  return Object.hasOwn(CRAFT_QUALITY_MULT, value) ? value : 2;
}

export function resolveCraftQuality(craftQuality) {
  return CRAFT_QUALITY[normalizeCraftQuality(craftQuality)] ?? CRAFT_QUALITY[2];
}

/** 卡牌等级 → 手牌卡槽背景 card_bg_1~6。 */
export function getCardQualityBgPart(cardQuality) {
  const quality = Number(cardQuality);
  const background = Number.isFinite(quality) ? Math.min(6, Math.max(1, quality)) : 1;
  return `card_bg_${background}`;
}

/** 强化等级 → 现有星条素材；7星以上仍使用最高星条图。 */
export function getStrengthStarPart(strengthLv) {
  const level = Number(strengthLv) || 0;
  return `single_star_${Math.min(6, Math.max(0, level))}`;
}

export function getCraftQualityCircleColor(craftQuality) {
  return resolveCraftQuality(craftQuality).color;
}

/** @deprecated 使用 drawQualityCircle + getCraftQualityCircleColor。 */
export function getCraftQualityCircleFilter(craftQuality) {
  const id = normalizeCraftQuality(craftQuality);
  const filters = {
    1: 'grayscale(1) brightness(0.75)',
    2: 'brightness(1.15) saturate(0.35)',
    3: 'hue-rotate(270deg) saturate(1.35) brightness(1.05)',
    4: 'hue-rotate(85deg) saturate(1.4) brightness(1.05)',
    5: 'hue-rotate(20deg) saturate(1.5) brightness(1.08)',
  };
  return filters[id] ?? filters[2];
}

export function formatCraftCardName(craftQuality, cardName, customName) {
  const name = (customName || '').trim() || cardName;
  return `${resolveCraftQuality(craftQuality).name}的${name}`;
}

export const CUSTOM_CARD_NAME_MAX_LENGTH = 20;

/** 防恶意修改：仅允许安全可见字符，长度受限，去除控制符/方向符/HTML危险字符 */
export function sanitizeCustomCardName(value, maxLength = CUSTOM_CARD_NAME_MAX_LENGTH) {
  if (value == null) return '';
  if (typeof value !== 'string') return '';
  let text = value;
  text = text
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '')
    .replace(/[<>"'&\\`]/g, '')
    .trim();
  const chars = Array.from(text);
  if (chars.length > maxLength) text = chars.slice(0, maxLength).join('');
  return text;
}

/** 卡牌稀有度的制作限制，与实例制作品质不是同一概念。 */
export const CRAFTABLE_MAX_QUALITY = 4;
export const ASCEND_MAX_QUALITY = 5;

export function isCraftableCard(card) {
  return card?.isCollectible?.() && card.quality <= CRAFTABLE_MAX_QUALITY;
}

export function getInstanceStatMultiplier(craftQuality = 2, strengthLv = 0) {
  const quality = normalizeCraftQuality(craftQuality);
  const P = CRAFT_QUALITY_MULT[quality];
  return P + getStarGrowthBonus(strengthLv, 0.08, 0.06);
}

/** 前5星收益不变；第6星起小幅收紧成长，不改星级、品质和强化成本。 */
function getStarGrowthBonus(stars, earlyRate, lateRate) {
  const value = Math.max(0, Number(stars) || 0);
  return earlyRate * Math.min(5, value) + lateRate * Math.max(0, value - 5);
}

export function getInstanceHpMultiplier(craftQuality, stars, defense = false, defenseBonus = 0) {
  const P = CRAFT_QUALITY_MULT[normalizeCraftQuality(craftQuality)];
  return defense
    ? P + getStarGrowthBonus(stars, 0.08, 0.06) + 0.08 * defenseBonus
    : P + getStarGrowthBonus(stars, 0.05, 0.04);
}

export function getStarAtkBonus(stars) {
  const value = Math.max(0, Number(stars) || 0);
  if (value >= 14) return 6;
  if (value >= 13) return 5;
  if (value >= 12) return 4;
  if (value >= 10) return 3;
  if (value >= 6) return 1;
  return 0;
}

/** 基础冷却大于6才缩减；2、4、8星各触发一次，但总上限为2。 */
export function getStarCdReduce(baseCd, stars) {
  const cooldown = Math.max(0, Number(baseCd) || 0);
  if (cooldown <= 6) return 0;
  const value = Math.max(0, Number(stars) || 0);
  let reduction = 0;
  if (value >= 2) reduction += 1;
  if (value >= 4) reduction += 1;
  if (value >= 8) reduction += 1;
  return Math.min(2, reduction);
}

/** 防御加成V仅有2星和4星两个里程碑。 */
export function getStarDefBonus(stars) {
  const value = Math.max(0, Number(stars) || 0);
  let bonus = 0;
  if (value >= 2) bonus += 1;
  if (value >= 4) bonus += 1;
  return bonus;
}

export const DEFENSE_CARD_IDS = new Set([2, 11, 21, 34, 88, 90]);

/**
 * 核心公式：
 * mult = P + 0.08×min(Q,5) + 0.06×max(Q−5,0)
 * atk  = (card_atk + R) × mult
 * hp   = card_hp × getInstanceHpMultiplier(品质,Q,防御卡,V)
 *        前5星：普通生命每星5%，防御生命8%；之后分别为4%、6%。
 * cd   = max(6, card_cooldown − M)
 */
export function calcCardStats(card, craftQuality, stars) {
  const Q = Math.max(0, Number(stars) || 0);
  const quality = normalizeCraftQuality(craftQuality);
  const P = CRAFT_QUALITY_MULT[quality];
  const baseAtk = Math.max(0, Number(card?.atk ?? card?.card_atk) || 0);
  const R = baseAtk > 0 ? getStarAtkBonus(Q) : 0;
  const baseCd = Math.max(0, Number(card?.cooldown ?? card?.card_cd) || 0);
  const M = getStarCdReduce(baseCd, Q);
  const mult = getInstanceStatMultiplier(quality, Q);
  const isDef = Number(card?.atkStyle ?? card?.atk_style) === 1;
  const V = isDef && baseCd <= 6 ? getStarDefBonus(Q) : 0;
  const hpMult = getInstanceHpMultiplier(quality, Q, isDef, V);
  const baseHp = Math.max(0, Number(card?.hp ?? card?.card_hp) || 0);
  return {
    atk: Math.round((baseAtk + R) * mult * 100) / 100,
    hp: Math.round(baseHp * hpMult * 100) / 100,
    cd: Math.max(6, baseCd - M),
    atkBase: baseAtk,
    hpBase: baseHp,
    cdBase: baseCd,
    qualityP: P,
    stars: Q,
    atkBonus: R,
    cdReduce: M,
    defV: V,
    hpMult,
    mult,
  };
}

/** 卡牌自身稀有度。1，2，3，4，5等级卡 */
export const CARD_QUALITY = {
  1: { id: 1, name: '1级卡', color: '#9e9e9e' },
  2: { id: 2, name: '2级卡', color: '#4caf50' },
  3: { id: 3, name: '3级卡', color: '#2196f3' },
  4: { id: 4, name: '4级卡', color: '#9c27b0' },
  5: { id: 5, name: '5级卡', color: '#ff9800' },
  6: { id: 6, name: '6级卡', color: '#f44336' },
  999: { id: 999, name: '特殊', color: '#607d8b' },
};

export const CARD_TYPE = {
  1: '攻击',
  2: '辅助',
  3: '陷阱',
  4: '主动技能',
};

export const ATK_STYLE = {
  1: '纯防御',
  2: '远程',
  3: '对空远程',
  5: '弱对空',        // 2026-10-12：玉米炮手/幼小玉米专用档（优先打空中，但只在空中目标是最近目标时）
  4: '吞噬',
  6: '钻地',
  7: '近战',
  9: '地刺',
  10: '主动技能',
  11: '吸走',
  14: '雷电',
  15: '地雷',
  17: '范围喷吐',
  18: '燃烧瓶',
  19: '冻结法术',
  8: '预留',        // 预留空档（暂无卡使用，留给以后的机制，避免再蹭公共档位）
};

export const VIEW_TYPE = {
  1: '远程',
  2: '近战',
  3: '盾牌',
  4: '光环',
  5: '地刺/陷阱',
  6: '飞行',
  7: '钻地',
  9: '技能卡',
};

export const BAG_MAX_STACK = 9999;
export const TRIAL_ITEM_SLOT_COUNT = 60;
