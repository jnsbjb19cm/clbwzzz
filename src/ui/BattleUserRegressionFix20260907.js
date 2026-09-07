import { BattleRenderer } from '../battle/BattleRenderer.js';
import { resolveLootAtlasSprite20260906 } from '../battle/BattleLootIconResolver20260906.js';
import itemAtlasData from '../data/atlas/preload_items.json' with { type: 'json' };
import itemData from '../data/item.json' with { type: 'json' };
import { BattleView } from './BattleView.js';
import { DeckSelectView } from './DeckSelectView.js';
import { RoomView } from './RoomView.js';
import {
  deckGroupToNumber20260906,
  deckNumberToGroup20260906,
  normalizeDeckGroup20260906,
  storageKeyForDeckGroup20260906,
} from './DeckGroupSelection20260906.js';

let installed = false;
let preloadPromise = null;
let preloadImage = null;

function fingerprintDeckSlot(index, slot) {
  if (!slot) return null;
  return {
    index,
    cardId: slot.cardId,
    craftQuality: slot.craftQuality ?? 1,
    strengthLv: slot.strengthLv ?? 0,
  };
}

function groupForInventory(cardInventory, requestedGroup) {
  if (requestedGroup != null) return normalizeDeckGroup20260906(requestedGroup);
  return normalizeDeckGroup20260906(cardInventory?.__activeDeckGroup20260907 ?? 'default');
}

function readDeckGroup(cardInventory, db, group) {
  if (!cardInventory) return null;
  const normalized = groupForInventory(cardInventory, group);
  try {
    const raw = localStorage.getItem(storageKeyForDeckGroup20260906(normalized));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const reconciled = DeckSelectView.reconcileFingerprints(parsed, cardInventory);
        if (reconciled.length) return reconciled;
      }
    }
  } catch {}
  return null;
}

function writeDeckGroup(selected, cardInventory, group) {
  if (!cardInventory || typeof localStorage === 'undefined') return;
  const normalized = groupForInventory(cardInventory, group);
  const slots = cardInventory.getSlots?.() ?? [];
  const payload = (selected ?? [])
    .map((index) => fingerprintDeckSlot(index, slots[index]))
    .filter(Boolean);
  try {
    localStorage.setItem(storageKeyForDeckGroup20260906(normalized), JSON.stringify(payload));
    if (normalized === 'default') localStorage.removeItem('battle_deck_ids');
  } catch {}
}

function resolveRoomDeckGroup(roomState) {
  const me = (roomState?.members ?? []).find(
    (member) => String(member?.userId) === String(roomState?.myUserId),
  );
  return deckNumberToGroup20260906(me?.selectedDeckNo ?? roomState?.selectedDeckNo ?? 0);
}

function syncDeckTabs(root, group) {
  root?.querySelectorAll?.('.deck-tab')?.forEach?.((button) => {
    button.classList.toggle('active', button.dataset.tab === group);
  });
}

