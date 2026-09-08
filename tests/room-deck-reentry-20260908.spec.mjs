import { test, expect } from '@playwright/test';

test('default/team1/team2/team3 stay isolated and selected room deck reaches battle', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const [cardModule, inventoryModule, deckModule, groupModule, battlePatch, roomPatch, runtimePatch, battleViewModule] = await Promise.all([
      import('/src/core/CardDatabase.js'),
      import('/src/core/CardInventoryStore.js'),
      import('/src/ui/DeckSelectView.js'),
      import('/src/ui/DeckGroupSelection20260906.js'),
      import('/src/ui/BattleUserRegressionFix20260907.js'),
      import('/src/ui/RoomDeckRefreshRegressionFix20260907.js'),
      import('/src/ui/RoomBattleDeckRuntimeFix20260908.js'),
      import('/src/ui/BattleView.js'),
    ]);
    battlePatch.installBattleUserRegressionFix20260907();
    roomPatch.installRoomDeckRefreshRegressionFix20260907();
    runtimePatch.installRoomBattleDeckRuntimeFix20260908();

    const db = new cardModule.CardDatabase();
    const inventory = new inventoryModule.CardInventoryStore(db);
    if (inventory.getUsedCount() < 8) inventory.grantAllCollectibleCards();
    const usable = inventory.getSlots()
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot && db.getById(slot.cardId)?.battleUsable !== false)
      .slice(0, 8)
      .map(({ index }) => index);
    if (usable.length < 8) throw new Error('fixture requires at least 8 usable card slots');

    const groups = {
      default: [usable[0]],
      team1: [usable[1], usable[2]],
      team2: [usable[3], usable[4]],
      team3: [usable[5], usable[6], usable[7]],
    };
    for (const [group, selected] of Object.entries(groups)) {
      deckModule.DeckSelectView.saveDeck(selected, inventory, group);
    }

    const roomState = (selectedDeckNo) => ({
      roomId: 8008,
      myUserId: 1,
      stageName: '回归房间',
      members: [{ userId: 1, nickname: '测试玩家', team: 'blue', isHost: true, ready: false, selectedDeckNo }],
      selectedDeckNo,
      onReady: () => {},
      onSetDeck: () => Promise.resolve(null),
      onSetRule: () => Promise.resolve(null),
      onRandomMatch: () => Promise.resolve(null),
      onChangeMap: () => Promise.resolve(null),
      onSwitch: () => Promise.resolve(null),
      onStart: () => {},
    });

    const renderReentry = (deckNo) => {
      document.body.innerHTML = '<div id="deck-root"></div>';
      const root = document.querySelector('#deck-root');
      const view = new deckModule.DeckSelectView();
      view.render(root, {
        db,
        cardInventory: inventory,
        mode: 'pvp',
        isOwner: true,
        roomState: roomState(deckNo),
      });
      return {
        group: view._deckTab,
        selected: [...view._selected],
        active: root.querySelector('.deck-tab.active')?.dataset.tab ?? null,
        enemySlotCount: root.querySelectorAll('#room-right-side .enemy-slot').length,
        enemyWaitingCount: root.querySelectorAll('#room-right-side .enemy-slot.question-mark').length,
        badEnemyAvatar: Boolean(root.querySelector('#room-right-side img[src*="NaN"]')),
      };
    };

    const reentries = {
      defaultReentry: renderReentry(groupModule.deckGroupToNumber20260906('default')),
      team1Reentry: renderReentry(groupModule.deckGroupToNumber20260906('team1')),
      team2Reentry: renderReentry(groupModule.deckGroupToNumber20260906('team2')),
      team3Reentry: renderReentry(groupModule.deckGroupToNumber20260906('team3')),
    };

    // Direct runtime seam: room handoff must beat BattleView's legacy default-deck
    // reload in its PVP branch. spectator=true avoids creating a live socket.
    document.body.innerHTML = '<div id="battle-root"></div>';
    inventory.__activeDeckGroup20260907 = 'team3';
    inventory.__roomBattleDeckSelection20260908 = { group: 'team3', slots: [...groups.team3] };
    const battleView = new battleViewModule.BattleView(db, {
      cardInventory: inventory,
      heroSkills: null,
      pvp: { roomId: 8008, spectator: true },
    });
    battleView.render(document.querySelector('#battle-root'));
    const battleDeckSlots = [...battleView.deckSlots];
    const engineBagIndices = battleView.engine?.deck?.map((entry) => entry.bagIndex) ?? [];
    battleView.stopLoop?.();

    return {
      expected: groups,
      ...reentries,
      stored: Object.fromEntries(Object.keys(groups).map((group) => [
        group,
        deckModule.DeckSelectView.loadSavedDeck(inventory, db, group),
      ])),
      battleDeckSlots,
      engineBagIndices,
    };
  });

  expect(result.defaultReentry.group).toBe('default');
  expect(result.defaultReentry.active).toBe('default');
  expect(result.defaultReentry.selected).toEqual(result.expected.default);
  expect(result.team1Reentry.group).toBe('team1');
  expect(result.team1Reentry.selected).toEqual(result.expected.team1);
  expect(result.team2Reentry.group).toBe('team2');
  expect(result.team2Reentry.selected).toEqual(result.expected.team2);
  expect(result.team3Reentry.group).toBe('team3');
  expect(result.team3Reentry.active).toBe('team3');
  expect(result.team3Reentry.selected).toEqual(result.expected.team3);
  expect(result.stored).toEqual(result.expected);

  for (const reentry of [result.defaultReentry, result.team1Reentry, result.team2Reentry, result.team3Reentry]) {
    expect(reentry.enemySlotCount).toBe(3);
    expect(reentry.enemyWaitingCount).toBe(3);
    expect(reentry.badEnemyAvatar).toBe(false);
  }

  expect(result.battleDeckSlots).toEqual(result.expected.team3);
  expect(result.engineBagIndices).toEqual(result.expected.team3);
});