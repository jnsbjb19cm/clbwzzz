import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auction-cards-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(dir, 'db.sqlite');
process.env.JWT_SECRET = 'auction-card-test-only';
const { db } = await import('../server/database.js');
const { auctionRouter } = await import('../server/routes/auction.js');
const { readCardInventory } = await import('../server/routes/cardInventoryPersistence20260906.js');
for (const id of [1, 2, 3]) {
  await db.run('INSERT INTO users(id,username,password_hash) VALUES(?,?,?)', [id, `test${id}`, 'x']);
  await db.run('INSERT INTO player_profiles(user_id,nickname,gold) VALUES(?,?,1000)', [id, `test${id}`]);
  await db.run('INSERT INTO player_card_bags(user_id,slot_count) VALUES(?,200)', [id]);
}
const state = { customName: '烈焰勇士', bound: false, awakened: true, exp: 123, learnedSkill: 'critical', attributeRoll: { atk: 5, hp: 2, cd: -1 }, powderSpent: { 10001: 8 } };
async function addCard(slot, fields = state) {
  await db.run('INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(1,?,1,6,3)', [slot]);
  await db.run('INSERT INTO player_card_instance_state(user_id,slot_index,state_json) VALUES(1,?,?)', [slot, JSON.stringify(fields)]);
}
await addCard(0); await addCard(1, { bound: true });
const app = express(); app.use(express.json()); app.use('/auction', auctionRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
async function request(route, method = 'GET', body, user = 1, status = 200) {
  const r = await fetch(`http://127.0.0.1:${server.address().port}/auction${route}`, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: user }, process.env.JWT_SECRET)}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data;
}
const gold = async id => Number((await db.get('SELECT gold FROM player_profiles WHERE user_id=?', [id])).gold);
try {
  let stock = (await request('/my-cards')).cards;
  assert.equal(stock.length, 1, 'bound cards hidden');
  await request('', 'POST', { kind: 'card', slotIndex: 1, saleKey: stock[0].saleKey, price: 100 }, 1, 400);
  const originalKey = stock[0].saleKey;
  await db.run('UPDATE player_cards SET star=7 WHERE user_id=1 AND slot_index=0');
  await request('', 'POST', { kind: 'card', slotIndex: 0, saleKey: originalKey, price: 100 }, 1, 400);
  stock = (await request('/my-cards')).cards;
  const post = () => request('', 'POST', { kind: 'card', slotIndex: 0, saleKey: stock[0].saleKey, price: 300 });
  const listed = await post();
  assert.equal((await request('/my-cards')).cards.length, 0);
  const row = (await request('')).listings[0];
  assert.equal(row.kind, 'card'); assert.equal(row.customName, state.customName); assert.equal(row.star, 7);
  assert.equal(row.stateJson, undefined);
  await request('/buy', 'POST', { listingId: listed.listingId }, 1, 400);
  await request(`/${listed.listingId}`, 'DELETE', undefined, 2, 400);
  await db.run('UPDATE player_profiles SET gold=0 WHERE user_id=2');
  await request('/buy', 'POST', { listingId: listed.listingId }, 2, 400);
  assert.equal((await request('')).listings.length, 1);
  await db.run('UPDATE player_profiles SET gold=1000 WHERE user_id=2');
  for (let i = 0; i < 200; i++) await db.run('INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(2,?,2,0,1)', [i]);
  await request('/buy', 'POST', { listingId: listed.listingId }, 2, 400);
  assert.equal(await gold(2), 1000, 'full bag rolls back payment');
  assert.equal(await gold(1), 1000);
  await db.run('DELETE FROM player_cards WHERE user_id=2 AND slot_index=5');
  await request('/buy', 'POST', { listingId: listed.listingId }, 2);
  assert.equal(await gold(2), 700); assert.equal(await gold(1), 1300);
  const purchased = (await readCardInventory(2)).cards.find(c => c.slotIndex === 5);
  assert.equal(purchased.star, 7); assert.equal(purchased.craftQuality, 3);
  const stored = await db.get('SELECT state_json FROM player_card_instance_state WHERE user_id=2 AND slot_index=5');
  assert.deepEqual(JSON.parse(stored.state_json), state, 'all instance attributes preserved');
  await request('/buy', 'POST', { listingId: listed.listingId }, 3, 400);
  await request(`/${listed.listingId}`, 'DELETE', undefined, 1, 400);
  await addCard(0); stock = (await request('/my-cards')).cards;
  const returned = await post(); await request(`/${returned.listingId}`, 'DELETE');
  assert.deepEqual(JSON.parse((await db.get('SELECT state_json FROM player_card_instance_state WHERE user_id=1 AND slot_index=0')).state_json), state);
  stock = (await request('/my-cards')).cards;
  const race = await post();
  await db.run('DELETE FROM player_cards WHERE user_id=2 AND slot_index=6');
  const outcomes = await Promise.all([2, 3].map(async user => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auction/buy`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${jwt.sign({id:user},process.env.JWT_SECRET)}` }, body:JSON.stringify({listingId:race.listingId}) }); return response.status;
  }));
  assert.deepEqual(outcomes.sort(), [200,400], 'only one buyer receives the card');
  await addCard(0);
  await db.run('DELETE FROM player_cards WHERE user_id=1 AND slot_index=1');
  await db.run("INSERT INTO player_decks(id,user_id,deck_no,name) VALUES(1,1,1,'deck')");
  await db.run('INSERT INTO deck_cards(deck_id,slot_index,card_id) VALUES(1,0,1)');
  stock = (await request('/my-cards')).cards;
  const rejected = await request('', 'POST', {kind:'card',slotIndex:0,saleKey:stock[0].saleKey,price:300},1,400);
  assert.match(rejected.message,/战团/);
  assert.equal((await request('/my-cards')).cards.length,1,'equipped last copy retained');
  await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,1,5,0)');
  const item = await request('', 'POST', { itemId:1,count:2,price:20 });
  assert.equal((await request('')).listings.find(r => r.listingId === item.listingId).kind, 'item', 'same item/card id stays distinct');
  await request(`/${item.listingId}`, 'DELETE');
  assert.equal(Number((await db.get('SELECT count FROM player_items WHERE user_id=1 AND item_id=1')).count), 5);
  console.log('PASS card auction: binding, stale selection, escrow, ownership, insufficient gold, full-bag rollback, purchase, exact attributes, return, concurrent purchase, item compatibility');
} finally { await new Promise(resolve => server.close(resolve)); await db.close?.(); fs.rmSync(dir, { recursive:true, force:true }); }
