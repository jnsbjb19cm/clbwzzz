const DECK_GROUPS_20260906 = Object.freeze(['default', 'team1', 'team2', 'team3']);
const DECK_GROUP_TO_NUMBER_20260906 = Object.freeze({
  default: 0,
  team1: 1,
  team2: 2,
  team3: 3,
});

export function normalizeDeckGroup20260906(group) {
  const value = String(group ?? '').trim().toLowerCase();
  return DECK_GROUPS_20260906.includes(value) ? value : 'default';
}

export function deckGroupToNumber20260906(group) {
  return DECK_GROUP_TO_NUMBER_20260906[normalizeDeckGroup20260906(group)];
}

export function deckNumberToGroup20260906(deckNo) {
  const value = Math.max(0, Math.min(3, Math.trunc(Number(deckNo) || 0)));
  return DECK_GROUPS_20260906[value] ?? 'default';
}

export function storageKeyForDeckGroup20260906(group) {
  const normalized = normalizeDeckGroup20260906(group);
  return normalized === 'default' ? 'battle_deck_v2' : `battle_deck_v2_${normalized}`;
}

export function allDeckGroups20260906() {
  return [...DECK_GROUPS_20260906];
}
