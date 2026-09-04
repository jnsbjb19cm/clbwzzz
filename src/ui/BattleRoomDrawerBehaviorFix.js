import { DeckSelectView } from './DeckSelectView.js';
import {
  CARD_CATEGORY,
  getCardCategory,
} from '../battle/BattleConfig.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomDrawerBehaviorFix');
const ATLAS_URL = '/resources/img/cardParts.png';
const ATLAS_SIZE = 1024;

function getFrame(view, name) {
  return view._db?.atlases?.cardParts?.sprites?.find((frame) => frame.name === name) ?? null;
}

function applyAtlasFrame(view, element, frameName) {
  const frame = getFrame(view, frameName);
  if (!(element instanceof HTMLElement) || !frame) return;
  const xRange = Math.max(1, ATLAS_SIZE - frame.width);
  const yRange = Math.max(1, ATLAS_SIZE - frame.height);
  const sizeX = (ATLAS_SIZE / frame.width) * 100;
  const sizeY = (ATLAS_SIZE / frame.height) * 100;
  const posX = (frame.x / xRange) * 100;
  const posY = (frame.y / yRange) * 100;
  element.style.setProperty('--atlas-url', `url('${ATLAS_URL}')`);
  element.style.setProperty('--atlas-size-x', `${sizeX.toFixed(5)}%`);
  element.style.setProperty('--atlas-size-y', `${sizeY.toFixed(5)}%`);
  element.style.setProperty('--atlas-pos-x', `${posX.toFixed(5)}%`);
  element.style.setProperty('--atlas-pos-y', `${posY.toFixed(5)}%`);
}

function getCardGroup(card) {
  const category = getCardCategory(card);
  if (category === CARD_CATEGORY.PLANT) return '植物';
  if (category === CARD_CATEGORY.MONSTER) return '怪物';
  return '其他';
}

function getFunctionMeta(card) {
  const attackStyle = Number(card?.atkStyle ?? card?.atk_style ?? 0);
  const type = Number(card?.type ?? card?.card_type ?? 1);

  if (attackStyle === 1) return { frame: 'cardType_2', label: '防御' };
  if (type === 2) return { frame: 'cardType_3', label: '辅助' };
  if (type === 3) return { frame: 'cardType_4', label: '陷阱' };
  if (getCardCategory(card) === CARD_CATEGORY.ACTIVE_SKILL) {
    return { frame: 'cardType_7', label: '主动技能' };
  }
  return { frame: 'cardType_1', label: '攻击' };
}

function decorateCardElement(view, cardElement) {
  if (!(cardElement instanceof HTMLElement)) return;
  const bagIndex = Number(cardElement.dataset.idx ?? cardElement.dataset.bagIdx);
  if (!Number.isInteger(bagIndex)) return;
  const instance = view._bagSlots?.[bagIndex];
  const card = instance ? view._db?.getById(instance.cardId) : null;
  if (!card) return;

  const group = getCardGroup(card);
  cardElement.dataset.cardGroup = group;

  let filterKey = cardElement.querySelector('.room-card-filter-key');
  if (!filterKey) {
    filterKey = document.createElement('em');
    filterKey.className = 'room-card-filter-key';
    filterKey.hidden = true;
    cardElement.appendChild(filterKey);
  }
  filterKey.textContent = group;

  const cost = cardElement.querySelector('.room-card-cost');
  if (cost) {
    const resource = cost.classList.contains('room-card-cost--food') ? '食物' : '阳光';
    cost.dataset.resource = resource;
    cost.setAttribute('aria-label', `${resource}${Number(card.cost ?? 0)}`);
    const icon = cost.querySelector('i');
    if (icon) icon.textContent = '';
  }

  const functionMeta = getFunctionMeta(card);
  const functionIcon = cardElement.querySelector('.room-card-type');
  if (functionIcon) {
    applyAtlasFrame(view, functionIcon, functionMeta.frame);
    functionIcon.dataset.function = functionMeta.label;
    functionIcon.title = functionMeta.label;
    functionIcon.setAttribute('aria-label', functionMeta.label);
  }
}

function decorateCards(view, root) {
  root.querySelectorAll('.deck-slot-item.filled, .drawer-card').forEach((element) => {
    decorateCardElement(view, element);
  });
  root.querySelector('#card-drawer')?.__exactRefresh?.();
}

export function installBattleRoomDrawerBehaviorFix() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const renderDeckSlots = DeckSelectView.prototype._renderDeckSlots;
  DeckSelectView.prototype._renderDeckSlots = function renderDeckSlotsWithFooterFix(root) {
    const result = renderDeckSlots.call(this, root);
    decorateCards(this, root);
    return result;
  };

  const renderDrawer = DeckSelectView.prototype._renderDrawer;
  DeckSelectView.prototype._renderDrawer = function renderDrawerWithFilterFix(root) {
    const result = renderDrawer.call(this, root);
    decorateCards(this, root);
    return result;
  };

  const originalRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderWithDrawerBehaviorFix(root, options = {}) {
    const result = originalRender.call(this, root, options);
    decorateCards(this, root);
    return result;
  };
}
