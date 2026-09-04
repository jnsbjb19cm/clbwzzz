import {
  CARD_CATEGORY,
  HAND_SLOT_COUNT,
  JUNGLE_ASSETS,
  getCardCategory,
  isMonsterCard,
  isPlantCard,
  usesFoodCost,
} from '../battle/BattleConfig.js';
import {
  formatCraftCardName,
  resolveCraftQuality,
} from '../core/constants.js';
import { audio } from '../core/AudioManager.js';
import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomDeckRulesFinal');
const ATLAS_URL = '/resources/img/cardParts.png';
const ATLAS_SIZE = 1024;
const DECK_TABS = ['default', 'team1', 'team2', 'team3'];
const DECK_STATE_KEY = 'clbwz_room_deck_tabs_v2';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cloneDeck(deck) {
  return Array.isArray(deck) ? deck.map(Number).filter(Number.isInteger) : [];
}

function getFrame(view, name) {
  return view?._db?.atlases?.cardParts?.sprites?.find((frame) => frame.name === name) ?? null;
}

function atlasStyle(view, name) {
  const frame = getFrame(view, name);
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

function functionMeta(card) {
  const attackStyle = Number(card?.atkStyle ?? card?.atk_style ?? 0);
  const type = Number(card?.type ?? card?.card_type ?? 1);
  const moving = Number(card?.moveSpeed ?? card?.move_speed ?? 0) > 0;
  const range = Number(card?.range ?? card?.atkRange ?? 0);

  if (getCardCategory(card) === CARD_CATEGORY.ACTIVE_SKILL) {
    return { frame: 'cardType_7', label: '主动技能' };
  }
  if (type === 3) return { frame: 'cardType_4', label: '陷阱' };
  if (attackStyle === 1) return { frame: 'cardType_2', label: '防御' };
  if (type === 2) return { frame: 'cardType_3', label: '辅助' };
  if (moving) return { frame: 'cardType_5', label: '突击' };
  if (range > 1 || attackStyle === 2) return { frame: 'cardType_1', label: '远程' };
  return { frame: 'cardType_1', label: '攻击' };
}

function featureText(card) {
  const raw = String(card?.desc ?? card?.feature ?? card?.trait ?? '').trim();
  if (raw) return raw;
  const meta = functionMeta(card);
  if (meta.label === '防御') return '固定在格子内阻挡并承受伤害。';
  if (meta.label === '突击') return '部署后沿本行向敌方推进。';
  if (meta.label === '远程') return '在本行远程攻击目标。';
  return `${meta.label}类卡牌。`;
}

function cardLevel(card, instance) {
  return Math.max(1, Math.min(6, Number(card?.quality ?? instance?.craftQuality ?? 1) || 1));
}

function cardMeta(view, bagIndex) {
  const instance = view?._bagSlots?.[bagIndex];
  const card = instance ? view?._db?.getById(instance.cardId) : null;
  if (!instance || !card) return null;
  const level = cardLevel(card, instance);
  const quality = resolveCraftQuality(instance.craftQuality ?? level);
  const resourceIsFood = usesFoodCost(card);
  const fn = functionMeta(card);
  return {
    card,
    instance,
    bagIndex,
    level,
    quality,
    function: fn,
    feature: featureText(card),
    cost: Number(card.cost ?? 0),
    resourceLabel: resourceIsFood ? '食物' : '阳光',
    resourceIcon: resourceIsFood ? JUNGLE_ASSETS.resFood : JUNGLE_ASSETS.resSun,
    stars: Math.max(0, Number(instance.star ?? instance.strengthLv ?? 0) || 0),
    group: isPlantCard(card) ? 'plant' : isMonsterCard(card) ? 'monster' : 'other',
  };
}

function normalizeDeck(view, source = view?._selected) {
  const result = [];
  const usedBag = new Set();
  const usedNames = new Set();
  for (const raw of Array.isArray(source) ? source : []) {
    const bagIndex = Number(raw);
    const instance = view?._bagSlots?.[bagIndex];
    const card = instance ? view?._db?.getById(instance.cardId) : null;
    if (!Number.isInteger(bagIndex) || bagIndex < 0 || !instance || !card) continue;
    const nameKey = String(card.name ?? instance.cardId).trim().toLocaleLowerCase();
    if (usedBag.has(bagIndex) || usedNames.has(nameKey)) continue;
    usedBag.add(bagIndex);
    usedNames.add(nameKey);
    result.push(bagIndex);
    if (result.length >= HAND_SLOT_COUNT) break;
  }
  return result;
}

function cardNameKey(view, bagIndex) {
  const meta = cardMeta(view, bagIndex);
  return meta ? String(meta.card.name ?? meta.instance.cardId).trim().toLocaleLowerCase() : '';
}

function selectedNameMap(view) {
  const map = new Map();
  normalizeDeck(view).forEach((bagIndex, slotIndex) => {
    const key = cardNameKey(view, bagIndex);
    if (key) map.set(key, { bagIndex, slotIndex });
  });
  return map;
}

function loadDeckStates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DECK_STATE_KEY) || '{}');
    const result = {};
    for (const tab of DECK_TABS) result[tab] = cloneDeck(parsed?.[tab]);
    return result;
  } catch {
    return Object.fromEntries(DECK_TABS.map((tab) => [tab, []]));
  }
}

