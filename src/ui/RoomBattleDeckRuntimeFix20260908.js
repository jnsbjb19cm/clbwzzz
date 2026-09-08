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

export function installRoomBattleDeckRuntimeFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

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

  const originalRender = BattleView.prototype.render;
  if (!originalRender?.__roomBattleDeckRuntimeFix20260908) {
    function renderWithExactRoomDeck20260908(root) {
      const inventory = this.cardInventory;
      const handoff = inventory?.__roomBattleDeckSelection20260908;
      if (!handoff || !Array.isArray(handoff.slots) || !handoff.slots.length) {
        return originalRender.call(this, root);
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
        return originalRender.call(this, root);
      } finally {
        DeckSelectView.loadSavedDeck = previousLoadSavedDeck;
        delete inventory.__roomBattleDeckSelection20260908;
      }
    }
    renderWithExactRoomDeck20260908.__roomBattleDeckRuntimeFix20260908 = true;
    BattleView.prototype.render = renderWithExactRoomDeck20260908;
  }
}