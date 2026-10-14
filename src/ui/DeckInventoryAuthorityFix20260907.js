import { CardInventoryStore } from '../core/CardInventoryStore.js';
import { authStore } from '../core/AuthStore.js';
import { DeckSelectView } from './DeckSelectView.js';
import {
  deckGroupToNumber20260906,
  normalizeDeckGroup20260906,
} from './DeckGroupSelection20260906.js';

const INSTALL_FLAG = Symbol.for('clbwz.deckInventoryAuthorityFix20260907');
const DECK_RUNTIME_FLAG = Symbol.for('clbwz.deckServerPersistence20260907');
const REFILL_RUNTIME_FLAG = Symbol.for('clbwz.cardRefillAuthority20260907');
const DECK_PENDING = new Map();

/**
 * 2026-10-11（用户实测：牌组键里是「完美花生射手 @20 q5」，进战斗却永远拿到 slot0 的 q2）：
 * 读本地「按组存档」（battle_deck_v2 / battle_deck_v2_teamN）并做指纹比对，
 * 拿回**玩家自己选的那一套下标**（含品质/星级）。读不到/比对不出 → null。
 */
function localKeyedDeckIndices20261011(group, cardInventory) {
  try {
    const key = !group || group === 'default' ? 'battle_deck_v2' : `battle_deck_v2_${group}`;
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const reconciled = DeckSelectView.reconcileFingerprints?.(parsed, cardInventory) ?? [];
    return reconciled.length ? reconciled : null;
  } catch {
    return null;
  }
}

/** 两套下标对应的"卡片组成"（按 cardId 的顺序）是否一致。 */
function sameCardIdSequence20261011(a, b, cardInventory) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const slots = cardInventory?.getSlots?.() ?? [];
  const ids = (list) => list.map((i) => Number(slots[i]?.cardId) || 0);
  const left = ids(a);
  const right = ids(b);
  return left.every((value, index) => value === right[index]);
}

function currentUserId() {
  return Number(authStore?.user?.id ?? authStore?.snapshot?.profile?.userId) || 0;
}

function deckCacheKey(deckNo) {
  return `${currentUserId()}:${deckNo}`;
}

function cardIdsFromSelection(selected, cardInventory) {
  const slots = cardInventory?.getSlots?.() ?? [];
  const ids = [];
  for (const index of selected ?? []) {
    const cardId = Number(slots[index]?.cardId);
    if (!Number.isInteger(cardId) || cardId <= 0 || ids.includes(cardId)) continue;
    ids.push(cardId);
  }
  return ids.slice(0, 10);
}

function reconcileCardIds(cardIds, cardInventory) {
  if (!cardInventory || !Array.isArray(cardIds)) return null;
  const slots = cardInventory.getSlots?.() ?? [];
  const used = new Set();
  const selected = [];
  for (const rawId of cardIds) {
    const cardId = Number(rawId?.cardId ?? rawId);
    if (!Number.isInteger(cardId) || cardId <= 0) continue;
    const index = slots.findIndex((slot, slotIndex) => {
      if (!slot || used.has(slotIndex) || Number(slot.cardId) !== cardId) return false;
      return cardInventory.cardDb?.getById?.(cardId)?.battleUsable !== false;
    });
    if (index >= 0) {
      used.add(index);
      selected.push(index);
    }
  }
  return selected;
}

/** 2026-10-11：选择 → 条目（含品质/星级），供入库使用。 */
function deckEntriesFromSelection(selected, cardInventory) {
  const slots = cardInventory?.getSlots?.() ?? [];
  const seen = new Set();
  const entries = [];
  for (const index of selected ?? []) {
    const slot = slots[index];
    const cardId = Number(slot?.cardId);
    if (!Number.isInteger(cardId) || cardId <= 0 || seen.has(cardId)) continue;
    seen.add(cardId);
    entries.push({ cardId, craftQuality: slot?.craftQuality ?? 1, strengthLv: slot?.strengthLv ?? 0 });
  }
  return entries.slice(0, 10);
}

function snapshotDeckIds(deckNo) {
  const decks = authStore?.snapshot?.decks;
  if (!Array.isArray(decks)) return null;
  const deck = decks.find((entry) => Number(entry?.deckNo ?? entry?.deck_no) === deckNo);
  if (!deck || !Array.isArray(deck.cards)) return null;
  return deck.cards.map((entry) => Number(entry?.cardId ?? entry)).filter(Number.isInteger);
}

function updateSnapshotDeck(deckNo, cardIds) {
  const decks = authStore?.snapshot?.decks;
  if (!Array.isArray(decks)) return;
  const deck = decks.find((entry) => Number(entry?.deckNo ?? entry?.deck_no) === deckNo);
  if (!deck) return;
  deck.cards = cardIds.map((cardId, slotIndex) => ({ slotIndex, cardId }));
}