function installDeckGroupRuntime() {
  if (DeckSelectView.__deckGroups20260907) return;
  DeckSelectView.__deckGroups20260907 = true;

  const originalLoadSavedDeck = DeckSelectView.loadSavedDeck.bind(DeckSelectView);
  const originalSaveDeck = DeckSelectView.saveDeck.bind(DeckSelectView);

  DeckSelectView.loadSavedDeck = function loadSavedDeckByGroup(cardInventory, db, group) {
    const normalized = groupForInventory(cardInventory, group);
    const grouped = readDeckGroup(cardInventory, db, normalized);
    if (grouped?.length) return grouped;
    if (normalized === 'default') return originalLoadSavedDeck(cardInventory, db);
    return null;
  };

  DeckSelectView.saveDeck = function saveDeckByGroup(selected, cardInventory, group) {
    const normalized = groupForInventory(cardInventory, group);
    if (normalized === 'default') {
      originalSaveDeck(selected, cardInventory);
      return;
    }
    writeDeckGroup(selected, cardInventory, normalized);
  };

  const originalRenderRoomInside = RoomView.prototype.renderRoomInside;
  RoomView.prototype.renderRoomInside = function renderRoomWithDeckAuthority(...args) {
    const members = this.room?.members ?? [];
    const meId = this.currentUserId?.();
    const me = members.find((member) => String(member?.userId) === String(meId));
    const group = deckNumberToGroup20260906(me?.selectedDeckNo ?? 0);
    if (this.cardInventory) this.cardInventory.__activeDeckGroup20260907 = group;
    globalThis.__clbwzDeckRoomView20260907 = this;
    try {
      return originalRenderRoomInside.apply(this, args);
    } finally {
      if (globalThis.__clbwzDeckRoomView20260907 === this) {
        delete globalThis.__clbwzDeckRoomView20260907;
      }
    }
  };

  const originalDeckRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderDeckGroups(root, options = {}) {
    const roomOwner = globalThis.__clbwzDeckRoomView20260907 ?? null;
    const roomState = options.roomState
      ? { ...options.roomState }
      : null;

    if (roomState) {
      const me = (roomState.members ?? []).find(
        (member) => String(member?.userId) === String(roomState.myUserId),
      );
      roomState.selectedDeckNo = me?.selectedDeckNo ?? roomState.selectedDeckNo ?? 0;
      if (!roomState.onSetDeck && roomOwner?.socket?.setDeck) {
        roomState.onSetDeck = (deckNo) => roomOwner.socket.setDeck(deckNo)
          .then((room) => {
            if (room) roomOwner.refreshRoom?.(room);
            return room;
          })
          .catch((error) => {
            roomOwner.notice?.(error?.message ?? String(error));
            throw error;
          });
      }
    }

    const group = roomState
      ? resolveRoomDeckGroup(roomState)
      : groupForInventory(options.cardInventory, this._deckTab ?? 'default');
    this._deckTab = group;
    if (options.cardInventory) options.cardInventory.__activeDeckGroup20260907 = group;

    const saved = DeckSelectView.loadSavedDeck(options.cardInventory, options.db, group);
    const selectedForGroup = roomState
      ? (saved ?? DeckSelectView.defaultDeckSlots(options.cardInventory, options.db))
      : (options.deckSlots ?? saved ?? DeckSelectView.defaultDeckSlots(options.cardInventory, options.db));

    const result = originalDeckRender.call(this, root, {
      ...options,
      roomState,
      deckSlots: selectedForGroup,
    });
    syncDeckTabs(root, group);

    if (this.__deckGroupCaptureRoot && this.__deckGroupCaptureHandler) {
      this.__deckGroupCaptureRoot.removeEventListener('click', this.__deckGroupCaptureHandler, true);
    }
    const captureHandler = (event) => {
      const button = event.target?.closest?.('.deck-tab');
      if (!button || !root?.contains?.(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const nextGroup = normalizeDeckGroup20260906(button.dataset.tab);
      const previousGroup = groupForInventory(this._cardInventory, this._deckTab);
      if (nextGroup === previousGroup) {
        syncDeckTabs(root, nextGroup);
        return;
      }

      DeckSelectView.saveDeck(this._selected, this._cardInventory, previousGroup);
      this._deckTab = nextGroup;
      if (this._cardInventory) this._cardInventory.__activeDeckGroup20260907 = nextGroup;
      this._selected = DeckSelectView.loadSavedDeck(this._cardInventory, this._db, nextGroup)
        ?? DeckSelectView.defaultDeckSlots(this._cardInventory, this._db);
      this._activeSwapSlot = null;
      this._renderDeckSlots(root);
      this._renderDrawer(root);
      syncDeckTabs(root, nextGroup);

      const deckNo = deckGroupToNumber20260906(nextGroup);
      const request = this._roomState?.onSetDeck?.(deckNo);
      if (request?.catch) request.catch(() => {});
    };
    root?.addEventListener?.('click', captureHandler, true);
    this.__deckGroupCaptureRoot = root;
    this.__deckGroupCaptureHandler = captureHandler;
    return result;
  };

  const originalRenderDrawer = DeckSelectView.prototype._renderDrawer;
  DeckSelectView.prototype._renderDrawer = function renderDrawerWithDeckPersistence(root) {
    const result = originalRenderDrawer.call(this, root);
    const drawer = root?.querySelector?.('#drawer-cards');
    if (drawer && !drawer.__deckGroupPersistence20260907) {
      drawer.__deckGroupPersistence20260907 = true;
      drawer.addEventListener('click', (event) => {
        if (!event.target?.closest?.('.drawer-card')) return;
        queueMicrotask(() => {
          DeckSelectView.saveDeck(this._selected, this._cardInventory, this._deckTab);
        });
      });
    }
    return result;
  };

  const originalBattleRender = BattleView.prototype.render;
  BattleView.prototype.render = function renderBattleWithSelectedDeck(root) {
    if (this.pvp && !this.pvp.spectator && this.cardInventory) {
      let selectedDeckNo = this.pvp.selectedDeckNo;
      if (selectedDeckNo == null) {
        const room = this.pvp.room;
        const roomView = globalThis.__clbwzDeckRoomView20260907;
        const meId = roomView?.currentUserId?.();
        const member = (room?.members ?? []).find(
          (entry) => String(entry?.userId) === String(meId),
        );
        selectedDeckNo = member?.selectedDeckNo;
      }
      const group = selectedDeckNo == null
        ? groupForInventory(this.cardInventory)
        : deckNumberToGroup20260906(selectedDeckNo);
      this.cardInventory.__activeDeckGroup20260907 = group;
      this.deckSlots = DeckSelectView.loadSavedDeck(this.cardInventory, this.db, group)
        ?? DeckSelectView.defaultDeckSlots(this.cardInventory, this.db);
    }
    return originalBattleRender.call(this, root);
  };
}

function beginLootAtlasPreload() {
  if (preloadPromise || typeof Image === 'undefined') return preloadPromise;
  const imageName = String(itemAtlasData?.image || 'items.png').replace(/^\/+/, '');
  preloadPromise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      preloadImage = image;
      resolve(image);
    };
    image.onerror = () => {
      // A transient browser/cache failure must not pin every later battle drop to the
      // yellow fallback marker. Clear the shared promise so the next request can retry.
      preloadImage = null;
      preloadPromise = null;
      resolve(null);
    };
    image.src = `/${imageName}?v=loot-icons-20260907b`;
  });
  return preloadPromise;
}