function saveDeckStates(view) {
  try {
    const payload = {};
    for (const tab of DECK_TABS) payload[tab] = cloneDeck(view._deckSelections?.[tab]);
    localStorage.setItem(DECK_STATE_KEY, JSON.stringify(payload));
  } catch {}
}

function initializeDeckStates(view, initialDeck) {
  const stored = loadDeckStates();
  view._deckSelections = Object.fromEntries(
    DECK_TABS.map((tab) => [tab, normalizeDeck(view, stored[tab])]),
  );
  const currentTab = DECK_TABS.includes(view._deckTab) ? view._deckTab : 'default';
  if (!view._deckSelections[currentTab].length) {
    view._deckSelections[currentTab] = normalizeDeck(view, initialDeck);
  }
  view._deckTab = currentTab;
  view._selected = cloneDeck(view._deckSelections[currentTab]);
  view._drawerFilter = view._drawerFilter || 'all';
}

function syncCurrentTab(view) {
  if (!view._deckSelections) initializeDeckStates(view, view._selected);
  view._selected = normalizeDeck(view);
  view._deckSelections[view._deckTab] = cloneDeck(view._selected);
  saveDeckStates(view);
}

function switchDeckTab(view, root, nextTab) {
  if (!DECK_TABS.includes(nextTab)) return;
  syncCurrentTab(view);
  view._deckTab = nextTab;
  view._selected = cloneDeck(view._deckSelections[nextTab] || []);
  view._activeSwapSlot = null;
  root.querySelectorAll('.deck-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === nextTab);
  });
  refreshDeck(view, root);
}

function starsMarkup(stars) {
  const count = Math.min(6, Math.max(0, stars));
  return count
    ? `<span class="room-card-stars" aria-label="${stars}星">${'★'.repeat(count)}${stars > 6 ? `<b>+${stars - 6}</b>` : ''}</span>`
    : '<span class="room-card-stars room-card-stars--empty">☆☆☆☆☆☆</span>';
}

function cardMarkup(view, meta, { selected = false, duplicate = false, compact = false } = {}) {
  const bgStyle = atlasStyle(view, `card_bg_${meta.level}`);
  const typeStyle = atlasStyle(view, meta.function.frame);
  const shortFeature = meta.feature.length > 13 ? `${meta.feature.slice(0, 13)}…` : meta.feature;
  return `
    <span class="room-card-quality-bg room-atlas-sprite" style="${bgStyle};--quality-color:${meta.quality.color}" aria-hidden="true"></span>
    <span class="room-card-stars-wrap">${starsMarkup(meta.stars)}</span>
    <img class="room-card-art" src="/sprites/cards/${meta.card.spriteRes}.png" alt="" draggable="false" />
    <span class="room-card-trait" title="${escapeHtml(meta.feature)}">${escapeHtml(shortFeature)}</span>
    <span class="room-card-footer" aria-label="${meta.resourceLabel}${meta.cost}，${meta.function.label}">
      <span class="room-card-resource-kind" title="${meta.resourceLabel}"><img src="${meta.resourceIcon}" alt="${meta.resourceLabel}" draggable="false" /></span>
      <b class="room-card-resource-value">${meta.cost}</b>
      <span class="room-card-function" title="${meta.function.label}">
        <i class="room-card-function-icon room-atlas-sprite" style="${typeStyle}" aria-hidden="true"></i>
        ${compact ? '' : `<em>${meta.function.label}</em>`}
      </span>
    </span>
    ${selected ? '<span class="room-card-selected-mark">已上阵</span>' : ''}
    ${duplicate ? '<span class="room-card-duplicate-mark">同名已上阵</span>' : ''}
  `;
}

