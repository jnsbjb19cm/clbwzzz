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

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomDeckUiV3');
const STORAGE_KEY = 'clbwz_room_decks_v4';
const LEGACY_V3_KEY = 'clbwz_room_decks_v3';
const TABS = ['default', 'team1', 'team2', 'team3'];
const PAGE_SIZE = 30;
const LEGACY_DRAWER_SELECTORS = [
  '.exact-drawer-category',
  '.exact-drawer-pager',
  '.exact-drawer-footer',
  '.exact-drawer-filter',
  '.room-card-filter-toolbar',
  '.room-drawer-track',
  '.drawer-slide-grip',
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cloneDeck(value) {
  return Array.isArray(value)
    ? value
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0)
        .slice(0, HAND_SLOT_COUNT)
    : [];
}

function cloneDeckMap(source = {}) {
  return Object.fromEntries(TABS.map((tab) => [tab, cloneDeck(source?.[tab])]));
}

function normalizeName(value) {
  return String(value ?? '')
    .replaceAll('·', '')
    .replaceAll(' ', '')
    .trim()
    .toLocaleLowerCase();
}

function normalizeDeck(view, source = view?._selected) {
  const result = [];
  const usedBagIndices = new Set();
  const usedNames = new Set();
  for (const raw of Array.isArray(source) ? source : []) {
    const bagIndex = Number(raw);
    const instance = view?._bagSlots?.[bagIndex];
    const card = instance ? view?._db?.getById(instance.cardId) : null;
    if (!Number.isInteger(bagIndex) || bagIndex < 0 || !instance || !card || card.battleUsable === false) continue;
    const name = normalizeName(card.name ?? instance.cardId);
    if (usedBagIndices.has(bagIndex) || usedNames.has(name)) continue;
    usedBagIndices.add(bagIndex);
    usedNames.add(name);
    result.push(bagIndex);
    if (result.length >= HAND_SLOT_COUNT) break;
  }
  return result;
}

function fingerprint(view, bagIndex) {
  const slot = view?._bagSlots?.[bagIndex];
  if (!slot) return null;
  return {
    index: bagIndex,
    cardId: Number(slot.cardId),
    craftQuality: Number(slot.craftQuality ?? 1),
    strengthLv: Number(slot.strengthLv ?? slot.star ?? 0),
  };
}

function inventoryFingerprint(cardInventory, bagIndex) {
  const slot = cardInventory?.getSlots?.()?.[bagIndex];
  if (!slot) return null;
  return {
    index: bagIndex,
    cardId: Number(slot.cardId),
    craftQuality: Number(slot.craftQuality ?? 1),
    strengthLv: Number(slot.strengthLv ?? slot.star ?? 0),
  };
}

function matches(slot, fp) {
  return Boolean(slot && fp)
    && Number(slot.cardId) === Number(fp.cardId)
    && Number(slot.craftQuality ?? 1) === Number(fp.craftQuality ?? 1)
    && Number(slot.strengthLv ?? slot.star ?? 0) === Number(fp.strengthLv ?? 0);
}

function reconcile(view, saved) {
  if (!Array.isArray(saved)) return [];
  const result = [];
  const used = new Set();
  for (const fp of saved) {
    let index = Number(fp?.index);
    if (!Number.isInteger(index) || used.has(index) || !matches(view?._bagSlots?.[index], fp)) {
      index = view?._bagSlots?.findIndex(
        (slot, candidate) => !used.has(candidate) && matches(slot, fp),
      ) ?? -1;
    }
    if (index >= 0) {
      used.add(index);
      result.push(index);
    }
  }
  return normalizeDeck(view, result);
}