function installLootIconRuntime() {
  if (BattleRenderer.prototype.__lootIcons20260907) return;
  BattleRenderer.prototype.__lootIcons20260907 = true;
  void beginLootAtlasPreload();

  const originalRequestItemAtlas = BattleRenderer.prototype.requestItemAtlas;
  BattleRenderer.prototype.requestItemAtlas = function requestPreloadedItemAtlas() {
    if (this.itemAtlasImage) return Promise.resolve(this.itemAtlasImage);
    if (preloadImage) {
      this.itemAtlasImage = preloadImage;
      return Promise.resolve(preloadImage);
    }
    const pending = beginLootAtlasPreload();
    if (!pending) return originalRequestItemAtlas.call(this);
    if (!this.itemAtlasLoading) {
      this.itemAtlasLoading = pending.then((image) => {
        this.itemAtlasLoading = null;
        if (image) {
          this.itemAtlasImage = image;
          return image;
        }
        // The shared preload failed. Fall back to BattleRenderer's ordinary loader now,
        // while allowing later calls to start a fresh shared preload attempt as well.
        return originalRequestItemAtlas.call(this);
      });
    }
    return this.itemAtlasLoading;
  };

  const originalDrawLootDrops = BattleRenderer.prototype.drawLootDrops;
  BattleRenderer.prototype.drawLootDrops = function drawResolvedLootIcons(ctx, engine) {
    if (!this.itemAtlasImage) void this.requestItemAtlas();
    const drops = engine?.lootDrops ?? [];
    const originals = [];
    for (const drop of drops) {
      const resolved = resolveLootAtlasSprite20260906(drop?.itemId, itemData);
      originals.push([drop, drop?.itemId]);
      if (drop && resolved != null) drop.itemId = resolved;
    }
    try {
      return originalDrawLootDrops.call(this, ctx, engine);
    } finally {
      for (const [drop, itemId] of originals) {
        if (drop) drop.itemId = itemId;
      }
    }
  };
}

export function installBattleUserRegressionFix20260907() {
  if (installed) return;
  installed = true;
  installDeckGroupRuntime();
  installLootIconRuntime();
}