function ensureFilterToolbar(view, root) {
  const drawer = root.querySelector('#card-drawer');
  const header = drawer?.querySelector('.drawer-header');
  if (!drawer || !header) return;
  let toolbar = drawer.querySelector('.room-card-filter-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'room-card-filter-toolbar';
    toolbar.innerHTML = `
      <button type="button" data-room-filter="all">全部</button>
      <button type="button" data-room-filter="plant">植物</button>
      <button type="button" data-room-filter="monster">怪物</button>
      <button type="button" data-room-filter-reset="1">重置</button>`;
    header.insertAdjacentElement('afterend', toolbar);
  }
  toolbar.querySelectorAll('[data-room-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.roomFilter === view._drawerFilter);
  });
}

function openDrawer(view, root) {
  const drawer = root.querySelector('#card-drawer');
  const swapButton = root.querySelector('#swap-card-btn');
  view._drawerOpen = true;
  drawer?.classList.add('open');
  swapButton?.classList.add('active');
  ensureFilterToolbar(view, root);
}

function refreshDeck(view, root) {
  view._selected = normalizeDeck(view);
  if (view._deckSelections) view._deckSelections[view._deckTab] = cloneDeck(view._selected);
  view._renderDeckSlots(root);
  view._renderDrawer(root);
  ensureFilterToolbar(view, root);
}

function showToast(view, root, message) {
  if (typeof view._showToast === 'function') view._showToast(root, message);
}

function swapSlots(view, first, second) {
  const selected = normalizeDeck(view);
  if (first === second || selected[first] == null) return false;
  const secondValue = selected[second];
  if (secondValue == null) {
    const [moving] = selected.splice(first, 1);
    selected.splice(Math.min(second, selected.length), 0, moving);
  } else {
    [selected[first], selected[second]] = [selected[second], selected[first]];
  }
  view._selected = selected;
  return true;
}

function renderDeckSlots(root) {
  const container = root.querySelector('#deck-slots-row');
  if (!container) return;
  this._selected = normalizeDeck(this);
  const unlocked = Math.max(4, Math.min(HAND_SLOT_COUNT, this._selected.length + 1));

  container.innerHTML = Array.from({ length: HAND_SLOT_COUNT }, (_, slotIndex) => {
    const bagIndex = this._selected[slotIndex];
    const meta = bagIndex != null ? cardMeta(this, bagIndex) : null;
    const active = this._activeSwapSlot === slotIndex;
    if (!meta) {
      const locked = slotIndex >= unlocked;
      return `
        <button type="button" class="deck-slot-item empty${locked ? ' locked' : ''}${active ? ' swap-source' : ''}"
          data-slot-idx="${slotIndex}" ${locked ? 'disabled' : ''}
          aria-label="第${slotIndex + 1}卡槽，${locked ? '未解锁' : '空位'}">
          ${locked
            ? `<span class="room-card-lock room-atlas-sprite" style="${atlasStyle(this, 'lock')}" aria-hidden="true"></span>`
            : `<span class="slot-empty-num">${slotIndex + 1}</span><span class="slot-empty-label">选择卡牌</span>`}
        </button>`;
    }
    return `
      <button type="button" class="deck-slot-item filled card-level-${meta.level}${active ? ' swap-source' : ''}"
        data-slot-idx="${slotIndex}" data-bag-idx="${bagIndex}"
        style="--quality-color:${meta.quality.color}"
        aria-label="${escapeHtml(meta.card.name)}，消耗${meta.cost}${meta.resourceLabel}，${meta.function.label}">
        ${cardMarkup(this, meta, { compact: true })}
      </button>`;
  }).join('');
}

