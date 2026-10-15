import {
  CRAFT_QUALITY_MULT,
  isDefenseGrowthCard,
  normalizeCraftQuality,
  getInstanceStatMultiplier,
  getInstanceHpMultiplier,
} from '../core/constants.js';

// 战斗属性必须直接使用项目统一的制作品质倍率。
// 不再在这里维护第二份倍率表，避免“劣质=普通”这类错位。
export const CRAFT_QUALITY_MULTIPLIER = CRAFT_QUALITY_MULT;

export function normalizeBattleCraftQuality(value) {
  return normalizeCraftQuality(value);
}

export function getBattleQualityMultiplier(value) {
  return CRAFT_QUALITY_MULTIPLIER[normalizeBattleCraftQuality(value)];
}

export function getStarAttackBonus(stars) {
  const value = Math.max(0, Number(stars) || 0);
  // 2026-10-15《强化削弱.md》第一轮：10星+2、12星+3、13星+4、14星起+5（原为 +3/+4/+5/+6）
  if (value >= 14) return 5;
  if (value >= 13) return 4;
  if (value >= 12) return 3;
  if (value >= 10) return 2;
  if (value >= 6) return 1;
  return 0;
}

export function getStarCooldownReduction(baseCooldown, stars) {
  const base = Math.max(0, Number(baseCooldown) || 0);
  if (base <= 6) return 0;

  const value = Math.max(0, Number(stars) || 0);
  let reduction = 0;
  if (value >= 2) reduction += 1;
  if (value >= 4) reduction += 1;
  if (value >= 8) reduction += 1;
  return Math.min(2, reduction);
}

export function getStarDefenseBonus(stars) {
  const value = Math.max(0, Number(stars) || 0);
  let bonus = 0;
  if (value >= 2) bonus += 1;
  if (value >= 4) bonus += 1;
  return bonus;
}

export function isDefenseBattleCard(card) {
  return Number(card?.atkStyle ?? card?.atk_style) === 1;
}

function normalizeAttributeRoll(value) {
  if (!value || typeof value !== 'object') return { atk: 0, hp: 0, cd: 0 };
  return {
    atk: Math.max(-20, Math.min(20, Number(value.atk) || 0)),
    hp: Math.max(-20, Math.min(20, Number(value.hp) || 0)),
    cd: Math.max(-20, Math.min(20, Number(value.cd) || 0)),
  };
}

export function calculateCardStats(card, craftQuality = 2, stars = 0, attributeRoll = null) {
  const quality = normalizeBattleCraftQuality(craftQuality);
  const P = getBattleQualityMultiplier(quality);
  const Q = Math.max(0, Number(stars) || 0);
  const baseAtk = Math.max(0, Number(card?.atk ?? card?.card_atk) || 0);
  const R = baseAtk > 0 ? getStarAttackBonus(Q) : 0;
  const baseHp = Math.max(0, Number(card?.hp ?? card?.card_hp) || 0);
  const baseCooldown = Math.max(0, Number(card?.cooldown ?? card?.card_cd) || 0);
  const M = getStarCooldownReduction(baseCooldown, Q);
  const defense = isDefenseGrowthCard(card); // 仅明确的防御单位使用防御生命成长
  const V = defense && baseCooldown <= 6 ? getStarDefenseBonus(Q) : 0; // 兼容旧返回字段，现不参与生命计算
  const mult = getInstanceStatMultiplier(quality, Q);
  const hpMult = getInstanceHpMultiplier(quality, Q, defense);
  const roll = normalizeAttributeRoll(attributeRoll);
  const atkRollMult = 1 + roll.atk / 100;
  const hpRollMult = 1 + roll.hp / 100;
  const cdRollMult = 1 - roll.cd / 100;

  // 原始攻击为0的辅助/治疗卡，即使品质、星级、属性洗练都很高，也必须保持0攻击。
  // 固定攻击奖励 R 在品质、强化及洗练全部倍率之后相加，永不被放大。
  const attack = baseAtk > 0
    ? Math.round((baseAtk * mult * atkRollMult + R) * 100) / 100
    : 0;
  // 当前没有固定生命里程碑奖励；生命仅放大基础血量，旧 V 不再进入倍率。
  // 将来若增加固定生命奖励，应在此表达式末尾另行相加（洗练之后）。
  const hp = Math.round(baseHp * hpMult * hpRollMult * 100) / 100;
  const cooldown = Math.max(6, Math.round(Math.max(0, baseCooldown - M) * cdRollMult * 100) / 100);

  return Object.freeze({
    atk: attack,
    hp,
    cd: cooldown,
    baseAtk,
    baseHp,
    baseCooldown,
    quality,
    attributeRoll: roll,
    P,
    Q,
    R,
    M,
    V,
    mult,
    hpMult,
    defense,
  });
}
