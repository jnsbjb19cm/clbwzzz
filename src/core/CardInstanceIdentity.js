import { normalizeCraftQuality } from './constants.js';

// Compare an instance, not merely its card type. Identical copies are equivalent.
export function cardInstanceIdentity(card) {
  if (!card) return null;
  const ordered = value => Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({
    cardId: Number(card.cardId),
    star: Number(card.star ?? card.strengthLv) || 0,
    craftQuality: normalizeCraftQuality(card.craftQuality),
    exp: Number(card.exp) || 0,
    customName: card.customName || null,
    awakened: Boolean(card.awakened),
    learnedSkill: card.learnedSkill || null,
    attributeRoll: card.attributeRoll ? ordered(card.attributeRoll) : null,
    powderSpent: ordered(card.powderSpent),
    bound: Boolean(card.bound),
    expiresAt: Number(card.expiresAt) || 0,
  });
}
