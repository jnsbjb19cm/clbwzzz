const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomDeckResetV4');

function cloneDeckMap(source = {}) {
  return Object.fromEntries(
    ['default', 'team1', 'team2', 'team3'].map((tab) => [
      tab,
      Array.isArray(source?.[tab]) ? [...source[tab]] : [],
    ]),
  );
}

function resetCurrentDeck(view, root) {
  const tab = view?._deckTab ?? 'default';
  view._selected = [];
  view._v3Decks ??= cloneDeckMap();
  view._v3Decks[tab] = [];
  view._activeSwapSlot = null;
  view._v3Page = 0;
  view._renderDeckSlots?.(root);
  view._renderDrawer?.(root);
  root.querySelectorAll('.deck-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  view._showToast?.(root, '当前战团已重置为空，点击“确定”后保存');
}

export function installBattleRoomDeckResetV4() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  /*
   * V3 控制器在 room capture 阶段处理按钮；重置必须在 document capture
   * 更早截获，避免旧的“恢复 committed”语义再次覆盖清空结果。
   */
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest?.('[data-v3-action="reset"]');
    if (!button) return;
    const room = button.closest('.game-room.room-deck-ui-v3');
    const view = room?.__deckUiV3View;
    if (!room || !view) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    resetCurrentDeck(view, room.closest('.deck-select-page') ?? document);
  }, true);

  window.__verifyBattleRoomDeckResetV4 = () => {
    const room = document.querySelector('.game-room.room-deck-ui-v3');
    const view = room?.__deckUiV3View;
    return {
      enabled: Boolean(room && view),
      activeTab: view?._deckTab ?? null,
      selectedCount: Array.isArray(view?._selected) ? view._selected.length : null,
      draftCount: Array.isArray(view?._v3Decks?.[view?._deckTab])
        ? view._v3Decks[view._deckTab].length
        : null,
    };
  };
}