function reconcileInventory(cardInventory, cardDb, saved) {
  if (!Array.isArray(saved) || !cardInventory?.getSlots) return [];
  const slots = cardInventory.getSlots();
  const result = [];
  const used = new Set();
  for (const fp of saved) {
    let index = Number(fp?.index);
    if (!Number.isInteger(index) || used.has(index) || !matches(slots[index], fp)) {
      index = slots.findIndex((slot, candidate) => !used.has(candidate) && matches(slot, fp));
    }
    const card = index >= 0 ? cardDb?.getById(slots[index]?.cardId) : null;
    if (index >= 0 && card?.battleUsable !== false) {
      used.add(index);
      result.push(index);
    }
  }
  return cloneDeck(result);
}

function readRawStoredState() {
  for (const key of [STORAGE_KEY, LEGACY_V3_KEY]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  return null;
}

function loadStoredState(view) {
  const parsed = readRawStoredState();
  const decks = {};
  for (const tab of TABS) decks[tab] = reconcile(view, parsed?.decks?.[tab]);
  return {
    activeTab: TABS.includes(parsed?.activeTab) ? parsed.activeTab : 'default',
    decks,
  };
}

function serializeState(view, decks = view?._v3Committed) {
  const payload = {};
  for (const tab of TABS) {
    payload[tab] = normalizeDeck(view, decks?.[tab])
      .map((index) => fingerprint(view, index))
      .filter(Boolean);
  }
  return {
    version: 4,
    activeTab: TABS.includes(view?._deckTab) ? view._deckTab : 'default',
    decks: payload,
    updatedAt: Date.now(),
  };
}

function persistCommittedState(view) {
  const state = serializeState(view, view._v3Committed);
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(LEGACY_V3_KEY, json);
  } catch {}
}

function initializeState(view, incomingDeck) {
  const stored = loadStoredState(view);
  const incoming = normalizeDeck(view, incomingDeck);
  const decks = cloneDeckMap(stored.decks);
  if (!decks.default.length) decks.default = incoming;

  view._deckTab = stored.activeTab;
  if (!decks[view._deckTab].length && view._deckTab === 'default') {
    decks.default = incoming;
  }

  view._v3Decks = decks;
  view._v3Committed = cloneDeckMap(decks);
  view._selected = cloneDeck(decks[view._deckTab]);
  view._v3Filter = 'all';
  view._v3Page = 0;
  view._activeSwapSlot = null;
  view._v3SessionSnapshots = null;
  view._drawerOpen = false;
  view._deckControllerVersion = 4;
}

function syncDraft(view) {
  view._selected = normalizeDeck(view);
  view._v3Decks ??= cloneDeckMap();
  view._v3Decks[view._deckTab] = cloneDeck(view._selected);
}

function commitDrafts(view) {
  syncDraft(view);
  view._v3Committed = cloneDeckMap(view._v3Decks);
  persistCommittedState(view);
  view.__originalSaveDeck?.(view._selected, view._cardInventory);
}

function cardMeta(view, bagIndex) {
  const instance = view?._bagSlots?.[bagIndex];
  const card = instance ? view?._db?.getById(instance.cardId) : null;
  if (!instance || !card) return null;
  const quality = resolveCraftQuality(instance.craftQuality ?? card.quality ?? 1);
  const food = usesFoodCost(card);
  const attackStyle = Number(card.atkStyle ?? card.atk_style ?? 0);
  const type = Number(card.type ?? card.card_type ?? 1);
  const moving = Number(card.moveSpeed ?? card.move_speed ?? 0) > 0;
  const range = Number(card.range ?? card.atkRange ?? 0);
  let functionLabel = '攻击';
  let functionIcon = '⚔';
  if (getCardCategory(card) === CARD_CATEGORY.ACTIVE_SKILL) {
    functionLabel = '主动';
    functionIcon = '✦';
  } else if (type === 3) {
    functionLabel = '陷阱';
    functionIcon = '⌁';
  } else if (attackStyle === 1) {
    functionLabel = '防御';
    functionIcon = '◆';
  } else if (type === 2) {
    functionLabel = '辅助';
    functionIcon = '✚';
  } else if (moving) {
    functionLabel = '突击';
    functionIcon = '➜';
  } else if (range > 1 || [2, 3, 17, 18, 19].includes(attackStyle)) {
    functionLabel = '远程';
    functionIcon = '◎';
  }
  const group = isPlantCard(card) ? 'plant' : isMonsterCard(card) ? 'monster' : 'other';
  const feature = String(card.desc ?? card.feature ?? card.trait ?? `${functionLabel}类卡牌`).trim();
  return {
    bagIndex,
    instance,
    card,
    quality,
    group,
    functionLabel,
    functionIcon,
    feature,
    resourceIcon: food ? JUNGLE_ASSETS.resFood : JUNGLE_ASSETS.resSun,
    resourceLabel: food ? '食物' : '阳光',
    cost: Number(card.cost ?? 0),
    stars: Math.max(0, Number(instance.star ?? instance.strengthLv ?? 0) || 0),
  };
}

