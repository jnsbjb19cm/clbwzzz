import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clbwz-authority-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(tempDir, 'game.sqlite');
process.env.JWT_SECRET = 'authority-regression-test-secret';

const { planBoundFirstConsumption20260907 } = await import('../server/domain/smithyBinding20260907.js');
const plan = planBoundFirstConsumption20260907([
  { isBound: 0, count: 9 },
  { isBound: 1, count: 2 },
], 3);
assert.equal(plan.ok, true);
assert.equal(plan.usedBound, true);
assert.deepEqual(plan.steps, [
  { isBound: 1, take: 2, remain: 0 },
  { isBound: 0, take: 1, remain: 8 },
]);

const { db, withTransaction } = await import('../server/database.js');
const { performGuildUpgrade20260907 } = await import('../server/routes/guildUpgradeAuthority20260907.js');
const { putCardInventoryHandler, readCardInventory } = await import('../server/routes/cardInventoryPersistence20260906.js');

await db.run("INSERT INTO users(id,username,password_hash) VALUES(1,'authority-test','x')");
await db.run("INSERT INTO player_profiles(user_id,nickname,gold) VALUES(1,'authority-test',20000)");
await db.run('INSERT INTO player_card_bags(user_id,slot_count) VALUES(1,200)');
await db.run("INSERT INTO guilds(id,name,notice,level,created_by) VALUES(1,'test-guild','',1,1)");
await db.run("INSERT INTO guild_members(guild_id,user_id,role) VALUES(1,1,'president')");

const upgraded = await withTransaction((conn) => performGuildUpgrade20260907(conn, 1));
assert.deepEqual(upgraded, { level: 2, cost: 20000, gold: 0 });
assert.equal(Number((await db.get('SELECT level FROM guilds WHERE id=1')).level), 2);
assert.equal(Number((await db.get('SELECT gold FROM player_profiles WHERE user_id=1')).gold), 0);

await db.run('UPDATE guilds SET level=1 WHERE id=1');
await db.run('UPDATE player_profiles SET gold=19999 WHERE user_id=1');
await assert.rejects(
  withTransaction((conn) => performGuildUpgrade20260907(conn, 1)),
  /需要 20000 金币/,
);
assert.equal(Number((await db.get('SELECT level FROM guilds WHERE id=1')).level), 1);
assert.equal(Number((await db.get('SELECT gold FROM player_profiles WHERE user_id=1')).gold), 19999);

await db.run('INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(1,0,31,7,4)');
await db.run(
  'INSERT INTO player_card_instance_state(user_id,slot_index,state_json) VALUES(1,0,?)',
  [JSON.stringify({ bound: true, powderSpent: { 50001: 12 } })],
);

let responseStatus = 200;
let responseBody = null;
const req = {
  user: { id: 1 },
  body: {
    slotCount: 200,
    cards: [{ slotIndex: 5, cardId: 31, star: 0, craftQuality: 1, bound: false, powderSpent: {} }],
  },
};
const res = {
  status(code) { responseStatus = code; return this; },
  json(body) { responseBody = body; return body; },
};
await putCardInventoryHandler(req, res);
assert.equal(responseStatus, 200, JSON.stringify(responseBody));
const stored = await db.get('SELECT slot_index AS slotIndex, star, craft_quality AS craftQuality FROM player_cards WHERE user_id=1');
assert.deepEqual({ slotIndex: Number(stored.slotIndex), star: Number(stored.star), craftQuality: Number(stored.craftQuality) }, {
  slotIndex: 5,
  star: 7,
  craftQuality: 4,
});
const inventory = await readCardInventory(1);
assert.equal(inventory.cards[0].bound, true);
assert.deepEqual(inventory.cards[0].powderSpent, { 50001: 12 });

const indexSource = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
assert.match(indexSource, /app\.use\('\/api\/player\/smithy', smithyAuthorityRouter20260907\)/);
assert.match(indexSource, /app\.use\('\/api\/guild', guildUpgradeAuthorityRouter20260907\)/);
assert.ok(
  indexSource.indexOf('guildUpgradeAuthorityRouter20260907') < indexSource.lastIndexOf("app.use('/api/guild', guildRouter)"),
  'authoritative guild upgrade router must be mounted before the legacy guild router',
);

const smithySource = fs.readFileSync(new URL('../server/routes/smithyAuthority20260907.js', import.meta.url), 'utf8');
assert.match(smithySource, /function isCraftable\(card\) \{\s*return isCollectible\(card\) && cardQuality\(card\) <= 4;/s);
assert.match(smithySource, /int\(entry\.id, 0\) \+ 1/);
assert.match(smithySource, /bound: outputBound/);
assert.match(smithySource, /await addItem\(conn, userId, to\[type\], 1, consumed\.usedBound\)/);

console.log('economy/smithy/guild authority regression: PASS');
