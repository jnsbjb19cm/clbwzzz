import assert from 'node:assert/strict';
import fs from 'node:fs';

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error?.stack || error}`);
    console.error(`FAIL ${name}: ${error?.message || error}`);
  }
}

await check('loot item ids resolve to real atlas sprites and preload before battle', async () => {
  const itemData = JSON.parse(fs.readFileSync(new URL('../src/data/item.json', import.meta.url), 'utf8'));
  const atlasData = JSON.parse(fs.readFileSync(new URL('../src/data/atlas/preload_items.json', import.meta.url), 'utf8'));
  const { resolveLootAtlasSprite20260906 } = await import('../src/battle/BattleLootIconResolver20260906.js');
  const strengthen = itemData.find((item) => Number(item.item_id) === 10001);
  assert.ok(strengthen, 'battle strengthen drop item 10001 must exist in item database');
  const sprite = resolveLootAtlasSprite20260906(10001, itemData);
  assert.ok(Number(sprite) > 0, 'business item id 10001 must resolve to a positive atlas sprite id');
  const spriteNames = new Set((atlasData?.sprites ?? atlasData ?? []).map((entry) => String(entry?.name ?? entry?.sprite?.name ?? '')));
  assert.ok(spriteNames.has(String(sprite)), `resolved item sprite ${sprite} must exist in preload_items atlas`);

  const runtimeSource = fs.readFileSync(new URL('../src/ui/BattleUserRegressionFix20260907.js', import.meta.url), 'utf8');
  const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
  assert.match(runtimeSource, /resolveLootAtlasSprite20260906/, 'loot renderer runtime must resolve business ids through the item atlas resolver');
  assert.match(runtimeSource, /beginLootAtlasPreload/, 'loot atlas must begin preloading before a drop needs to render');
  assert.match(runtimeSource, /requestItemAtlas/, 'renderer item atlas request must reuse the preloaded atlas');
  assert.match(bootstrapSource, /installBattleUserRegressionFix20260907/, 'loot/deck runtime repair must be installed from bootstrap');
});

await check('room deck group switch is authoritative and battle uses the selected group', async () => {
  const group = await import('../src/ui/DeckGroupSelection20260906.js');
  assert.equal(group.normalizeDeckGroup20260906('default'), 'default');
  assert.equal(group.normalizeDeckGroup20260906('team1'), 'team1');
  assert.equal(group.normalizeDeckGroup20260906('team2'), 'team2');
  assert.equal(group.normalizeDeckGroup20260906('team3'), 'team3');
  assert.equal(group.deckGroupToNumber20260906('default'), 0);
  assert.equal(group.deckGroupToNumber20260906('team1'), 1);
  assert.equal(group.deckGroupToNumber20260906('team2'), 2);
  assert.equal(group.deckGroupToNumber20260906('team3'), 3);
  assert.equal(group.deckNumberToGroup20260906(0), 'default');
  assert.equal(group.deckNumberToGroup20260906(3), 'team3');
  assert.notEqual(group.storageKeyForDeckGroup20260906('default'), group.storageKeyForDeckGroup20260906('team1'));
  assert.notEqual(group.storageKeyForDeckGroup20260906('team1'), group.storageKeyForDeckGroup20260906('team2'));

  const { RoomManager } = await import('../server/rooms/RoomManager.js');
  const { installRoomDeckSelection20260907 } = await import('../server/rooms/RoomDeckSelection20260907.js');
  installRoomDeckSelection20260907();
  const manager = new RoomManager();
  let room = manager.createRoom({ user: { id: 7001, nickname: 'deck-test' }, mode: 'pvp' });
  let me = room.members.find((member) => Number(member.userId) === 7001);
  assert.equal(me?.selectedDeckNo, 0, 'new room member must start on authoritative default deck 0');
  room = manager.setDeck(7001, 3);
  me = room.members.find((member) => Number(member.userId) === 7001);
  assert.equal(me?.selectedDeckNo, 3, 'room:set-deck must retain team3 instead of falling back to a prior group');
  room = manager.setDeck(7001, 0);
  me = room.members.find((member) => Number(member.userId) === 7001);
  assert.equal(me?.selectedDeckNo, 0, 'room:set-deck must allow returning to default deck 0');

  const runtimeSource = fs.readFileSync(new URL('../src/ui/BattleUserRegressionFix20260907.js', import.meta.url), 'utf8');
  const serverSource = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(runtimeSource, /storageKeyForDeckGroup20260906/, 'each deck group must use independent saved card slots');
  assert.match(runtimeSource, /onSetDeck/, 'deck tab switch must notify authoritative room state');
  assert.match(runtimeSource, /selectedDeckNo/, 'client must restore the server-selected deck group on room rerender');
  assert.match(runtimeSource, /BattleView\.prototype\.render/, 'battle entry must resolve cards from the active room deck group');
  assert.match(serverSource, /installRoomDeckSelection20260907/, 'server must install the four-deck authority patch before socket handlers run');
});

await check('team decks persist to server and collectible refill avoids protected inventory PUT', async () => {
  const authoritySource = fs.readFileSync(new URL('../src/ui/DeckInventoryAuthorityFix20260907.js', import.meta.url), 'utf8');
  const playerSource = fs.readFileSync(new URL('../server/routes/player.js', import.meta.url), 'utf8');
  const refillSource = fs.readFileSync(new URL('../server/routes/cardInventoryRefill20260907.js', import.meta.url), 'utf8');
  const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');

  assert.match(authoritySource, /snapshot\?\.decks|snapshot\.decks/, 'team deck editor must restore team1/team2/team3 from the authenticated server snapshot');
  assert.match(authoritySource, /\/player\/decks\//, 'team deck edits must persist through the server deck endpoint');
  assert.match(authoritySource, /grantAllCollectibleCards/, 'collectible refill must intercept the local bulk grant path');
  assert.match(authoritySource, /\/player\/card-inventory\/refill-collectibles/, 'collectible refill must use its dedicated authoritative server endpoint');
  assert.doesNotMatch(authoritySource, /put\(['"`]\/player\/card-inventory['"`]/, 'collectible refill must never bypass collection protection with the generic inventory PUT');

  assert.match(playerSource, /post\(['"]\/card-inventory\/refill-collectibles['"]/, 'player router must expose an authenticated collectible refill action');
  assert.match(refillSource, /isCollectible(?:\?\.)?\(\)/, 'server refill must derive the allowed collectible set from the canonical card database');
  assert.match(refillSource, /\[userId,\s*slotIndex,\s*cardId,\s*2,\s*5\]/s, 'server refill must preserve the existing star-2 quality-5 refill behavior');
  assert.match(bootstrapSource, /installDeckInventoryAuthorityFix20260907/, 'deck/refill authority repair must be installed after the older deck runtime patch');
});

await check('empty team deck remains empty after save, switch and reload', async () => {
  const authoritySource = fs.readFileSync(new URL('../src/ui/DeckInventoryAuthorityFix20260907.js', import.meta.url), 'utf8');
  const runtimeSource = fs.readFileSync(new URL('../src/ui/BattleUserRegressionFix20260907.js', import.meta.url), 'utf8');
  const deckViewSource = fs.readFileSync(new URL('../src/ui/DeckSelectView.js', import.meta.url), 'utf8');
  const playerSource = fs.readFileSync(new URL('../server/routes/player.js', import.meta.url), 'utf8');

  assert.doesNotMatch(authoritySource, /\|\|\s*!cardIds\.length/, 'an empty team deck must still be queued for server persistence');
  assert.doesNotMatch(authoritySource, /if\s*\(\s*!cardIds\.length\s*\)\s*return/, 'saving an empty team deck must not be dropped by the client');
  assert.doesNotMatch(authoritySource, /if\s*\(\s*selected\?\.length\s*\)\s*return\s+selected/, 'an authoritative empty snapshot must not fall through to a local/default deck');
  assert.match(runtimeSource, /parsed\.length\s*===\s*0/, 'an explicitly saved empty local team deck must be distinguishable from a missing deck');
  assert.match(runtimeSource, /fallbackDeckForGroup/, 'only the default group may receive the starter-deck fallback');
  assert.match(deckViewSource, /allowEmptyDeck/, 'DeckSelectView must preserve an explicit empty team deck during render');
  assert.doesNotMatch(playerSource, /cards\.length\s*<\s*1/, 'the deck editor endpoint must allow saving zero cards; battle start validation handles the minimum');
  assert.match(deckViewSource, /请至少选择1张卡牌/, 'battle start must still reject an empty selected deck');
});

await check('debounced base attacks do not restart animation every tick', async () => {
  const { unitAnimPlayer } = await import('../src/battle/UnitAnimPlayer.js');
  const { installBaseAttackRenderStability20260906 } = await import('../src/battle/BaseAttackRenderStability20260906.js');
  installBaseAttackRenderStability20260906();

  const uid = 'base-regression-20260906';
  const unit = {
    uid,
    res: '1',
    attackingBase: true,
    _attackAnimUntil: 2,
    isMovable: () => true,
    col: 11,
  };
  unitAnimPlayer.clocks.set(`${uid}:attacking`, 0.5);
  unitAnimPlayer.triggerAttack(unit, { time: 1 }, 0.6);
  assert.equal(
    unitAnimPlayer.clocks.get(`${uid}:attacking`),
    0.5,
    'a duplicate attack trigger inside the active attack window must preserve the current animation clock',
  );
  unitAnimPlayer.clocks.delete(`${uid}:attacking`);
});

if (failures.length) {
  console.error('\nBattle user regressions failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('PASS battle user regressions 20260907');
}