function selectedNames(view) {
  const map = new Map();
  normalizeDeck(view).forEach((bagIndex, slotIndex) => {
    const meta = cardMeta(view, bagIndex);
    if (meta) map.set(normalizeName(meta.card.name), { bagIndex, slotIndex });
  });
  return map;
}

function cardMarkup(meta, { compact = false, selected = false, duplicate = false } = {}) {
  const stars = meta.stars > 0 ? '★'.repeat(Math.min(6, meta.stars)) : '☆☆☆☆☆☆';
  return `
    <span class="v3-card-quality" aria-hidden="true"></span>
    <span class="v3-card-stars">${stars}</span>
    <img class="v3-card-art" src="/sprites/cards/${meta.card.spriteRes}.png" alt="" draggable="false" />
    ${compact ? '' : `<span class="v3-card-name">${escapeHtml(formatCraftCardName(meta.instance.craftQuality, meta.card.name))}</span>`}
    <span class="v3-card-footer">
      <span class="v3-card-resource"><img src="${meta.resourceIcon}" alt="${meta.resourceLabel}" /></span>
      <b class="v3-card-cost">${meta.cost}</b>
      <span class="v3-card-function" title="${escapeHtml(meta.functionLabel)}"><i>${meta.functionIcon}</i>${compact ? '' : `<em>${meta.functionLabel}</em>`}</span>
    </span>
    ${selected ? '<span class="v3-card-mark selected">已上阵</span>' : ''}
    ${duplicate ? '<span class="v3-card-mark duplicate">同名已上阵</span>' : ''}
  `;
}

function removeLegacyDrawerUi(drawer) {
  for (const selector of LEGACY_DRAWER_SELECTORS) {
    drawer.querySelectorAll(selector).forEach((element) => element.remove());
  }
}

function ensureDrawerShell(view, root) {
  const drawer = root.querySelector('#card-drawer');
  if (!drawer) return null;
  removeLegacyDrawerUi(drawer);

  const shells = [...drawer.querySelectorAll(':scope > .deck-drawer-v3')];
  shells.slice(1).forEach((shell) => shell.remove());
  let shell = shells[0] ?? null;
  if (!shell) {
    drawer.replaceChildren();
    shell = document.createElement('section');
    shell.className = 'deck-drawer-v3';
    shell.setAttribute('aria-label', '卡牌仓库');
    shell.innerHTML = `
      <header class="v3-drawer-header">
        <span></span><strong>卡牌仓库</strong><span></span>
        <button type="button" class="v3-drawer-close" aria-label="关闭">×</button>
      </header>
      <p class="v3-drawer-tip">请单击选择您要上场的卡片；双击已携带卡牌可取消。</p>
      <div class="v3-drawer-body">
        <nav class="v3-drawer-filters" aria-label="卡牌分类">
          <button type="button" data-v3-filter="all">全部</button>
          <button type="button" data-v3-filter="plant">植物</button>
          <button type="button" data-v3-filter="monster">怪物</button>
        </nav>
        <div class="drawer-cards v3-drawer-grid" id="drawer-cards"></div>
        <aside class="v3-drawer-pager">
          <button type="button" data-v3-page="prev">上一页</button>
          <span id="v3-page-label">1 / 1</span>
          <button type="button" data-v3-page="next">下一页</button>
        </aside>
      </div>
      <footer class="v3-drawer-actions">
        <button type="button" data-v3-action="reset">重置</button>
        <button type="button" data-v3-action="confirm" class="primary">确定</button>
        <button type="button" data-v3-action="cancel">取消</button>
      </footer>`;
    drawer.append(shell);
  }

  for (const child of [...drawer.children]) {
    if (child !== shell) child.remove();
  }

  drawer.classList.add('card-drawer-v3-host');
  drawer.dataset.singleDeckUi = 'true';
  drawer.querySelectorAll('[data-v3-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.v3Filter === view._v3Filter);
  });
  return drawer;
}

