import { HAND_SLOT_COUNT, roundBattleAmount } from '../battle/BattleConfig.js';
import { audio } from '../core/AudioManager.js';
import {
  formatCraftCardName,
  getInstanceStatMultiplier,
  resolveCraftQuality,
} from '../core/constants.js';
import { App } from './App.js';
import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.roomStabilityPatch');
const DECK_BANK_KEY = 'clbwz_room_deck_bank_v1';
const ROOM_SETTINGS_KEY = 'clbwz_room_settings_v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 浏览器禁止存储时仍保持本次会话可用。
  }
}

function validDeck(view, value) {
  const result = [];
  const used = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || !view._bagSlots?.[index] || used.has(index)) continue;
    used.add(index);
    result.push(index);
    if (result.length >= HAND_SLOT_COUNT) break;
  }
  return result;
}

function currentDeck(view) {
  if (view._drawerOpen && Array.isArray(view._drawerDraft)) {
    return validDeck(view, view._drawerDraft);
  }
  return validDeck(view, view._selected);
}

function saveCurrentDeckTab(view) {
  const bank = readJson(DECK_BANK_KEY, {});
  bank[view._deckTab || 'default'] = validDeck(view, view._selected);
  writeJson(DECK_BANK_KEY, bank);
}

function switchDeckTab(view, root, tab) {
  if (!tab || tab === view._deckTab) return;
  saveCurrentDeckTab(view);
  const bank = readJson(DECK_BANK_KEY, {});
  const next = validDeck(view, bank[tab]);
  view._deckTab = tab;
  view._selected = next;
  view._drawerDraft = null;
  view._activeSwapSlot = null;
  view._drawerOpen = false;
  root.querySelector('#card-drawer')?.classList.remove('open');
  root.querySelector('#swap-card-btn')?.classList.remove('active');
  root.querySelectorAll('.deck-tab').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  view._renderDeckSlots(root);
  view._renderDrawer(root);
}

function openDrawer(view, root, slotIndex = null) {
  view._drawerOpen = true;
  view._drawerDraft = validDeck(view, view._selected);
  view._activeSwapSlot = Number.isInteger(slotIndex) ? slotIndex : null;
  root.querySelector('#card-drawer')?.classList.add('open');
  root.querySelector('#swap-card-btn')?.classList.add('active');
  view._renderDeckSlots(root);
  view._renderDrawer(root);
}

function closeDrawer(view, root, commit = false) {
  if (commit) {
    view._selected = validDeck(view, view._drawerDraft);
    saveCurrentDeckTab(view);
  }
  view._drawerOpen = false;
  view._drawerDraft = null;
  view._activeSwapSlot = null;
  root.querySelector('#card-drawer')?.classList.remove('open');
  root.querySelector('#swap-card-btn')?.classList.remove('active');
  view._renderDeckSlots(root);
  view._renderDrawer(root);
}

function toggleDrawerCard(view, root, bagIndex) {
  const draft = validDeck(view, view._drawerDraft ?? view._selected);
  const existing = draft.indexOf(bagIndex);

  if (view._activeSwapSlot != null) {
    const targetSlot = Math.max(0, Math.min(HAND_SLOT_COUNT - 1, view._activeSwapSlot));
    const withoutPicked = draft.filter((index) => index !== bagIndex);
    if (targetSlot < withoutPicked.length) withoutPicked[targetSlot] = bagIndex;
    else withoutPicked.push(bagIndex);
    view._drawerDraft = validDeck(view, withoutPicked);
    view._activeSwapSlot = null;
  } else if (existing >= 0) {
    draft.splice(existing, 1);
    view._drawerDraft = draft;
  } else if (draft.length >= HAND_SLOT_COUNT) {
    view._showToast(root, `最多 ${HAND_SLOT_COUNT} 张卡牌`);
    return;
  } else {
    draft.push(bagIndex);
    view._drawerDraft = draft;
  }

  view._renderDeckSlots(root);
  view._renderDrawer(root);
}

function renderDeckSlotsStable(root) {
  const container = root.querySelector('#deck-slots-row');
  if (!container) return;
  const selected = currentDeck(this);

  container.innerHTML = Array.from({ length: HAND_SLOT_COUNT }, (_, slotIndex) => {
    const bagIndex = selected[slotIndex];
    const instance = bagIndex != null ? this._bagSlots?.[bagIndex] : null;
    const card = instance ? this._db?.getById(instance.cardId) : null;
    if (!card || !instance) {
      return `
        <button type="button" class="deck-slot-item empty" data-slot-idx="${slotIndex}" aria-label="第${slotIndex + 1}卡槽，空位">
          <span class="slot-empty-num">${slotIndex + 1}</span>
          <span class="slot-empty-label">空位</span>
        </button>
      `;
    }

    const quality = resolveCraftQuality(instance.craftQuality);
    const multiplier = getInstanceStatMultiplier(instance.craftQuality, instance.strengthLv);
    return `
      <button type="button" class="deck-slot-item filled" data-slot-idx="${slotIndex}" data-bag-idx="${bagIndex}" aria-label="更换${card.name}">
        <span class="slot-card-img">
          <img src="/sprites/cards/${card.spriteRes}.png" alt="" draggable="false" />
          ${(instance.strengthLv ?? 0) > 0 ? `<span class="slot-star">+${instance.strengthLv}</span>` : ''}
        </span>
        <span class="slot-card-name" style="color:${quality.color}">${formatCraftCardName(instance.craftQuality, card.name)}</span>
        <span class="slot-card-stats">⚔${roundBattleAmount(card.atk * multiplier)} ❤${Math.round(card.hp * multiplier)}</span>
      </button>
    `;
  }).join('');
}

