import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import express from 'express';
import jwt from 'jsonwebtoken';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clbwz-inventory-announcements-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(tempDir, 'game.sqlite');
process.env.JWT_SECRET = 'inventory-announcement-regression-only';
const { db } = await import('../server/database.js');
const { getAuthoritativePlayerSnapshot20260908 } = await import('../server/domain/playerInventoryAuthority20260908.js');
const { auctionRouter } = await import('../server/routes/auction.js');
const { guildWarehouseGridRouter } = await import('../server/routes/guildWarehouseGrid.js');
const { guildRouter } = await import('../server/routes/guild.js');
const { playerSnapshotAuthorityRouter20260908 } = await import('../server/routes/playerSnapshotAuthority20260908.js');
const { materialRefillRouter } = await import('../server/routes/materialRefill.js');
const { smithyAuthorityRouter20260907 } = await import('../server/routes/smithyAuthority20260907.js');
const { recordAuthorityPvpResult, installSystemAnnouncementService } = await import('../server/socket/SystemAnnouncementService.js');
const messages = [];
let connectionHandler;
const io = { emit(event, data) { if (event === 'system:announcement') messages.push(data); }, on(event, cb) { if (event === 'connection') connectionHandler = cb; } };
installSystemAnnouncementService(io);
for (const id of [1, 2, 3, 4]) {
  await db.run('INSERT INTO users(id,username,password_hash) VALUES(?,?,?)', [id, `player-${id}`, 'x']);
  await db.run('INSERT INTO player_profiles(user_id,nickname,gold) VALUES(?,?,?)', [id, `勇士${id}`, 100000]);
  await db.run('INSERT INTO player_card_bags(user_id,slot_count) VALUES(?,200)', [id]);
  await getAuthoritativePlayerSnapshot20260908(id);
}
await db.run("INSERT INTO guilds(id,name,created_by) VALUES(1,'regression',1)");
await db.run("INSERT INTO guild_members(guild_id,user_id,role) VALUES(1,1,'president')");
await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,1,7,1)');
const app = express();
app.use(express.json());
app.use('/api/player', playerSnapshotAuthorityRouter20260908);
app.use('/api/player/smithy', smithyAuthorityRouter20260907);
app.use('/api/player', materialRefillRouter);
app.use('/api/auction', auctionRouter);
app.use('/api/guild', guildWarehouseGridRouter, guildRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
async function request(route, method = 'GET', body, userId = 1) {
  const response = await fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userId === 1 ? token : jwt.sign({ id: userId }, process.env.JWT_SECRET)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return data;
}

try {
  // Execute the real snapshot patch with App/AuthStore supplied as its boundaries.
  // Requests below use actual Express routes and an isolated SQLite database.
  const initial = await request('/player/snapshot');
  let saved = null;
  class FakeApp { bootstrap() {} }
  const client = new FakeApp();
  client.inventory = { state: { slotCount: 150, slots: [] }, save() { saved = structuredClone(this.state); } };
  client.player = {};
  const authStore = { token, snapshot: initial, api: {
    get: (p) => request(p), post: (p, b) => request(p, 'POST', b),
    put: (p, b) => request(p, 'PUT', b), delete: (p) => request(p, 'DELETE'),
  } };
  const source = fs.readFileSync(new URL('../src/ui/PlayerSnapshotAuthority20260908.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
  vm.runInNewContext(source + '\ninstallPlayerSnapshotAuthority20260908();', { App: FakeApp, authStore, console });
  client.bootstrap();
  const before = JSON.stringify(saved);
  await Promise.all([
    authStore.api.get('/guild/1/warehouse'), authStore.api.get('/guild/1/warehouse/my-items'),
    authStore.api.get('/auction'), authStore.api.get('/auction/mine'), authStore.api.get('/auction/my-items'),
  ]);
  assert.equal(JSON.stringify(saved), before, 'opening empty guild / auction must preserve the entire bag and bound items');
  await db.run('INSERT INTO guild_warehouse(guild_id,item_id,count) VALUES(1,2,13)');
  await authStore.api.get('/guild/1/warehouse');
  assert.equal(JSON.stringify(saved), before, 'a non-empty warehouse is not the personal bag');
  const refill = await authStore.api.post('/player/material-refill', {});
  assert.ok(refill.items.length);
  assert.equal(JSON.stringify(saved), before, 'refill items are grants, not a full inventory');
  await authStore.api.get('/player/snapshot');
  const count = (id, bound = false) => client.inventory.state.slots.filter((s) => s?.itemId === id && s.bound === bound).reduce((n, s) => n + s.count, 0);
  assert.equal(count(1, true), 7);
  const originalCount = count(1);
  await authStore.api.post('/guild/1/warehouse/deposit', { itemId: 1, count: 2 });
  assert.equal(count(1), originalCount - 2);
  assert.equal(count(1, true), 7);
  await authStore.api.post('/guild/1/warehouse/withdraw', { itemId: 1, count: 2 });
  assert.equal(count(1), originalCount);
  const listing = await authStore.api.post('/auction', { itemId: 1, count: 3, price: 5 });
  assert.equal(count(1), originalCount - 3);
  await authStore.api.delete(`/auction/${listing.listingId}`);
  assert.equal(count(1), originalCount, 'cancel must refresh the bag too');
  const otherListing = await request('/auction', 'POST', { itemId: 1, count: 4, price: 5 }, 2);
  await authStore.api.post('/auction/buy', { listingId: otherListing.listingId });
  assert.equal(count(1), originalCount + 4);
  const after = JSON.stringify(saved);
  await assert.rejects(authStore.api.post('/guild/1/warehouse/deposit', { itemId: 1, count: 10000 }));
  assert.equal(JSON.stringify(saved), after, 'failed transfers leave the bag unchanged');
  await db.run('DELETE FROM player_items WHERE user_id=1');
  await authStore.api.get('/player/snapshot');
  assert.equal(client.inventory.state.slots.filter(Boolean).length, 0, 'a real empty snapshot must clear consumed items');
  assert.equal(client.inventory.state.slotCount, 150, 'refresh must preserve expanded capacity');
  console.log('PASS inventory: guild/auction reads, grants, binding, deposit/withdraw/list/cancel/buy, failed transfer, true empty snapshot');

  // Real server craft transaction: force a successful ascension with deterministic RNG.
  await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,50011,100,0)');
  await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,50001,100,0)');
  const cardRows = JSON.parse(fs.readFileSync(new URL('../src/data/card.json', import.meta.url)));
  const target = cardRows.find((c) => Number(c.show_card) === 1 && Number(c.card_quality) === 1 && Number(c.card_id) < 122);
  const random = Math.random;
  let crafted;
  try { Math.random = () => 0; crafted = await request('/player/smithy/craft', 'POST', { targetCardId: Number(target.card_id) }); }
  finally { Math.random = random; }
  assert.equal(crafted.outcome, 'ascend');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'craft-ascend');
  assert.match(messages[0].text, /勇士1/);
  assert.ok(await db.get('SELECT card_id FROM player_cards WHERE user_id=1 AND card_id=?', [crafted.cardId]));
  const beforeFailure = messages.length;
  await assert.rejects(request('/player/smithy/craft', 'POST', { targetCardId: -1 }));
  assert.equal(messages.length, beforeFailure, 'failed craft cannot announce');
  const upgradeCard = cardRows.find((c) => Number(c.show_card) === 1 && Number(c.card_quality) === 2 && Number(c.card_id) < 122);
  await db.run('INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(1,10,?,5,1)', [Number(upgradeCard.card_id)]);
  const smithy = JSON.parse(fs.readFileSync(new URL('../src/data/smithy.json', import.meta.url)));
  const powderId = Number(smithy[0].strength[5].powder_2.split('|')[0]);
  await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,?,1000,0)', [powderId]);
  let upgraded;
  try { Math.random = () => 0; upgraded = await request('/player/smithy/star-upgrade', 'POST', { mainIndex: 10 }); }
  finally { Math.random = random; }
  assert.equal(upgraded.success, true);
  assert.equal(upgraded.star, 6);
  assert.equal(messages.at(-1).kind, 'strengthen');
  assert.match(messages.at(-1).text, /勇士1/);
  console.log('PASS smithy: committed craft ascension, player nickname, failed craft, committed 6-star upgrade');

  messages.length = 0;
  const room = { id: 9, createdAt: 100, mode: 'pvp' };
  const roster = [
    { userId: 1, nickname: '甲', team: 'blue' }, { userId: 2, nickname: '乙', team: 'red' },
    { userId: -1, nickname: '机器人', team: 'red', isBot: true },
  ];
  const entry = (winner) => ({ battle: { status: 'finished', winner }, announcementMembers: structuredClone(roster) });
  const first = entry('blue');
  await Promise.all(Array.from({ length: 20 }, () => recordAuthorityPvpResult(io, room, first)));
  assert.equal(Number((await db.get('SELECT streak FROM pvp_win_streaks WHERE user_id=1')).streak), 1);
  assert.equal(messages.length, 0);
  await recordAuthorityPvpResult(io, room, entry('blue'));
  assert.equal(messages[0].kind, 'win-streak');
  assert.equal(messages[0].streak, 2, 'second battle in the SAME ROOM counts');
  await recordAuthorityPvpResult(io, room, entry('red'));
  assert.equal(messages.at(-1).kind, 'streak-ended');
  assert.match(messages.at(-1).text, /乙 终结了 甲 的 2 连胜/);
  assert.equal(Number((await db.get('SELECT streak FROM pvp_win_streaks WHERE user_id=1')).streak), 0);
  assert.equal(await db.get('SELECT * FROM pvp_win_streaks WHERE user_id=-1'), undefined);
  const ignoredCount = messages.length;
  await recordAuthorityPvpResult(io, { ...room, mode: 'boss' }, entry('blue'));
  await recordAuthorityPvpResult(io, room, { ...entry('blue'), battle: { status: 'playing', winner: 'blue' } });
  assert.equal(messages.length, ignoredCount);
  const handlers = new Map();
  connectionHandler({ on: (event, cb) => handlers.set(event, cb), user: { id: 1 } });
  for (const cb of handlers.values()) cb({ won: true, star: 15 }, () => {});
  assert.equal(messages.length, ignoredCount, 'legacy reports cannot duplicate/forge server results');
  const teamEntry = entry('blue');
  teamEntry.announcementMembers.push({ userId: 3, nickname: '丙', team: 'blue' }, { userId: 4, nickname: '丁', team: 'red' });
  await recordAuthorityPvpResult(io, room, teamEntry);
  assert.equal(Number((await db.get('SELECT streak FROM pvp_win_streaks WHERE user_id=3')).streak), 1);
  assert.equal(Number((await db.get('SELECT streak FROM pvp_win_streaks WHERE user_id=4')).streak), 0);
  console.log('PASS PVP: duplicate finish, same-room rematch, streak ended, bots/BOSS exclusions, legacy reports, team settlement');
} finally {
  await new Promise((resolve) => server.close(resolve));
  await db.close?.();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
