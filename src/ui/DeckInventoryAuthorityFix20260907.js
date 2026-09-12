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

function queueDeckSave(deckNo, cardIds) {
  if (!authStore?.isLoggedIn?.() || deckNo < 0 || deckNo > 3) return Promise.resolve();
  const key = deckCacheKey(deckNo);
  const requestedIds = [...cardIds];
  const signature = requestedIds.join(',');
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
        const result = await authStore.api.put(`/player/decks/${deckNo}`, { cards: requestedIds });
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
    return queueDeckSave(deckNo, cardIds);
  };

  // Room start/ready must not race the asynchronous PUT /player/decks/:deckNo.
  // Waiting for this queue guarantees the server starts with the exact group
  // that the player sees in the room instead of a stale/default deck snapshot.
  DeckSelectView.awaitDeckSave20260908 = function awaitDeckSave20260908(group) {
    return pendingDeckSave(group);
  };
}

function queueAuthoritativeRefill(store) {
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
    });
}

function installCollectibleRefillAuthority() {
  const proto = CardInventoryStore.prototype;
  if (proto[REFILL_RUNTIME_FLAG]) return;
  proto[REFILL_RUNTIME_FLAG] = true;

  const originalGrantAllCollectibleCards = proto.grantAllCollectibleCards;
  proto.grantAllCollectibleCards = function grantAllCollectibleCardsAuthoritatively20260907(...args) {
    if (!authStore?.isLoggedIn?.() || !this._remoteCardInventorySave) {
      return originalGrantAllCollectibleCards.apply(this, args);
    }

    // 原实现会每补一张卡都调用 save()。临时关闭普通远程保存，避免把合法补卡
    // 误发成受保护的 PUT /card-inventory，从而连续触发 409。
    const remoteSave = this._remoteCardInventorySave;
    this._remoteCardInventorySave = null;
    let result;
    try {
      result = originalGrantAllCollectibleCards.apply(this, args);
    } finally {
      this._remoteCardInventorySave = remoteSave;
    }
    queueAuthoritativeRefill(this);
    return { ...result, pending: true };
  };
}

export function installDeckInventoryAuthorityFix20260907() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  installDeckServerPersistence();
  installCollectibleRefillAuthority();
}
