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

export function findCardInstanceSlot(slots, identity, preferredIndex = -1, excludedIndex = -1) {
  const matches = index => index !== excludedIndex && slots[index]
    && cardInstanceIdentity(slots[index]) === identity;
  if (matches(preferredIndex)) return preferredIndex;
  const candidates = slots.map((_, index) => index).filter(matches);
  // Without a valid position, never silently choose another identical copy.
  return candidates.length === 1 ? candidates[0] : -1;
}
