import { BattleView } from './BattleView.js';
import { DeckSelectView } from './DeckSelectView.js';
import { RoomView } from './RoomView.js';
import { normalizeDeckGroup20260906 } from './DeckGroupSelection20260906.js';

const INSTALL_FLAG = Symbol.for('clbwz.roomBattleDeckRuntimeFix20260908');

function copySelection(value) {
  return Array.isArray(value)
    ? value.map(Number).filter((index) => Number.isInteger(index) && index >= 0)
    : [];
}

function activeRoomDeck(view) {
  const cardInventory = view?.cardInventory;
  const deckView = view?.deckSelect;
  const group = normalizeDeckGroup20260906(
    deckView?._deckTab ?? cardInventory?.__activeDeckGroup20260907 ?? 'default',
  );
  const slots = copySelection(deckView?._selected);
  return { group, slots };
}

function realEnemyPlayers(roomState) {
  return (roomState?.members ?? [])
    .filter((member) => member?.team === 'red')
    .map((member, index) => ({
      id: Number(member.userId) || 200 + index,
      name: member.nickname || '玩家',
      lv: Number(member.level) || 1,
      ready: Boolean(member.ready),
    }));
}

export function installRoomBattleDeckRuntimeFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  // The legacy DeckSelectView inserts a fake "等待加入" enemy whenever a PVP
  // room has no red members. In a real room that turns the top question card
  // into a pseudo player, leaving only two physical waiting cards. Replace the
  // fake entry with the actual red-team list after every room render.
  const originalDeckRender = DeckSelectView.prototype.render;
  if (!originalDeckRender?.__roomBattleDeckRuntimeFix20260908) {
    function renderRoomWaitingSlots20260908(root, options = {}) {
      const result = originalDeckRender.call(this, root, options);
      if (options.roomState && options.mode === 'pvp') {
        this._enemyPlayers = realEnemyPlayers(options.roomState);
        this._renderEnemy?.(root);
      }
      return result;
    }
    renderRoomWaitingSlots20260908.__roomBattleDeckRuntimeFix20260908 = true;
    DeckSelectView.prototype.render = renderRoomWaitingSlots20260908;
  }

  const originalEnterBattle = RoomView.prototype.enterBattle;
  if (!originalEnterBattle?.__roomBattleDeckRuntimeFix20260908) {
    function enterBattleWithExactRoomDeck20260908(...args) {
      const handoff = activeRoomDeck(this);
      if (this.cardInventory && handoff.slots.length) {
        this.cardInventory.__activeDeckGroup20260907 = handoff.group;
        this.cardInventory.__roomBattleDeckSelection20260908 = handoff;
      }
      return originalEnterBattle.apply(this, args);
    }
    enterBattleWithExactRoomDeck20260908.__roomBattleDeckRuntimeFix20260908 = true;
    RoomView.prototype.enterBattle = enterBattleWithExactRoomDeck20260908;
  }

  const originalBattleRender = BattleView.prototype.render;
  if (!originalBattleRender?.__roomBattleDeckRuntimeFix20260908) {
    function renderWithExactRoomDeck20260908(root) {
      const inventory = this.cardInventory;
      const handoff = inventory?.__roomBattleDeckSelection20260908;
      if (!handoff || !Array.isArray(handoff.slots) || !handoff.slots.length) {
        return originalBattleRender.call(this, root);
      }

      const slots = copySelection(handoff.slots);
      inventory.__activeDeckGroup20260907 = normalizeDeckGroup20260906(handoff.group);
      this.deckSlots = slots;

      // BattleView's legacy PVP/BOSS branches reload DeckSelectView.loadSavedDeck()
      // during render, which used to throw away the exact deck the player saw in
      // the room and silently return the default deck. For this one render only,
      // return the room handoff for the same inventory, then restore the loader.
      const previousLoadSavedDeck = DeckSelectView.loadSavedDeck;
      DeckSelectView.loadSavedDeck = function loadExactRoomDeck20260908(cardInventory, db, group) {
        if (cardInventory === inventory) return [...slots];
        return previousLoadSavedDeck.call(this, cardInventory, db, group);
      };
      try {
        return originalBattleRender.call(this, root);
      } finally {
        DeckSelectView.loadSavedDeck = previousLoadSavedDeck;
        delete inventory.__roomBattleDeckSelection20260908;
      }
    }
    renderWithExactRoomDeck20260908.__roomBattleDeckRuntimeFix20260908 = true;
    BattleView.prototype.render = renderWithExactRoomDeck20260908;
  }
}