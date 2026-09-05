import './TutorialBaseProtection.js';
import './TutorialPlacementRule.js';
import './TutorialRefinementV4.js';

export const NEW_PLAYER_TUTORIAL_MARKER = '__clbwz_new_player_tutorial_v1__';
export const NEW_PLAYER_TUTORIAL_STORAGE_KEY = 'clbwz_new_player_tutorial_completed_v1';

/** 剧情教程固定卡组：按实际教学顺序排列。 */
export const TUTORIAL_CARD_IDS = Object.freeze({
  PEANUT: 1,
  WALNUT: 2,
  RUNNER: 3,
  CACTUS: 4,
  SLIME: 6,
  SPIKE: 15,
  SCARECROW: 19,
  BLIZZARD: 503,
});

const PREFERRED_TUTORIAL_CARD_IDS = [
  TUTORIAL_CARD_IDS.PEANUT,
  TUTORIAL_CARD_IDS.WALNUT,
  TUTORIAL_CARD_IDS.RUNNER,
  TUTORIAL_CARD_IDS.SPIKE,
  TUTORIAL_CARD_IDS.CACTUS,
  TUTORIAL_CARD_IDS.SCARECROW,
];

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

  const selected = [];
  const used = new Set();
  const add = (card) => {
    const id = Number(card?.id);
    if (!card || !id || used.has(id) || selected.length >= limit) return;
    used.add(id);
    selected.push(card);
  };

  // 先严格按剧情顺序发 6 张教学卡；缺失时才使用普通战斗卡兜底。
  PREFERRED_TUTORIAL_CARD_IDS.map((id) => byId.get(id)).filter(Boolean).forEach(add);

  all
    .sort((a, b) => cardQuality(a) - cardQuality(b) || Number(a.id) - Number(b.id))
    .forEach(add);

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