function renderDeckSlots(root) {
  const container = root.querySelector('#deck-slots-row');
  if (!container) return;
  this._selected = normalizeDeck(this);
  container.innerHTML = Array.from({ length: HAND_SLOT_COUNT }, (_, slotIndex) => {
    const bagIndex = this._selected[slotIndex];
    const meta = bagIndex != null ? cardMeta(this, bagIndex) : null;
    const active = this._activeSwapSlot === slotIndex;
    if (!meta) {
      return `<button type="button" class="deck-slot-item v3-deck-slot empty${active ? ' swap-source' : ''}" data-slot-idx="${slotIndex}" aria-label="第${slotIndex + 1}卡槽，空位"><span class="v3-empty-number">${slotIndex + 1}</span></button>`;
    }
    return `
      <button type="button" class="deck-slot-item v3-deck-slot filled${active ? ' swap-source' : ''}"
        data-slot-idx="${slotIndex}" data-bag-idx="${bagIndex}"
        style="--quality:${meta.quality.color}"
        title="${escapeHtml(meta.card.name)}｜${meta.resourceLabel}${meta.cost}｜${escapeHtml(meta.functionLabel)}｜${escapeHtml(meta.feature)}">
        ${cardMarkup(meta, { compact: true })}
      </button>`;
  }).join('');
}

function filteredPool(view) {
  const filter = view._v3Filter ?? 'all';
  return (view._pool ?? [])
    .map(({ index }) => cardMeta(view, index))
    .filter(Boolean)
    .filter((meta) => filter === 'all' || meta.group === filter);
}

function renderDrawer(root) {
  const drawer = ensureDrawerShell(this, root);
  const grid = drawer?.querySelector('#drawer-cards');
  if (!drawer || !grid) return;
  this._selected = normalizeDeck(this);
  const cards = filteredPool(this);
  const pageCount = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  this._v3Page = Math.max(0, Math.min(pageCount - 1, Number(this._v3Page) || 0));
  const page = cards.slice(this._v3Page * PAGE_SIZE, (this._v3Page + 1) * PAGE_SIZE);
  const selectedBag = new Set(this._selected);
  const names = selectedNames(this);

  grid.innerHTML = page.length
    ? page.map((meta) => {
        const picked = selectedBag.has(meta.bagIndex);
        const sameName = names.get(normalizeName(meta.card.name));
        const duplicate = Boolean(sameName && !picked && sameName.slotIndex !== this._activeSwapSlot);
        return `
          <button type="button" class="drawer-card v3-drawer-card${picked ? ' selected' : ''}${duplicate ? ' same-name-disabled' : ''}"
            data-idx="${meta.bagIndex}" aria-disabled="${duplicate ? 'true' : 'false'}"
            style="--quality:${meta.quality.color}"
            title="${escapeHtml(meta.card.name)}｜${meta.resourceLabel}${meta.cost}｜${escapeHtml(meta.functionLabel)}｜${escapeHtml(meta.feature)}">
            ${cardMarkup(meta, { selected: picked, duplicate })}
          </button>`;
      }).join('')
    : '<p class="v3-drawer-empty">当前分类没有卡牌</p>';

  const label = drawer.querySelector('#v3-page-label');
  if (label) label.textContent = `${this._v3Page + 1} / ${pageCount}`;
  drawer.querySelectorAll('[data-v3-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.v3Filter === this._v3Filter);
  });
  drawer.querySelector('[data-v3-page="prev"]')?.toggleAttribute('disabled', this._v3Page <= 0);
  drawer.querySelector('[data-v3-page="next"]')?.toggleAttribute('disabled', this._v3Page >= pageCount - 1);
}