function renderDrawerStable(root) {
  const drawerCards = root.querySelector('#drawer-cards');
  if (!drawerCards) return;
  const picked = new Set(currentDeck(this));

  drawerCards.innerHTML = this._pool?.length
    ? this._pool.map(({ slot, index }) => {
        const card = this._db?.getById(slot.cardId);
        if (!card) return '';
        const quality = resolveCraftQuality(slot.craftQuality);
        const multiplier = getInstanceStatMultiplier(slot.craftQuality, slot.strengthLv);
        const selected = picked.has(index);
        return `
          <button type="button" class="drawer-card${selected ? ' selected' : ''}" data-idx="${index}" style="--quality:${quality.color};${selected ? `border-color:${quality.color}` : ''}">
            <img src="/sprites/cards/${card.spriteRes}.png" alt="" draggable="false" />
            <strong style="color:${quality.color}">${formatCraftCardName(slot.craftQuality, card.name)}</strong>
            <span>⚔${roundBattleAmount(card.atk * multiplier)} ❤${Math.round(card.hp * multiplier)}</span>
            <em>${card.typeLabel ?? ''}${(slot.strengthLv ?? 0) > 0 ? ` +${slot.strengthLv}` : ''}${selected ? ' · 已选' : ''}</em>
          </button>
        `;
      }).join('')
    : '<p class="drawer-empty">卡牌背包为空，请先到背包领取或制作卡牌</p>';

  root.querySelector('#card-drawer')?.__exactRefresh?.();
}

function navigateFromRoom(route, opts = {}) {
  window.dispatchEvent(new CustomEvent('clbwz:navigate', { detail: { route, opts } }));
}