function renderDrawer(root) {
  const drawerCards = root.querySelector('#drawer-cards');
  if (!drawerCards) return;
  ensureFilterToolbar(this, root);
  this._selected = normalizeDeck(this);
  const selectedBag = new Set(this._selected);
  const names = selectedNameMap(this);
  const filter = this._drawerFilter || 'all';
  const pool = (this._pool || []).filter(({ index }) => {
    const meta = cardMeta(this, index);
    return meta && (filter === 'all' || meta.group === filter);
  });

  drawerCards.innerHTML = pool.length
    ? pool.map(({ index }) => {
        const meta = cardMeta(this, index);
        const nameKey = cardNameKey(this, index);
        const picked = selectedBag.has(index);
        const duplicate = names.has(nameKey) && !picked;
        return `
          <button type="button"
            class="drawer-card card-level-${meta.level}${picked ? ' selected' : ''}${duplicate ? ' same-name-disabled' : ''}${Number.isInteger(this._activeSwapSlot) ? ' replacement-mode' : ''}"
            data-idx="${index}" data-card-name-key="${escapeHtml(nameKey)}"
            style="--quality-color:${meta.quality.color}"
            aria-disabled="${duplicate ? 'true' : 'false'}"
            aria-label="${escapeHtml(meta.card.name)}，${meta.stars}星，消耗${meta.cost}${meta.resourceLabel}，${meta.function.label}">
            ${cardMarkup(this, meta, { selected: picked, duplicate, compact: false })}
          </button>`;
      }).join('')
    : '<p class="drawer-empty">当前分类没有可用卡牌</p>';
}

function handleSlotSingleClick(view, root, slotIndex) {
  const active = Number.isInteger(view._activeSwapSlot) ? view._activeSwapSlot : null;
  if (active == null || active === slotIndex) {
    view._activeSwapSlot = active === slotIndex ? null : slotIndex;
    if (view._activeSwapSlot != null) openDrawer(view, root);
    refreshDeck(view, root);
    return;
  }

  if (view._selected?.[active] != null) {
    swapSlots(view, active, slotIndex);
    view._activeSwapSlot = null;
    refreshDeck(view, root);
    return;
  }

  view._activeSwapSlot = slotIndex;
  openDrawer(view, root);
  refreshDeck(view, root);
}

function handleDrawerCard(view, root, bagIndex) {
  const meta = cardMeta(view, bagIndex);
  if (!meta) return;
  const active = Number.isInteger(view._activeSwapSlot) ? view._activeSwapSlot : null;
  const pickedSlot = view._selected.indexOf(bagIndex);
  const sameName = selectedNameMap(view).get(cardNameKey(view, bagIndex));

  /* 替换当前同名卡时允许选择另一实例；只有同名卡位于其他槽位时才禁止。 */
  if (sameName && pickedSlot < 0 && sameName.slotIndex !== active) {
    showToast(view, root, `“${meta.card.name}”已在战团中，同名卡不能重复上阵`);
    return;
  }

  if (active != null) {
    if (pickedSlot >= 0) {
      if (pickedSlot !== active) swapSlots(view, active, pickedSlot);
    } else if (active < view._selected.length) {
      view._selected[active] = bagIndex;
    } else if (view._selected.length < HAND_SLOT_COUNT) {
      view._selected.push(bagIndex);
    }
    view._activeSwapSlot = null;
    syncCurrentTab(view);
    refreshDeck(view, root);
    return;
  }

  if (pickedSlot >= 0) {
    view._activeSwapSlot = pickedSlot;
    openDrawer(view, root);
    refreshDeck(view, root);
    return;
  }

  if (view._selected.length >= HAND_SLOT_COUNT) {
    showToast(view, root, `最多携带 ${HAND_SLOT_COUNT} 张卡牌，请先选择要替换的卡槽`);
    return;
  }

  view._selected.push(bagIndex);
  syncCurrentTab(view);
  refreshDeck(view, root);
}