function refresh(view, root) {
  view._renderDeckSlots(root);
  view._renderDrawer(root);
  root.querySelectorAll('.deck-tab').forEach((button) => {
    const active = button.dataset.tab === view._deckTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function openDrawer(view, root) {
  const drawer = ensureDrawerShell(view, root);
  if (!drawer) return;
  if (!view._drawerOpen) {
    syncDraft(view);
    view._v3SessionSnapshots = cloneDeckMap(view._v3Decks);
  }
  view._drawerOpen = true;
  drawer.classList.add('open');
  root.querySelector('#swap-card-btn')?.classList.add('active');
  refresh(view, root);
}

function closeDrawer(view, root, { restore = false } = {}) {
  if (restore && view._v3SessionSnapshots) {
    view._v3Decks = cloneDeckMap(view._v3SessionSnapshots);
    view._selected = cloneDeck(view._v3Decks[view._deckTab]);
  } else {
    syncDraft(view);
  }
  view._v3SessionSnapshots = null;
  view._drawerOpen = false;
  root.querySelector('#card-drawer')?.classList.remove('open');
  root.querySelector('#swap-card-btn')?.classList.remove('active');
  view._activeSwapSlot = null;
  refresh(view, root);
}

function switchTab(view, root, tab) {
  if (!TABS.includes(tab) || tab === view._deckTab) return;
  syncDraft(view);
  view._deckTab = tab;
  view._selected = cloneDeck(view._v3Decks?.[tab]);
  view._activeSwapSlot = null;
  view._v3Page = 0;
  refresh(view, root);
}

function swapSlots(view, first, second) {
  const deck = normalizeDeck(view);
  if (first === second || deck[first] == null) return;
  if (deck[second] == null) {
    const [moving] = deck.splice(first, 1);
    deck.splice(Math.min(second, deck.length), 0, moving);
  } else {
    [deck[first], deck[second]] = [deck[second], deck[first]];
  }
  view._selected = deck;
}

function handleSlotClick(view, root, slotIndex) {
  const active = Number.isInteger(view._activeSwapSlot) ? view._activeSwapSlot : null;
  if (active == null) {
    view._activeSwapSlot = slotIndex;
    openDrawer(view, root);
  } else if (active === slotIndex) {
    view._activeSwapSlot = null;
  } else {
    swapSlots(view, active, slotIndex);
    view._activeSwapSlot = null;
    syncDraft(view);
  }
  refresh(view, root);
}

function handleDrawerCard(view, root, bagIndex) {
  const meta = cardMeta(view, bagIndex);
  if (!meta) return;
  const pickedSlot = view._selected.indexOf(bagIndex);
  const active = Number.isInteger(view._activeSwapSlot) ? view._activeSwapSlot : null;
  const sameName = selectedNames(view).get(normalizeName(meta.card.name));
  if (sameName && pickedSlot < 0 && sameName.slotIndex !== active) {
    view._showToast?.(root, `“${meta.card.name}”已在战团中，同名卡不能重复上阵`);
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
  } else if (pickedSlot >= 0) {
    view._activeSwapSlot = pickedSlot;
  } else if (view._selected.length < HAND_SLOT_COUNT) {
    view._selected.push(bagIndex);
  } else {
    view._showToast?.(root, `最多携带 ${HAND_SLOT_COUNT} 张卡牌，请先选择要替换的卡槽`);
    return;
  }
  syncDraft(view);
  refresh(view, root);
}

function handleReady(view, root) {
  syncDraft(view);
  const valid = normalizeDeck(view);
  if (!valid.length) {
    view._showToast?.(root, '请至少选择1张卡牌');
    return;
  }

  // 真实房间(socket roomState)模式：走 socket 准备/开始，不用本地 id===1 匹配
  if (view._roomState) {
    if (view._isOwner) view._roomState.onStart?.();
    else view._roomState.onReady?.();
    return;
  }

  if (!view._isOwner) {
    const me = view._members?.find((member) => member.id === 1);
    if (me) {
      me.ready = !me.ready;
      view._updateReadyBtn?.(root);
      view._renderMembers?.(root);
    }
    return;
  }

  if (view._mode === 'pvp') {
    const others = (view._members ?? []).filter((member) => !member.owner);
    const allReady = others.length === 0 || others.every((member) => member.ready);
    if (!allReady) {
      view._showToast?.(root, '等待所有玩家准备');
      return;
    }
  }

  commitDrafts(view);
  view._onConfirm?.([...valid], view._sid, { trainingMode: view._training });
}

function bindBaseRoomEvents(view, root) {
  // 随机地图：仅房主可用（PVP 房间）→ 随机场景（草地/黄沙/冰川）+ 显示地图名
  const diceBtn = root.querySelector('.dice-btn');
  if (diceBtn) {
    const isOwner = Boolean(view._roomState?.isOwner ?? view._isOwner ?? root.querySelector('[data-owner]') !== null);
    if (!isOwner) diceBtn.disabled = true;
    diceBtn.addEventListener('click', () => {
      if (!isOwner) return;
      const scenes = [
        { key: 'grass', label: '草地' },
        { key: 'rock', label: '黄沙' },
        { key: 'ice', label: '冰川' },
      ];
      const picked = scenes[Math.floor(Math.random() * scenes.length)];
      if (typeof window !== 'undefined') window.__pvpMapScene = picked.key;
      // 房主随机地图 → 广播给全房间（2=草地、4=冰川、7=黄沙），全员同步同一场景
      const mapIdByScene = { grass: '2', rock: '7', ice: '4' };
      view._roomState?.onChangeMap?.(mapIdByScene[picked.key]);
      // 地图名显示在随机地图按钮上（不占用顶部房间名称区）
      const label = root.querySelector('.dice-label');
      if (label) label.textContent = `${picked.label}地图`;
      const icon = root.querySelector('.dice-icon');
      if (icon) icon.textContent = picked.key === 'grass' ? '🌿' : picked.key === 'rock' ? '🏜️' : '❄️';
      const btn = root.querySelector('.dice-btn');
      if (btn) btn.title = `随机地图（当前：${picked.label}地图）`;
    });
  }
  const moreBtn = root.querySelector('#more-btn');
  const moreDropdown = root.querySelector('#more-dropdown');
  moreBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    moreDropdown.style.display = moreDropdown.style.display === 'none' ? 'block' : 'none';
  });
  root.addEventListener('click', (event) => {
    if (!event.target.closest('#more-btn') && moreDropdown) moreDropdown.style.display = 'none';
  });

  root.querySelector('#setting-btn')?.addEventListener('click', () => {
    const modal = root.querySelector('#setting-modal');
    if (modal) modal.style.display = 'flex';
  });
  root.querySelector('#setting-close')?.addEventListener('click', () => {
    const modal = root.querySelector('#setting-modal');
    if (modal) modal.style.display = 'none';
  });
  root.querySelector('#setting-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) event.currentTarget.style.display = 'none';
  });

  const musicVol = root.querySelector('#music-vol');
  const sfxVol = root.querySelector('#sfx-vol');
  const showCardName = root.querySelector('#show-card-name');
  musicVol?.addEventListener('input', (event) => {
    view._roomSettings.musicVol = Number(event.target.value);
    const value = root.querySelector('#music-vol-val');
    if (value) value.textContent = event.target.value;
  });
  sfxVol?.addEventListener('input', (event) => {
    view._roomSettings.sfxVol = Number(event.target.value);
    const value = root.querySelector('#sfx-vol-val');
    if (value) value.textContent = event.target.value;
  });
  showCardName?.addEventListener('change', (event) => {
    view._roomSettings.showCardName = event.target.checked;
  });

  root.querySelectorAll('.bottom-btn[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      audio.playSfx('click');
      const route = button.dataset.action;
      if (['bag', 'smithy', 'shop'].includes(route)) {
        window.dispatchEvent(new CustomEvent('clbwz:navigate', { detail: { route } }));
      } else {
        view._showToast?.(root, `${button.textContent.trim()} 功能即将开放`);
      }
    });
  });

  root.querySelector('#back-btn')?.addEventListener('click', () => {
    audio.playButton('back');
    view._onBack?.();
  });

  view._pendingKickId = null;
  root.querySelector('#kick-cancel')?.addEventListener('click', () => {
    const modal = root.querySelector('#kick-modal');
    if (modal) modal.style.display = 'none';
    view._pendingKickId = null;
  });
  root.querySelector('#kick-confirm')?.addEventListener('click', () => {
    if (view._pendingKickId != null) {
      view._members = view._members.filter((member) => member.id !== view._pendingKickId);
      view._renderMembers?.(root);
      view._updateReadyBtn?.(root);
    }
    const modal = root.querySelector('#kick-modal');
    if (modal) modal.style.display = 'none';
    view._pendingKickId = null;
  });
}

