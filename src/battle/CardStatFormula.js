export const CRAFT_QUALITY_MULTIPLIER = Object.freeze({
  1: 1.0,
  2: 1.0,
  3: 1.22,
  4: 1.5,
  5: 1.8,
});

export function normalizeBattleCraftQuality(value) {
  const quality = Number(value);
  return Object.hasOwn(CRAFT_QUALITY_MULTIPLIER, quality) ? quality : 2;
}

export function getBattleQualityMultiplier(value) {
  return CRAFT_QUALITY_MULTIPLIER[normalizeBattleCraftQuality(value)];
}

export function getStarAttackBonus(stars) {
  const value = Math.max(0, Number(stars) || 0);
  if (value >= 14) return 6;
  if (value >= 13) return 5;
  if (value >= 12) return 4;
  if (value >= 10) return 3;
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
  const defense = isDefenseBattleCard(card);
  const V = defense && baseCooldown <= 6 ? getStarDefenseBonus(Q) : 0;
  const mult = P + 0.08 * Q;
  const hpMult = defense ? P + 0.16 * Q + 0.16 * V : mult;
  const roll = normalizeAttributeRoll(attributeRoll);
  const atkRollMult = 1 + roll.atk / 100;
  const hpRollMult = 1 + roll.hp / 100;
  const cdRollMult = 1 - roll.cd / 100;

  // 原始攻击为0的辅助/治疗卡，即使品质、星级、属性洗练都很高，也必须保持0攻击。
  const attack = baseAtk > 0
    ? Math.round((baseAtk + R) * mult * atkRollMult * 100) / 100
    : 0;
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
