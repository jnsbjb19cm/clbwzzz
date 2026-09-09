import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { QUEST_GROUPS, LEVEL_REWARDS, findQuestReward } from '../src/data/QuestCatalog.js';
import { pickExactTierCard } from '../src/core/CardEgg.js';

const rows = name => JSON.parse(fs.readFileSync(`src/data/${name}.json`, 'utf8'));
const known = new Set([...rows('item'), ...rows('functionalItems'), ...rows('craftMaterials').items].map(row => Number(row.item_id ?? row.id)));
for (const reward of [...Object.values(QUEST_GROUPS).flat(), ...LEVEL_REWARDS]) {
  for (const item of reward.items) assert.ok(known.has(item.id) && item.count > 0, `${reward.id}: invalid reward ${item.id}`);
  assert.equal(reward.cards.length, 0);
}
const cardRows = rows('card');
const collectible = cardRows.filter(row => row.show_card === 1 && ![122,123,124].includes(row.card_id));
for (let tier = 1; tier <= 5; tier++) for (let i = 0; i <= 100; i++) {
  assert.equal(pickExactTierCard(collectible, tier, () => i / 100).card_quality, tier);
}

process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'isolated-quest-regression';
const { db } = await import('../server/database.js');
const { questRewardAuthorityRouter20260908 } = await import('../server/routes/questRewardAuthority20260908.js');
const { batchInventoryUseAuthorityRouter20260908 } = await import('../server/routes/batchInventoryUseAuthority20260908.js');
const { playerEconomyAuthorityRouter20260908 } = await import('../server/routes/playerEconomyAuthority20260908.js');
const { functionalItemAuthorityRouter20260908 } = await import('../server/routes/functionalItemAuthority20260908.js');
const app = express();
app.use(express.json());
app.use('/api/player', questRewardAuthorityRouter20260908, batchInventoryUseAuthorityRouter20260908, playerEconomyAuthorityRouter20260908, functionalItemAuthorityRouter20260908);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
async function request(route, body, status = 200) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/player${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
try {
  await db.run("INSERT INTO users(id,username,password_hash) VALUES(1,'quest-test','x')");
  await db.run("INSERT INTO player_profiles(user_id,nickname,level,gold) VALUES(1,'quest-test',9,0)");
  await db.run('INSERT INTO player_card_bags(user_id,slot_count) VALUES(1,200)');
  await request('/quests/claim-reward', { category: 'level', questId: 'lv10' }, 400);
  await db.run('UPDATE player_profiles SET level=10 WHERE user_id=1');
  await request('/quests/claim-reward', { category: 'level', questId: 'bad' }, 400);
  const claimed = await request('/quests/claim-reward', { category: 'level', questId: 'lv10', reward: { gold: 2000000, cards: [121] } });
  assert.equal(claimed.profile.gold, findQuestReward('level', 'lv10').gold, 'server must ignore client reward amounts');
  assert.equal(claimed.items.find(item => item.itemId === 97)?.count, 1);
  await request('/quests/claim-reward', { category: 'level', questId: 'lv10' }, 409);
  const opened = await request('/inventory/use', { itemId: 97, count: 1 });
  assert.equal(cardRows.find(card => card.card_id === opened.cardId).card_quality, 5);
  await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,97,3,0) ON CONFLICT(user_id,item_id,is_bound) DO UPDATE SET count=3');
  const batch = await request('/inventory/use', { itemId: 97, count: 2 });
  assert.equal(batch.cards.length, 2);
  for (const card of batch.cards) assert.equal(cardRows.find(row => row.card_id === card.cardId).card_quality, 5);
  await db.run('UPDATE player_card_bags SET slot_count=3 WHERE user_id=1');
  await request('/inventory/use', { itemId: 97, count: 1 }, 400);
  assert.equal((await db.get('SELECT count FROM player_items WHERE user_id=1 AND item_id=97 AND is_bound=0')).count, 1, 'full bag must not consume egg');
  assert.equal((await db.all('SELECT * FROM player_cards WHERE user_id=1')).length, 3);
  console.log('PASS shared rewards: all definitions valid, level gate, fixed server amounts, duplicate rejection, single/batch guaranteed 5-tier eggs, full-bag rollback');
} finally {
  await new Promise(resolve => server.close(resolve));
  // The isolated in-memory database is released when this test process exits.
}