function bindController(view, root) {
  const room = root.querySelector('.game-room');
  if (!room || room.__deckUiV3Bound) return;
  room.__deckUiV3Bound = true;
  room.classList.add('room-deck-ui-v3');
  room.__deckUiV3View = view;

  room.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('#room-ready-btn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      audio.playButton('sure');
      handleReady(view, root);
      return;
    }

    const tab = target.closest('.deck-tab');
    if (tab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      audio.playSfx('click');
      switchTab(view, root, tab.dataset.tab);
      return;
    }

    if (target.closest('#swap-card-btn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      audio.playSfx('click');
      if (view._drawerOpen) closeDrawer(view, root, { restore: false });
      else openDrawer(view, root);
      return;
    }

    const filter = target.closest('[data-v3-filter]');
    if (filter) {
      event.preventDefault();
      event.stopImmediatePropagation();
      view._v3Filter = filter.dataset.v3Filter || 'all';
      view._v3Page = 0;
      view._renderDrawer(root);
      return;
    }

    const pageButton = target.closest('[data-v3-page]');
    if (pageButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!pageButton.disabled) {
        view._v3Page += pageButton.dataset.v3Page === 'next' ? 1 : -1;
      }
      view._renderDrawer(root);
      return;
    }

    const action = target.closest('[data-v3-action]')?.dataset.v3Action;
    if (action) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'reset') {
        view._selected = cloneDeck(view._v3Committed?.[view._deckTab]);
        view._v3Decks[view._deckTab] = cloneDeck(view._selected);
        view._activeSwapSlot = null;
        view._v3Page = 0;
        refresh(view, root);
      } else if (action === 'confirm') {
        commitDrafts(view);
        closeDrawer(view, root, { restore: false });
        view._showToast?.(root, '当前战团已保存');
      } else {
        closeDrawer(view, root, { restore: true });
      }
      return;
    }

    if (target.closest('.v3-drawer-close')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDrawer(view, root, { restore: true });
      return;
    }

    const slot = target.closest('#deck-slots-row .v3-deck-slot');
    if (slot) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.detail > 1) return;
      audio.playSfx('click');
      handleSlotClick(view, root, Number(slot.dataset.slotIdx));
      return;
    }

    const card = target.closest('#drawer-cards .v3-drawer-card');
    if (card) {
      event.preventDefault();
      event.stopImmediatePropagation();
      audio.playClickCard();
      handleDrawerCard(view, root, Number(card.dataset.idx));
    }
  }, true);

  room.addEventListener('dblclick', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const slot = target?.closest('#deck-slots-row .v3-deck-slot.filled');
    if (!slot) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const slotIndex = Number(slot.dataset.slotIdx);
    if (view._selected?.[slotIndex] == null) return;
    view._selected.splice(slotIndex, 1);
    view._activeSwapSlot = null;
    syncDraft(view);
    refresh(view, root);
  }, true);
}