// 2026-10-12：服务端玩家快照里的权威卡表（player.js 保存战团时就是按它校验的）
// 拿不到时返回 null —— 此时不过滤，保持原行为，避免误删合法卡。
function ownedCardIdSet() {
  const cards = authStore?.snapshot?.cardInventory?.cards;
  if (!Array.isArray(cards)) return null;
  const set = new Set();
  for (const entry of cards) {
    const id = Number(entry?.cardId ?? entry);
    if (Number.isInteger(id) && id > 0) set.add(id);
  }
  return set;
}

function queueDeckSave(deckNo, cardIds, entries = null) {
  if (!authStore?.isLoggedIn?.() || deckNo < 0 || deckNo > 3) return Promise.resolve();
  const key = deckCacheKey(deckNo);
  // 2026-10-12：只发"服务端确实拥有"的卡 —— 否则服务端会 403（player.js:160）
  // （客户端本地库存可能比服务端多，比如本地补卡/未同步时；这里做最后一道收口）
  const ownedIds = ownedCardIdSet();
  const requestedIds = ownedIds ? [...cardIds].filter((id) => ownedIds.has(Number(id))) : [...cardIds];
  if (ownedIds && requestedIds.length !== cardIds.length) {
    const dropped = [...cardIds].filter((id) => !ownedIds.has(Number(id)));
    console.warn('[deck] 保存前过滤掉未拥有的卡：' + dropped.join(',') + '（原 ' + cardIds.length + ' 张 → 现 ' + requestedIds.length + ' 张）');
  }
  const signature = requestedIds.join(',');
  // 2026-10-11：把实例（品质/星级）一起发给服务端入库；没有 entries 时按纯 id 兜底。
  const requestedEntries = Array.isArray(entries) && entries.length
    ? entries
    : requestedIds.map((cardId) => ({ cardId, craftQuality: 1, strengthLv: 0 }));
  const state = DECK_PENDING.get(key) ?? { signature: null, queue: Promise.resolve(), cardIds: null };
  state.cardIds = [...requestedIds];
  if (state.signature === signature) {
    DECK_PENDING.set(key, state);
    return state.queue;
  }
  state.signature = signature;
  state.queue = state.queue
    .catch(() => {})
    .then(async () => {
      try {
        const result = await authStore.api.put(`/player/decks/${deckNo}`, { cards: requestedIds, entries: requestedEntries });
        const savedIds = Array.isArray(result?.cards)
          ? result.cards.map(Number).filter(Number.isInteger)
          : requestedIds;
        updateSnapshotDeck(deckNo, savedIds);
        state.cardIds = [...savedIds];
      } catch (error) {
        state.signature = null;
        state.cardIds = null;
        console.warn(`[deck] 战团${deckNo}保存失败`, error);
        throw error;
      }
    });
  DECK_PENDING.set(key, state);
  return state.queue;
}

function pendingDeckSave(group) {
  const normalized = normalizeDeckGroup20260906(group);
  const deckNo = deckGroupToNumber20260906(normalized);
  if (deckNo < 0 || deckNo > 3) return Promise.resolve();
  return DECK_PENDING.get(deckCacheKey(deckNo))?.queue ?? Promise.resolve();
}

