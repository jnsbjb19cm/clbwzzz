import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomStarAtlasPatch');
const ATLAS_URL = '/resources/img/cardParts.png';
const ATLAS_SIZE = 1024;
const STAR_SLOT_COUNT = 6;

function getStars(view, cardElement) {
  const bagIndex = Number(cardElement.dataset.idx ?? cardElement.dataset.bagIdx);
  if (!Number.isInteger(bagIndex)) return 0;
  const instance = view._bagSlots?.[bagIndex];
  return Math.max(0, Number(instance?.star ?? instance?.strengthLv ?? 0) || 0);
}

function getFrame(view, name) {
  return view._db?.atlases?.cardParts?.sprites?.find((frame) => frame.name === name) ?? null;
}

function frameStyle(frame) {
  if (!frame) return '';
  const xRange = Math.max(1, ATLAS_SIZE - frame.width);
  const yRange = Math.max(1, ATLAS_SIZE - frame.height);
  const sizeX = (ATLAS_SIZE / frame.width) * 100;
  const sizeY = (ATLAS_SIZE / frame.height) * 100;
  const posX = (frame.x / xRange) * 100;
  const posY = (frame.y / yRange) * 100;
  return [
    `--atlas-url:url('${ATLAS_URL}')`,
    `--atlas-size-x:${sizeX.toFixed(5)}%`,
    `--atlas-size-y:${sizeY.toFixed(5)}%`,
    `--atlas-pos-x:${posX.toFixed(5)}%`,
    `--atlas-pos-y:${posY.toFixed(5)}%`,
  ].join(';');
}

function decorateCard(view, cardElement) {
  const wrapper = cardElement.querySelector('.room-card-stars-wrap');
  if (!wrapper) return;

  const stars = getStars(view, cardElement);
  const filled = getFrame(view, 'single_star_1');
  const empty = getFrame(view, 'single_star_0');
  if (!filled || !empty) return;

  const visibleFilled = Math.min(STAR_SLOT_COUNT, stars);
  wrapper.innerHTML = Array.from({ length: STAR_SLOT_COUNT }, (_, index) => {
    const frame = index < visibleFilled ? filled : empty;
    return `<span class="room-card-star-atlas room-atlas-sprite" style="${frameStyle(frame)}" aria-hidden="true"></span>`;
  }).join('') + (stars > STAR_SLOT_COUNT
    ? `<b class="room-card-star-extra" aria-label="${stars}星">+${stars - STAR_SLOT_COUNT}</b>`
    : '');
  wrapper.setAttribute('aria-label', `${stars}星`);

  const costIcon = cardElement.querySelector('.room-card-cost i');
  if (costIcon) costIcon.textContent = '';
  cardElement.querySelector('.room-card-level-label')?.remove();
}

function decorateCards(view, root) {
  root.querySelectorAll('.deck-slot-item.filled, .drawer-card').forEach((cardElement) => {
    decorateCard(view, cardElement);
  });
}

export function installBattleRoomStarAtlasPatch() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const renderDeckSlots = DeckSelectView.prototype._renderDeckSlots;
  DeckSelectView.prototype._renderDeckSlots = function renderDeckSlotsWithAtlasStars(root) {
    const result = renderDeckSlots.call(this, root);
    decorateCards(this, root);
    return result;
  };

  const renderDrawer = DeckSelectView.prototype._renderDrawer;
  DeckSelectView.prototype._renderDrawer = function renderDrawerWithAtlasStars(root) {
    const result = renderDrawer.call(this, root);
    decorateCards(this, root);
    return result;
  };
}
