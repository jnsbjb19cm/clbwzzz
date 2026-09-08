import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clbwz-db-authority-20260908-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(tempDir, 'game.sqlite');
process.env.JWT_SECRET = 'db-authority-20260908-secret';

const { db, createPlayerData, withTransaction } = await import('../server/database.js');
const { config } = await import('../server/config.js');
const { playerEconomyAuthorityRouter20260908 } = await import('../server/routes/playerEconomyAuthority20260908.js');
const { functionalItemAuthorityRouter20260908 } = await import('../server/routes/functionalItemAuthority20260908.js');
const { playerSnapshotAuthorityRouter20260908 } = await import('../server/routes/playerSnapshotAuthority20260908.js');
const { performGuildUpgrade20260907 } = await import('../server/routes/guildUpgradeAuthority20260907.js');

await db.run("INSERT INTO users(id,username,password_hash) VALUES(1,'db-authority-user','x')");
await createPlayerData(1, 'db-authority-user');
await db.run('DELETE FROM player_items WHERE user_id=1 AND item_id IN (1,3,82)');
await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,1,2,0)');
await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,3,1,0)');
await db.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(1,82,1,0)');
await db.run('UPDATE player_profiles SET gold=12800, diamond=50, honor=120 WHERE user_id=1');

const app = express();
app.use(express.json());
app.use('/api/player', playerSnapshotAuthorityRouter20260908);
app.use('/api/player', playerEconomyAuthorityRouter20260908);
app.use('/api/player', functionalItemAuthorityRouter20260908);
const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});

try {
  const address = server.address();
  const token = jwt.sign({ id: 1 }, config.jwtSecret, { expiresIn: '5m' });
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const request = (pathname, options = {}) => fetch(`http://127.0.0.1:${address.port}${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  for (let index = 0; index < 2; index += 1) {
    const response = await request('/api/player/inventory/use', {
      method: 'POST', body: JSON.stringify({ itemId: 1, bound: false }),
    });
    assert.equal(response.status, 200, await response.text());
  }
  let profile = await db.get('SELECT gold FROM player_profiles WHERE user_id=1');
  assert.equal(Number(profile.gold), 22800, '两个5000金币礼盒必须直接写入数据库金币');
  const box = await db.get('SELECT count FROM player_items WHERE user_id=1 AND item_id=1 AND is_bound=0');
  assert.equal(box, undefined, '金币礼盒必须在同一数据库事务中扣除');

  await db.run("INSERT INTO guilds(id,name,level,created_by) VALUES(1,'DBGuild',1,1)");
  await db.run("INSERT INTO guild_members(guild_id,user_id,role) VALUES(1,1,'president')");
  const upgraded = await withTransaction((conn) => performGuildUpgrade20260907(conn, 1));
  assert.equal(upgraded.level, 2);
  assert.equal(upgraded.gold, 2800, '公会升级必须能使用金币礼盒刚写入数据库的金币');

  let response = await request('/api/player/inventory/sell', {
    method: 'POST', body: JSON.stringify({ itemId: 3, count: 1, bound: false }),
  });
  assert.equal(response.status, 200, await response.text());
  let payload = await response.json();
  assert.equal(Number(payload.profile.gold), 2900, '出售所得100金币必须写入数据库');

  response = await request('/api/player/snapshot');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(Number(payload.profile.gold), 2900, '刷新后的服务器快照必须保持数据库金币');
  assert.ok(Number(payload.itemBag?.slotCount) >= 120, '道具背包容量必须由数据库快照恢复');

  let card = await db.get('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=1 ORDER BY slot_index LIMIT 1');
  if (!card) {
    await db.run('INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(1,0,1,0,1)');
    card = { slotIndex: 0 };
  }
  await db.run('UPDATE player_cards SET craft_quality=1 WHERE user_id=1 AND slot_index=?', [card.slotIndex]);
  response = await request('/api/player/cards/use-functional-item', {
    method: 'POST',
    body: JSON.stringify({ itemId: 82, targetSlotIndex: card.slotIndex, bound: false }),
  });
  assert.equal(response.status, 200, await response.text());
  const upgradedCard = await db.get('SELECT craft_quality AS craftQuality FROM player_cards WHERE user_id=1 AND slot_index=?', [card.slotIndex]);
  assert.equal(Number(upgradedCard.craftQuality), 2, '品质升阶石效果必须直接写数据库卡牌实例');
  const stone = await db.get('SELECT count FROM player_items WHERE user_id=1 AND item_id=82 AND is_bound=0');
  assert.equal(stone, undefined, '功能道具消耗必须与卡牌效果同事务落库');
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const clientSource = fs.readFileSync(new URL('../src/ui/DatabasePersistenceAuthority20260908.js', import.meta.url), 'utf8');
assert.match(clientSource, /\/player\/inventory\/use/);
assert.match(clientSource, /\/player\/inventory\/sell/);
assert.match(clientSource, /\/player\/shop\/buy-item/);
assert.match(clientSource, /\/player\/cards\/use-functional-item/);
assert.match(clientSource, /\/player\/cards\/discard/);
const bootstrap = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrap, /installDatabasePersistenceAuthority20260908\(\)/);

console.log('database-first wallet, bag, shop, functional items and guild spend: PASS');
