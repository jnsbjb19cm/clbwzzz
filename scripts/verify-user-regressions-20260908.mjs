import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clbwz-user-regression-20260908-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(tempDir, 'game.sqlite');
process.env.JWT_SECRET = 'user-regression-20260908-secret';

// Node 20 不允许项目现有的无 import-attribute JSON ESM 直接导入 CardCraftSystem；
// 这里读取真实配置 + 真实 canonical quality resolver，并锁定 CardCraftSystem 的映射契约。
const craftRules = JSON.parse(fs.readFileSync(new URL('../src/data/craftRules.json', import.meta.url), 'utf8'));
const { resolveCraftQuality } = await import('../src/core/constants.js');
const mappedQualities = craftRules.craftQualityWeights.map((raw) => {
  const id = Math.max(1, Math.min(5, Number(raw.id) + 1));
  const canonical = resolveCraftQuality(id);
  return { id, name: canonical.name, color: canonical.color, weight: Number(raw.weight) };
});
assert.deepEqual(mappedQualities.map((entry) => entry.id), [1, 2, 3, 4, 5]);
assert.deepEqual(mappedQualities.map((entry) => entry.name), ['劣质', '普通', '精良', '优秀', '完美']);
assert.equal(mappedQualities[2].color.toLowerCase(), '#4caf50');
assert.equal(mappedQualities[3].color.toLowerCase(), '#2196f3');
assert.equal(craftRules.craftQualityWeights[2].name, '精良');
assert.equal(craftRules.craftQualityWeights[3].name, '优秀');
const craftSystemSource = fs.readFileSync(new URL('../src/systems/CardCraftSystem.js', import.meta.url), 'utf8');
assert.match(craftSystemSource, /Number\(raw\.id\) \+ 1/);
assert.match(craftSystemSource, /weight: raw\.weight \* \(id >= 4 \? highQualityMult : 1\)/);

const { db, createPlayerData, withTransaction } = await import('../server/database.js');
const {
  getAuthoritativePlayerSnapshot20260908,
  PLAYER_STARTER_ITEMS_20260908,
} = await import('../server/domain/playerInventoryAuthority20260908.js');
const { performGuildUpgrade20260907 } = await import('../server/routes/guildUpgradeAuthority20260907.js');
const { stageResultAuthorityRouter20260908 } = await import('../server/routes/stageResultAuthority20260908.js');
const { config } = await import('../server/config.js');

await db.run("INSERT INTO users(id,username,password_hash) VALUES(1,'regression-20260908','x')");
await createPlayerData(1, 'regression-20260908');

const firstSnapshot = await getAuthoritativePlayerSnapshot20260908(1);
assert.ok(firstSnapshot?.items?.length > 0, '数据库快照必须包含初始背包道具');
for (const starter of PLAYER_STARTER_ITEMS_20260908) {
  const total = firstSnapshot.items
    .filter((entry) => Number(entry.itemId) === Number(starter.itemId))
    .reduce((sum, entry) => sum + Number(entry.count || 0), 0);
  assert.ok(total >= Number(starter.count), `初始道具 ${starter.itemId} 未写入数据库`);
  assert.ok(firstSnapshot.items.filter((entry) => Number(entry.itemId) === Number(starter.itemId))
    .every((entry) => typeof entry.bound === 'boolean'), `道具 ${starter.itemId} 快照缺少绑定状态`);
}
const beforeSecondSnapshot = Number((await db.get('SELECT COALESCE(SUM(count),0) AS count FROM player_items WHERE user_id=1')).count);
await getAuthoritativePlayerSnapshot20260908(1);
const afterSecondSnapshot = Number((await db.get('SELECT COALESCE(SUM(count),0) AS count FROM player_items WHERE user_id=1')).count);
assert.equal(afterSecondSnapshot, beforeSecondSnapshot, '初始背包数据库迁移必须幂等，重进不能重复补发');

// 战斗结算必须实际写数据库钱包；否则公会会看到“本地20000/服务器不足”的假余额。
const app = express();
app.use(express.json());
app.use('/api/player', stageResultAuthorityRouter20260908);
const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
try {
  const address = server.address();
  const token = jwt.sign({ id: 1 }, config.jwtSecret, { expiresIn: '5m' });
  const response = await fetch(`http://127.0.0.1:${address.port}/api/player/stage-result`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ won: false }),
  });
  assert.equal(response.status, 200);
  const settled = await response.json();
  assert.equal(settled.goldGain, 15);
  assert.equal(Number(settled.profile.gold), 12815);
  assert.equal(Number((await db.get('SELECT gold FROM player_profiles WHERE user_id=1')).gold), 12815);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

await db.run("INSERT INTO guilds(id,name,notice,level,created_by) VALUES(1,'regression-guild','',1,1)");
await db.run("INSERT INTO guild_members(guild_id,user_id,role) VALUES(1,1,'president')");
await db.run('UPDATE player_profiles SET gold=20000 WHERE user_id=1');
const upgraded = await withTransaction((conn) => performGuildUpgrade20260907(conn, 1));
assert.deepEqual(upgraded, { level: 2, cost: 20000, gold: 0 });
assert.equal(Number((await db.get('SELECT level FROM guilds WHERE id=1')).level), 2);
assert.equal(Number((await db.get('SELECT gold FROM player_profiles WHERE user_id=1')).gold), 0);

const indexSource = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
assert.ok(
  indexSource.indexOf('playerSnapshotAuthorityRouter20260908') < indexSource.indexOf("app.use('/api/player', playerRouter)"),
  '数据库道具快照必须先于旧 playerRouter',
);
assert.ok(
  indexSource.indexOf('stageResultAuthorityRouter20260908') < indexSource.indexOf("app.use('/api/player', playerRouter)"),
  '数据库战斗结算必须先于旧 stage-result',
);

const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrapSource, /installPlayerSnapshotAuthority20260908\(\)/);
assert.match(bootstrapSource, /installSmithyStrengthenLayoutFix20260908\(\)/);

console.log('2026-09-08 user regressions: PASS');
