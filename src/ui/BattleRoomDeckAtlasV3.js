import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomDeckAtlasV3');
const ATLAS_URL = '/resources/img/cardParts.png';
const ATLAS_SIZE = 1024;

const FRAME_BY_LABEL = Object.freeze({
  攻击: 'cardType_1',
  远程: 'cardType_1',
  防御: 'cardType_2',
  辅助: 'cardType_3',
  陷阱: 'cardType_4',
  突击: 'cardType_5',
  主动: 'cardType_7',
});

const GRADE_COLORS = Object.freeze({
  1: '#d9ddd0',
  2: '#6fa552',
  3: '#5f92ad',
  4: '#9572a4',
  5: '#c7b94f',
});

function getFrame(view, name) {
  return view?._db?.atlases?.cardParts?.sprites?.find((frame) => frame.name === name) ?? null;
}

function atlasStyle(view, name) {
  const frame = getFrame(view, name);
  if (!frame) return '';
  const xRange = Math.max(1, ATLAS_SIZE - frame.width);
  const yRange = Math.max(1, ATLAS_SIZE - frame.height);
  return [
    `--atlas-url:url('${ATLAS_URL}')`,
    `--atlas-size-x:${((ATLAS_SIZE / frame.width) * 100).toFixed(5)}%`,
    `--atlas-size-y:${((ATLAS_SIZE / frame.height) * 100).toFixed(5)}%`,
    `--atlas-pos-x:${((frame.x / xRange) * 100).toFixed(5)}%`,
    `--atlas-pos-y:${((frame.y / yRange) * 100).toFixed(5)}%`,
  ].join(';');
}

function cardGrade(view, button) {
  const rawIndex = button.dataset.bagIdx ?? button.dataset.idx;
  const bagIndex = Number(rawIndex);
  const slot = Number.isInteger(bagIndex) ? view?._bagSlots?.[bagIndex] : null;
  const card = slot ? view?._db?.getById(slot.cardId) : null;
  const raw = Number(card?.quality ?? card?.card_quality ?? 1);
  return Math.max(1, Math.min(5, Number.isFinite(raw) ? raw : 1));
}

function decorateCardBackgrounds(view, root) {
  root?.querySelectorAll?.('.room-deck-ui-v3 .v3-drawer-card, .room-deck-ui-v3 .v3-deck-slot.filled').forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    const grade = cardGrade(view, button);
    const layer = button.querySelector('.v3-card-quality');
    if (!(layer instanceof HTMLElement)) return;
    const style = atlasStyle(view, `card_bg_${grade}`);
    if (!style) return;

    button.dataset.cardGrade = String(grade);
    button.classList.add('v3-card-grade-atlas');
    button.style.setProperty('--quality', GRADE_COLORS[grade]);
    layer.className = 'v3-card-quality v3-atlas-card-bg';
    layer.style.cssText = style;
  });
}

function decorateFunctionIcons(view, root) {
  root?.querySelectorAll?.('.room-deck-ui-v3 .v3-card-function').forEach((footer) => {
    const label = String(footer.getAttribute('title') ?? footer.querySelector('em')?.textContent ?? '').trim();
    const frameName = FRAME_BY_LABEL[label] ?? 'cardType_1';
    const icon = footer.querySelector('i');
    if (!(icon instanceof HTMLElement)) return;
    const style = atlasStyle(view, frameName);
    if (!style) return;
    icon.className = 'v3-card-function-icon v3-atlas-function-icon';
    icon.textContent = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = style;
  });
}

function decorateAll(view, root) {
  decorateCardBackgrounds(view, root);
  decorateFunctionIcons(view, root);
}

export function installBattleRoomDeckAtlasV3() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDeck = DeckSelectView.prototype._renderDeckSlots;
  DeckSelectView.prototype._renderDeckSlots = function renderDeckSlotsWithAtlas(root) {
    const result = previousDeck.call(this, root);
    decorateAll(this, root);
    return result;
  };

  const previousDrawer = DeckSelectView.prototype._renderDrawer;
  DeckSelectView.prototype._renderDrawer = function renderDrawerWithAtlas(root) {
    const result = previousDrawer.call(this, root);
    decorateAll(this, root);
    return result;
  };

  window.__verifyBattleRoomDeckAtlasV3 = () => ({
    enabled: true,
    icons: document.querySelectorAll('.room-deck-ui-v3 .v3-atlas-function-icon').length,
    gradeBackgrounds: document.querySelectorAll('.room-deck-ui-v3 .v3-atlas-card-bg').length,
    gradeSix: document.querySelectorAll('.room-deck-ui-v3 [data-card-grade="6"]').length,
  });
}
