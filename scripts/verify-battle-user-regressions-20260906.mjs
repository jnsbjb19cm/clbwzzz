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

await check('loot item ids resolve to real atlas sprites', async () => {
  const itemData = JSON.parse(fs.readFileSync(new URL('../src/data/item.json', import.meta.url), 'utf8'));
  const atlasData = JSON.parse(fs.readFileSync(new URL('../src/data/atlas/preload_items.json', import.meta.url), 'utf8'));
  const { resolveLootAtlasSprite20260906 } = await import('../src/battle/BattleLootIconResolver20260906.js');
  const strengthen = itemData.find((item) => Number(item.item_id) === 10001);
  assert.ok(strengthen, 'battle strengthen drop item 10001 must exist in item database');
  const sprite = resolveLootAtlasSprite20260906(10001, itemData);
  assert.ok(Number(sprite) > 0, 'business item id 10001 must resolve to a positive atlas sprite id');
  const spriteNames = new Set((atlasData?.sprites ?? atlasData ?? []).map((entry) => String(entry?.name ?? entry?.sprite?.name ?? '')));
  assert.ok(spriteNames.has(String(sprite)), `resolved item sprite ${sprite} must exist in preload_items atlas`);

  const rendererSource = fs.readFileSync(new URL('../src/battle/BattleRenderer.js', import.meta.url), 'utf8');
  assert.match(rendererSource, /resolveLootAtlasSprite20260906/, 'battle renderer must map business item ids through item metadata before atlas lookup');
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
  assert.notEqual(group.storageKeyForDeckGroup20260906('team1'), group.storageKeyForDeckGroup20260906('team2'));

  const deckSource = fs.readFileSync(new URL('../src/ui/DeckSelectView.js', import.meta.url), 'utf8');
  const roomSource = fs.readFileSync(new URL('../src/ui/RoomView.js', import.meta.url), 'utf8');
  const battleSource = fs.readFileSync(new URL('../src/ui/BattleView.js', import.meta.url), 'utf8');
  assert.match(deckSource, /onSetDeck/, 'deck tab switch must notify the authoritative room state');
  assert.match(deckSource, /storageKeyForDeckGroup20260906/, 'each deck group must use independent saved card slots');
  assert.match(roomSource, /selectedDeckNo:\s*myMember\?\.selectedDeckNo/, 'RoomView must pass the current authoritative selected deck to the deck UI');
  assert.match(roomSource, /onSetDeck:/, 'RoomView must send deck-group changes to room:set-deck');
  assert.match(battleSource, /deckNumberToGroup20260906/, 'BattleView must resolve the room member selected deck before loading cards');
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
  console.log('PASS battle user regressions 20260906');
}