function bindRoomDeckEvents(view, root) {
  const room = root.querySelector('.game-room');
  if (!room || room.__roomDeckRulesBound) return;
  room.__roomDeckRulesBound = true;

  room.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const tab = target.closest('.deck-tab');
    if (tab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      audio.playSfx('click');
      switchDeckTab(view, root, tab.dataset.tab);
      return;
    }

    const filter = target.closest('[data-room-filter]');
    if (filter) {
      event.preventDefault();
      event.stopImmediatePropagation();
      view._drawerFilter = filter.dataset.roomFilter || 'all';
      view._renderDrawer(root);
      ensureFilterToolbar(view, root);
      return;
    }

    if (target.closest('[data-room-filter-reset]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      view._drawerFilter = 'all';
      view._activeSwapSlot = null;
      refreshDeck(view, root);
      return;
    }

    const slot = target.closest('#deck-slots-row .deck-slot-item:not(.locked)');
    if (slot) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.detail > 1) {
        clearTimeout(view._deckSlotClickTimer);
        return;
      }
      clearTimeout(view._deckSlotClickTimer);
      const slotIndex = Number(slot.dataset.slotIdx);
      view._deckSlotClickTimer = setTimeout(() => {
        audio.playSfx('click');
        handleSlotSingleClick(view, root, slotIndex);
      }, 180);
      return;
    }

    const drawerCard = target.closest('#drawer-cards .drawer-card');
    if (drawerCard) {
      event.preventDefault();
      event.stopImmediatePropagation();
      audio.playClickCard();
      handleDrawerCard(view, root, Number(drawerCard.dataset.idx));
      return;
    }

    if (target.closest('#room-ready-btn')) syncCurrentTab(view);
  }, true);

  room.addEventListener('dblclick', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const slot = target?.closest('#deck-slots-row .deck-slot-item.filled');
    if (!slot) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearTimeout(view._deckSlotClickTimer);
    const slotIndex = Number(slot.dataset.slotIdx);
    if (view._selected?.[slotIndex] == null) return;
    view._selected.splice(slotIndex, 1);
    view._activeSwapSlot = null;
    syncCurrentTab(view);
    refreshDeck(view, root);
  }, true);
}

export function installBattleRoomDeckRulesFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  DeckSelectView.prototype._renderDeckSlots = renderDeckSlots;
  DeckSelectView.prototype._renderDrawer = renderDrawer;

  const originalRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderWithFinalDeckRules(root, options = {}) {
    const previousTabs = this._deckSelections
      ? Object.fromEntries(DECK_TABS.map((tab) => [tab, cloneDeck(this._deckSelections[tab])]))
      : null;
    const previousTab = DECK_TABS.includes(this._deckTab) ? this._deckTab : 'default';
    const result = originalRender.call(this, root, options);

    if (previousTabs) {
      this._deckSelections = previousTabs;
      this._deckTab = previousTab;
      this._selected = normalizeDeck(this, previousTabs[previousTab]);
    } else {
      initializeDeckStates(this, this._selected);
    }

    const room = root.querySelector('.game-room');
    if (room) {
      room.__deckSelectView = this;
      room.classList.add('room-deck-rules-final');
    }
    bindRoomDeckEvents(this, root);
    root.querySelectorAll('.deck-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === this._deckTab);
    });
    refreshDeck(this, root);
    return result;
  };

  window.__verifyBattleRoomDeckRulesFinal = () => {
    const room = document.querySelector('.game-room.room-deck-rules-final');
    const view = room?.__deckSelectView;
    const selected = view ? normalizeDeck(view) : [];
    return {
      enabled: Boolean(room),
      deckTab: view?._deckTab ?? null,
      drawerFilter: view?._drawerFilter ?? null,
      selected,
      selectedNames: selected.map((index) => cardMeta(view, index)?.card?.name ?? null),
      activeSwapSlot: view?._activeSwapSlot ?? null,
      duplicateDisabled: room?.querySelectorAll('.drawer-card.same-name-disabled').length ?? 0,
      filterToolbar: Boolean(room?.querySelector('.room-card-filter-toolbar')),
    };
  };
}
