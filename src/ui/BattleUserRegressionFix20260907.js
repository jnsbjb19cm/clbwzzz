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
import {
  preferredRoomDeckGroup20260911,
  readRememberedDeckGroup20260911,
  rememberDeckGroup20260911,
  roomDeckGroup20260912,
} from './DeckGroupPreference20260911.js';

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
  // 2026-09-11：没有显式指定时，优先用玩家上次选的卡组（原来固定回落 default，
  // 等于把"战团2/3"的选择每次进战斗都抹掉）。
  return normalizeDeckGroup20260906(
    cardInventory?.__activeDeckGroup20260907
      ?? readRememberedDeckGroup20260911()
      ?? 'default',
  );
}

function fallbackDeckForGroup(cardInventory, db, group) {
  return groupForInventory(cardInventory, group) === 'default'
    ? DeckSelectView.defaultDeckSlots(cardInventory, db)
    : [];
}

function readDeckGroup(cardInventory, db, group) {
  if (!cardInventory) return null;
  const normalized = groupForInventory(cardInventory, group);
  try {
    const raw = localStorage.getItem(storageKeyForDeckGroup20260906(normalized));
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return [];
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
    if (grouped !== null) return grouped;
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
    // 2026-09-12：环境标记也必须按"房间成员选的 → 否则玩家记住的"来写。
    // 之前是 `me?.selectedDeckNo ?? 0` —— 成员还没选时会被写成 default，
    // 于是战团3 的玩家一进房间就被"重定向"成默认/别的战团（用户报告）。
    const group = roomDeckGroup20260912(this);
    if (this.cardInventory) this.cardInventory.__activeDeckGroup20260907 = group;
    globalThis.__clbwzDeckRoomView20260907 = this;
    let result;
    try {
      result = originalRenderRoomInside.apply(this, args);
    } finally {
      if (globalThis.__clbwzDeckRoomView20260907 === this) {
        delete globalThis.__clbwzDeckRoomView20260907;
      }
    }
    // 2026-09-12：把房间和"切换战团"的连接留给卡组视图。
    // 之前渲染完就断了（roomState 里没有 onSetDeck），于是玩家点了战团/保存战团，
    // 房间成员的 selectedDeckNo 还是旧的 → 下一次房间刷新把页签拉回旧战团。
    const deckView = this.deckSelect;
    if (deckView) {
      deckView.__roomOwner20260912 = this;
      const roomState = deckView._roomState;
      if (roomState && typeof roomState.onSetDeck !== 'function' && this.socket?.setDeck) {
        deckView._roomState = {
          ...roomState,
          onSetDeck: (deckNo) => this.socket.setDeck(deckNo),
        };
      }
    }
    return result;
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
      // 成员有选择就用它，否则沿用传入值/记住的战团（不再无条件落到 0=默认）
      if (me?.selectedDeckNo != null) {
        roomState.selectedDeckNo = me.selectedDeckNo;
      } else if (roomState.selectedDeckNo == null) {
        roomState.selectedDeckNo = deckGroupToNumber20260906(roomDeckGroup20260912({ _roomState: roomState, cardInventory: options.cardInventory }));
      }
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
      // 2026-09-12：**只有房间成员还没有任何选择时**，才用"玩家上次保存的战团"兜底。
      // 之前这里是无条件覆盖 + setDeck，于是玩家在房间里选了/正在编辑战团1，
      // 也会被上次记住的战团（比如战团2）顶掉 —— 界面跳组、保存写错组就是这么来的。
      // 房间成员自己的选择才是"房间这场战斗要用哪套卡"，界面必须跟它保持一致。
      // 把这次渲染用的 roomState 挂到 view 上：页签点击/保存时的 onSetDeck 同步要用它
      // （RoomView 构造 DeckSelectView 时也会传，但先渲染后构造的路径只有这里有）。
      this._roomState = roomState;
      const memberHasDeck = me?.selectedDeckNo != null;
      if (!memberHasDeck) {
        const preference = preferredRoomDeckGroup20260911(roomState.selectedDeckNo);
        if (preference.group) {
          roomState.selectedDeckNo = preference.number;
          if (preference.needsSync && roomOwner?.socket?.setDeck) {
            Promise.resolve(roomOwner.socket.setDeck(preference.number))
              .then((room) => { if (room) roomOwner.refreshRoom?.(room); })
              .catch(() => { /* 同步失败不阻塞渲染，下次进房会再试 */ });
          }
        }
      }
    }

    const group = roomState
      ? resolveRoomDeckGroup(roomState)
      : groupForInventory(options.cardInventory, this._deckTab ?? 'default');
    this._deckTab = group;
    if (options.cardInventory) options.cardInventory.__activeDeckGroup20260907 = group;

    const saved = DeckSelectView.loadSavedDeck(options.cardInventory, options.db, group);
    const fallback = fallbackDeckForGroup(options.cardInventory, options.db, group);
    const hasExplicitSavedDeck = saved !== null;
    const selectedForGroup = hasExplicitSavedDeck
      ? saved
      : (roomState
          ? fallback
          : (group === 'default' ? (options.deckSlots ?? fallback) : fallback));
    const preserveExplicitEmptyDeck = Array.isArray(selectedForGroup)
      && selectedForGroup.length === 0
      && (group !== 'default' || hasExplicitSavedDeck);

    const result = originalDeckRender.call(this, root, {
      ...options,
      roomState,
      deckSlots: selectedForGroup,
    });

    // 旧 DeckSelectView 会把任何空数组自动替换成 STARTER_DECK。
    // team1/2/3 天生允许“未配置=空”；default 只有在用户明确保存 [] 后才保持为空。
    // 因此首次进入的新账号仍能得到默认初始卡，而已经清空并保存的默认组不会复活旧卡槽。
    if (preserveExplicitEmptyDeck && this._selected.length) {
      this._selected = [];
      this._activeSwapSlot = null;
      this._renderDeckSlots(root);
      this._renderDrawer(root);
    }
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

      // 2026-09-12 兜底：如果这一组在存储里本来有牌、而当前 _selected 是空（说明界面还没把
      // 这组载进来），就不许把"空草稿"写回去 —— 那会把玩家的卡组清空。
      const outgoing = [...(this._selected ?? [])];
      const storedForGroup = outgoing.length
        ? null
        : DeckSelectView.loadSavedDeck(this._cardInventory, this._db, previousGroup);
      if (!outgoing.length && Array.isArray(storedForGroup) && storedForGroup.length) {
        console.warn(`[deck] 跳过空草稿覆盖 ${previousGroup}（存储里有 ${storedForGroup.length} 张）`);
      } else {
        DeckSelectView.saveDeck(this._selected, this._cardInventory, previousGroup);
      }
      this._deckTab = nextGroup;
      // 2026-09-12：记住"玩家亲手点过的战团"，后续房间渲染不许再把他拖走
      this.__deckTabPicked20260912 = nextGroup;
      // 记住玩家选的卡组：离开房间/刷新后仍要生效（服务端只记房间成员，会丢）。
      rememberDeckGroup20260911(nextGroup);
      if (this._cardInventory) this._cardInventory.__activeDeckGroup20260907 = nextGroup;
      this._selected = DeckSelectView.loadSavedDeck(this._cardInventory, this._db, nextGroup)
        ?? fallbackDeckForGroup(this._cardInventory, this._db, nextGroup);
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
        ?? fallbackDeckForGroup(this.cardInventory, this.db, group);
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