function installDeckServerPersistence() {
  if (DeckSelectView[DECK_RUNTIME_FLAG]) return;
  DeckSelectView[DECK_RUNTIME_FLAG] = true;

  const priorLoadSavedDeck = DeckSelectView.loadSavedDeck.bind(DeckSelectView);
  const priorSaveDeck = DeckSelectView.saveDeck.bind(DeckSelectView);

  DeckSelectView.loadSavedDeck = function loadServerBackedDeck(cardInventory, db, group) {
    const normalized = normalizeDeckGroup20260906(group ?? cardInventory?.__activeDeckGroup20260907 ?? 'default');
    // 2026-09-11：默认组（deckNo=0）也入库，不再只靠 localStorage。
    const deckNo = deckGroupToNumber20260906(normalized);
    if (deckNo >= 0 && deckNo <= 3 && authStore?.isLoggedIn?.()) {
      const pending = DECK_PENDING.get(deckCacheKey(deckNo))?.cardIds;
      const cardIds = pending ?? snapshotDeckIds(deckNo);
      if (Array.isArray(cardIds)) {
        const selected = reconcileCardIds(cardIds, cardInventory);
        // 2026-10-11（用户实测：牌组键里是「完美花生射手 @20 q5」，进战斗却永远拿到 slot0 的 q2）：
        // 本函数以前**直接返回**服务端快照推出来的下标。而服务端只存 cardId，
        // reconcileCardIds 只能落到"第一张同 id 的卡" —— 玩家选的实例（品质/星级）就被换掉了。
        // 现在：先看**本地按组存档**（battle_deck_v2[_teamN]，带品质/星级指纹）；
        //   · 如果本地那一套的"卡片组成"（按 cardId 的顺序）与账号一致 → 用本地那一套（保住玩家的实例）；
        //   · 组成不一致（账号确实改了牌组内容）→ 才用账号推出来的结果。
        const localKeyed = localKeyedDeckIndices20261011(normalized, cardInventory);
        if (localKeyed && Array.isArray(selected) && sameCardIdSequence20261011(localKeyed, selected, cardInventory)) {
          return localKeyed;
        }
        if (Array.isArray(selected)) return selected;
      }
    }
    return priorLoadSavedDeck(cardInventory, db, normalized);
  };

  DeckSelectView.saveDeck = function saveServerBackedDeck(selected, cardInventory, group) {
    const normalized = normalizeDeckGroup20260906(group ?? cardInventory?.__activeDeckGroup20260907 ?? 'default');
    priorSaveDeck(selected, cardInventory, normalized);
    const deckNo = deckGroupToNumber20260906(normalized);
    if (deckNo < 0 || deckNo > 3) return Promise.resolve();
    const cardIds = cardIdsFromSelection(selected, cardInventory);
    // 2026-10-11：连实例（品质/星级）一起入库，这样从库里回读也能精确还原玩家选的那张。
    const entriesForSave = deckEntriesFromSelection(selected, cardInventory);
    return queueDeckSave(deckNo, cardIds, entriesForSave);
  };

  // Room start/ready must not race the asynchronous PUT /player/decks/:deckNo.
  // Waiting for this queue guarantees the server starts with the exact group
  // that the player sees in the room instead of a stale/default deck snapshot.
  DeckSelectView.awaitDeckSave20260908 = function awaitDeckSave20260908(group) {
    return pendingDeckSave(group);
  };
}

function queueAuthoritativeRefill(store) {
  store._cardRefillPending = true;
  store._remoteCardInventoryQueue = (store._remoteCardInventoryQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      try {
        const snapshot = await authStore.api.post('/player/card-inventory/refill-collectibles', {});
        if (snapshot?.cards && typeof store.applyServerSnapshot === 'function') {
          store.applyServerSnapshot(snapshot);
          if (authStore.snapshot) authStore.snapshot.cardInventory = snapshot;
        }
        store._remoteCardInventoryError = null;
        return snapshot;
      } catch (error) {
        store._remoteCardInventoryError = error;
        // 回到服务器权威状态，避免补卡请求失败后本地仍显示不存在的卡。
        try {
          const snapshot = await authStore.api.get('/player/card-inventory');
          if (snapshot?.cards && typeof store.applyServerSnapshot === 'function') {
            store.applyServerSnapshot(snapshot);
            if (authStore.snapshot) authStore.snapshot.cardInventory = snapshot;
          }
        } catch {}
        console.warn('[card-inventory] 补全卡保存失败', error);
      }
    }).finally(() => { store._cardRefillPending = false; });
  return store._remoteCardInventoryQueue;
}

function installCollectibleRefillAuthority() {
  const proto = CardInventoryStore.prototype;
  if (proto[REFILL_RUNTIME_FLAG]) return;
  proto[REFILL_RUNTIME_FLAG] = true;

  const originalGrantAllCollectibleCards = proto.grantAllCollectibleCards;
  proto.grantAllCollectibleCards = function grantAllCollectibleCardsAuthoritatively20260907(...args) {
    if (!authStore?.isLoggedIn?.()) {
      return originalGrantAllCollectibleCards.apply(this, args);
    }

    if (this._cardRefillPending || this._cardActionPending) {
      return { ok: false, error: '卡牌正在保存，请稍后再补卡' };
    }
    // Login can precede inventory hydration. Missing persistence binding must
    // not turn an authenticated grant into a local-only (non-owned) card.
    if (!this._remoteCardInventorySave) {
      this.bindRemotePersistence?.(payload => authStore.api.put('/player/card-inventory', payload));
    }
    // Only show cards actually granted by the server. Optimistic local grants
    // could be selected for an upgrade before they existed in the database.
    const completion = queueAuthoritativeRefill(this);
    return { ok: true, added: 0, total: this.getUsedCount(), pending: true, completion };
  };
}

export function installDeckInventoryAuthorityFix20260907() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  installDeckServerPersistence();
  installCollectibleRefillAuthority();
}
