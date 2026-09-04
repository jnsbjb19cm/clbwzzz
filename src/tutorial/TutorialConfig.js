export const NEW_PLAYER_TUTORIAL_MARKER = '__clbwz_new_player_tutorial_v1__';
export const NEW_PLAYER_TUTORIAL_STORAGE_KEY = 'clbwz_new_player_tutorial_completed_v1';

const PREFERRED_TUTORIAL_CARD_IDS = [1, 2, 4, 15, 19, 25, 22, 17, 11, 3];

function cardCategory(card) {
  const value = Number(card?.card_category ?? card?.category);
  return Number.isFinite(value) ? value : -1;
}

function moveSpeed(card) {
  return Number(card?.moveSpeed ?? card?.move_speed ?? 0) || 0;
}

function cardQuality(card) {
  return Number(card?.quality ?? card?.card_quality ?? 1) || 1;
}

function isBattleUnitCard(card) {
  const id = Number(card?.id ?? card?.card_id);
  const category = cardCategory(card);
  return Number.isFinite(id) && id > 0 && id < 500 && (category === 0 || category === 1 || category === -1);
}

export function getTutorialDeckCards(db, limit = 6) {
  const all = (db?.cards ?? []).filter(isBattleUnitCard);
  const byId = new Map(all.map((card) => [Number(card.id), card]));
  const preferred = PREFERRED_TUTORIAL_CARD_IDS.map((id) => byId.get(id)).filter(Boolean);

  const selected = [];
  const used = new Set();
  const add = (card) => {
    const id = Number(card?.id);
    if (!card || !id || used.has(id) || selected.length >= limit) return;
    used.add(id);
    selected.push(card);
  };

  // 教学卡组优先保证有能向前推进的单位，再补固定/远程单位。
  preferred.filter((card) => moveSpeed(card) > 0).slice(0, 3).forEach(add);
  preferred.filter((card) => moveSpeed(card) <= 0).slice(0, 3).forEach(add);
  preferred.forEach(add);

  all
    .filter((card) => moveSpeed(card) > 0)
    .sort((a, b) => cardQuality(a) - cardQuality(b) || Number(a.id) - Number(b.id))
    .forEach(add);
  all.forEach(add);

  return selected.slice(0, limit);
}

export function getTutorialDeckSlots(db, limit = 6) {
  return getTutorialDeckCards(db, limit).map((card) => ({ cardId: Number(card.id) }));
}

export function getTutorialEnemyCards(db, limit = 5) {
  const all = (db?.cards ?? []).filter(isBattleUnitCard);
  const monsters = all
    .filter((card) => cardCategory(card) === 1 && moveSpeed(card) > 0)
    .sort((a, b) => cardQuality(a) - cardQuality(b) || Number(a.id) - Number(b.id));
  const movable = all
    .filter((card) => moveSpeed(card) > 0)
    .sort((a, b) => cardQuality(a) - cardQuality(b) || Number(a.id) - Number(b.id));

  const source = monsters.length ? monsters : movable;
  return source.slice(0, limit);
}