export function installBattleRoomDeckUiV3() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalLoadSavedDeck = DeckSelectView.loadSavedDeck.bind(DeckSelectView);
  const originalSaveDeck = DeckSelectView.saveDeck.bind(DeckSelectView);

  DeckSelectView.loadSavedDeck = function loadConfirmedV4Deck(cardInventory, db) {
    const parsed = readRawStoredState();
    const activeTab = TABS.includes(parsed?.activeTab) ? parsed.activeTab : 'default';
    const saved = reconcileInventory(cardInventory, db, parsed?.decks?.[activeTab]);
    return saved.length ? saved : originalLoadSavedDeck(cardInventory, db);
  };

  DeckSelectView.saveDeck = function saveConfirmedV4Deck(indices, cardInventory) {
    originalSaveDeck(indices, cardInventory);
    const parsed = readRawStoredState() ?? { version: 4, activeTab: 'default', decks: {} };
    const activeTab = TABS.includes(parsed.activeTab) ? parsed.activeTab : 'default';
    parsed.version = 4;
    parsed.activeTab = activeTab;
    parsed.decks ??= {};
    parsed.decks[activeTab] = cloneDeck(indices)
      .map((index) => inventoryFingerprint(cardInventory, index))
      .filter(Boolean);
    parsed.updatedAt = Date.now();
    try {
      const json = JSON.stringify(parsed);
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem(LEGACY_V3_KEY, json);
    } catch {}
  };

  DeckSelectView.prototype._bindEvents = function bindSingleDeckControllerBase(root) {
    bindBaseRoomEvents(this, root);
  };
  DeckSelectView.prototype._renderDeckSlots = renderDeckSlots;
  DeckSelectView.prototype._renderDrawer = renderDrawer;

  const previousRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderWithSingleDeckController(root, options = {}) {
    this.__originalSaveDeck = originalSaveDeck;
    const result = previousRender.call(this, root, options);
    initializeState(this, this._selected);
    bindController(this, root);
    refresh(this, root);
    return result;
  };

  window.__verifyBattleRoomDeckUiV3 = () => {
    const room = document.querySelector('.game-room.room-deck-ui-v3');
    const view = room?.__deckUiV3View;
    const drawer = room?.querySelector('#card-drawer');
    return {
      enabled: Boolean(room && view),
      controllerVersion: view?._deckControllerVersion ?? null,
      activeTab: view?._deckTab ?? null,
      selected: cloneDeck(view?._selected),
      committed: cloneDeck(view?._v3Committed?.[view?._deckTab]),
      filter: view?._v3Filter ?? null,
      page: view?._v3Page ?? null,
      visibleCards: room?.querySelectorAll('.v3-drawer-card').length ?? 0,
      drawerOpen: Boolean(drawer?.classList.contains('open')),
      drawerShellCount: drawer?.querySelectorAll(':scope > .deck-drawer-v3').length ?? 0,
      legacyDrawerCount: LEGACY_DRAWER_SELECTORS.reduce(
        (count, selector) => count + (drawer?.querySelectorAll(selector).length ?? 0),
        0,
      ),
      stored: Boolean(readRawStoredState()),
    };
  };
}