function bindEventsStable(root) {
  this._roomEventAbort?.abort();
  const abortController = new AbortController();
  this._roomEventAbort = abortController;
  const { signal } = abortController;

  const room = root.querySelector('.game-room');
  if (!room) return;

  room.addEventListener('clbwz:room-drawer-close-request', (event) => {
    closeDrawer(this, root, Boolean(event.detail?.commit));
  }, { signal });

  room.addEventListener('clbwz:room-deck-reset-request', () => {
    this._drawerDraft = [];
    this._activeSwapSlot = null;
    this._renderDeckSlots(root);
    this._renderDrawer(root);
  }, { signal });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'music-vol') {
      this._roomSettings.musicVol = Number(target.value);
      const value = root.querySelector('#music-vol-val');
      if (value) value.textContent = target.value;
      writeJson(ROOM_SETTINGS_KEY, this._roomSettings);
    } else if (target.id === 'sfx-vol') {
      this._roomSettings.sfxVol = Number(target.value);
      const value = root.querySelector('#sfx-vol-val');
      if (value) value.textContent = target.value;
      writeJson(ROOM_SETTINGS_KEY, this._roomSettings);
    }
  }, { signal });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === 'show-card-name') {
      this._roomSettings.showCardName = target.checked;
      writeJson(ROOM_SETTINGS_KEY, this._roomSettings);
    }
  }, { signal });

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const deckTab = target.closest('.deck-tab');
    if (deckTab) {
      audio.playSfx?.('click');
      switchDeckTab(this, root, deckTab.dataset.tab);
      return;
    }

    const deckSlot = target.closest('.deck-slot-item');
    if (deckSlot) {
      audio.playSfx?.('click');
      openDrawer(this, root, Number(deckSlot.dataset.slotIdx));
      return;
    }

    if (target.closest('#swap-card-btn')) {
      audio.playSfx?.('click');
      if (this._drawerOpen) closeDrawer(this, root, false);
      else openDrawer(this, root, null);
      return;
    }

    if (target.closest('#drawer-close')) {
      closeDrawer(this, root, false);
      return;
    }

    const drawerCard = target.closest('.drawer-card');
    if (drawerCard) {
      audio.playClickCard?.();
      const bagIndex = Number(drawerCard.dataset.idx);
      if (Number.isInteger(bagIndex)) toggleDrawerCard(this, root, bagIndex);
      return;
    }

    const moreButton = target.closest('#more-btn');
    if (moreButton) {
      const dropdown = root.querySelector('#more-dropdown');
      if (dropdown) dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      return;
    }

    if (target.closest('#setting-btn')) {
      const modal = root.querySelector('#setting-modal');
      if (modal) modal.style.display = 'flex';
      const dropdown = root.querySelector('#more-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      return;
    }

    if (target.closest('#setting-close') || target.id === 'setting-modal') {
      const modal = root.querySelector('#setting-modal');
      if (modal) modal.style.display = 'none';
      return;
    }

    const bottomButton = target.closest('.bottom-btn[data-action]');
    if (bottomButton) {
      audio.playSfx?.('click');
      const routeMap = {
        shop: 'shop',
        bag: 'bag',
        smithy: 'smithy',
        hero: 'talent',
        mail: 'social',
        friend: 'social',
      };
      const route = routeMap[bottomButton.dataset.action];
      if (route) navigateFromRoom(route);
      return;
    }

    if (target.closest('#back-btn')) {
      audio.playButton?.('back');
      this._onBack?.();
      return;
    }

    if (target.closest('.skill-btn')) {
      navigateFromRoom('talent');
      return;
    }

    if (target.closest('.dice-btn')) {
      if (this._mode !== 'pvp') {
        this._showToast(root, '随机地图仅在PVP房间可用');
        return;
      }
      const stages = this._db?.stages ?? [];
      if (stages.length) {
        const candidates = stages.filter((stage) => stage.stage_id !== this._sid);
        const next = candidates[Math.floor(Math.random() * candidates.length)] ?? stages[0];
        this._sid = next.stage_id;
        this._stageName = next.stage_name;
        const display = root.querySelector('#room-stage-display');
        if (display) display.textContent = `${this._stageName} [简单]`;
        this._members.forEach((member) => { if (!member.owner) member.ready = false; });
        this._renderMembers(root);
        this._showToast(root, `地图已切换为 ${this._stageName}`);
      }
      return;
    }

    if (target.closest('.team-btn')) {
      this._showToast(root, this._mode === 'pvp' ? '联网换队将在房间Socket接入后启用' : '当前模式不能换队');
      return;
    }

    if (target.closest('#room-ready-btn')) {
      audio.playButton?.('sure');
      if (this._isOwner) {
        const selected = validDeck(this, this._selected);
        if (!selected.length) {
          this._showToast(root, '请至少选择1张卡牌');
          return;
        }
        const others = this._members.filter((member) => !member.owner);
        if (this._mode === 'pvp' && others.some((member) => !member.ready)) {
          this._showToast(root, '等待所有玩家准备');
          return;
        }
        saveCurrentDeckTab(this);
        DeckSelectView.saveDeck(selected, this._cardInventory);
        this._onConfirm?.([...selected], this._sid, { trainingMode: this._training });
      } else {
        const me = this._members.find((member) => member.id === 1);
        if (me) me.ready = !me.ready;
        this._updateReadyBtn(root);
        this._renderMembers(root);
      }
      return;
    }

    const kickButton = target.closest('.kick-btn');
    if (kickButton) {
      const id = Number(kickButton.dataset.kickId);
      const member = this._members.find((item) => item.id === id);
      if (member) {
        this._pendingKickId = id;
        const name = root.querySelector('#kick-target-name');
        if (name) name.textContent = member.name;
        const modal = root.querySelector('#kick-modal');
        if (modal) modal.style.display = 'flex';
      }
      return;
    }

    if (target.closest('#kick-cancel')) {
      const modal = root.querySelector('#kick-modal');
      if (modal) modal.style.display = 'none';
      this._pendingKickId = null;
      return;
    }

    if (target.closest('#kick-confirm')) {
      if (this._pendingKickId != null) {
        this._members = this._members.filter((member) => member.id !== this._pendingKickId);
        this._renderMembers(root);
        this._updateReadyBtn(root);
      }
      const modal = root.querySelector('#kick-modal');
      if (modal) modal.style.display = 'none';
      this._pendingKickId = null;
      return;
    }

    const dropdown = root.querySelector('#more-dropdown');
    if (dropdown && !target.closest('#more-dropdown')) dropdown.style.display = 'none';
    if (this._drawerOpen && !target.closest('#card-drawer')) closeDrawer(this, root, false);
  }, { signal });
}

export function installBattleRoomStabilityPatch() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  DeckSelectView.prototype._bindEvents = bindEventsStable;
  DeckSelectView.prototype._renderDeckSlots = renderDeckSlotsStable;
  DeckSelectView.prototype._renderDrawer = renderDrawerStable;

  const originalMount = App.prototype.mount;
  App.prototype.mount = function mountWithRoomNavigation() {
    originalMount.call(this);
    if (this._roomNavigationBound) return;
    this._roomNavigationBound = true;
    window.addEventListener('clbwz:navigate', (event) => {
      const route = event.detail?.route;
      if (typeof route !== 'string' || !route) return;
      this.navigate(route, event.detail?.opts ?? {});
    });
  };
}
