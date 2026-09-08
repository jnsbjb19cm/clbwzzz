import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clbwz-guild-task-pin-20260908-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(tempDir, 'game.sqlite');
process.env.JWT_SECRET = 'guild-task-pin-20260908-secret';

const { db, createPlayerData } = await import('../server/database.js');
const { config } = await import('../server/config.js');
const { questPinPersistenceRouter20260908 } = await import('../server/routes/questPinPersistence20260908.js');
const { isActiveSkillCard, getSkillEffect } = await import('../src/core/SkillRegistry.js');

await db.run("INSERT INTO users(id,username,password_hash) VALUES(1,'quest-pin-regression','x')");
await createPlayerData(1, 'quest-pin-regression');

const app = express();
app.use(express.json());
app.use('/api/player', questPinPersistenceRouter20260908);
const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});

try {
  const address = server.address();
  const token = jwt.sign({ id: 1 }, config.jwtSecret, { expiresIn: '5m' });
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const request = (pathname, options = {}) => fetch(
    `http://127.0.0.1:${address.port}${pathname}`,
    { ...options, headers: { ...headers, ...(options.headers || {}) } },
  );

  let response = await request('/api/player/quest-pins');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).pins, []);

  response = await request('/api/player/quest-pins/main/m1', {
    method: 'PUT',
    body: JSON.stringify({ pinned: true }),
  });
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.pinned, true);
  assert.ok(payload.pins.some((entry) => entry.category === 'main' && entry.questId === 'm1'));

  response = await request('/api/player/quest-pins');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.ok(payload.pins.some((entry) => entry.category === 'main' && entry.questId === 'm1'), '刷新读取必须从数据库恢复置顶任务');

  response = await request('/api/player/quest-pins/main/m1', {
    method: 'PUT',
    body: JSON.stringify({ pinned: false }),
  });
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.pinned, false);
  assert.equal(payload.pins.some((entry) => entry.category === 'main' && entry.questId === 'm1'), false);

  response = await request('/api/player/quest-pins/not-a-category/m1', {
    method: 'PUT',
    body: JSON.stringify({ pinned: true }),
  });
  assert.equal(response.status, 400);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const guildSource = fs.readFileSync(new URL('../src/ui/GuildView.js', import.meta.url), 'utf8');
assert.match(guildSource, /guild-upgrade-btn/);
assert.match(guildSource, /GUILD_UPGRADE_COST/);
assert.match(guildSource, /data-guild-role-change/);
assert.match(guildSource, /\/guild\/\$\{guildId\}\/promote/);
assert.match(guildSource, /升职为/);
assert.match(guildSource, /降职为/);

const questPinSource = fs.readFileSync(new URL('../src/ui/QuestPinPersistence20260908.js', import.meta.url), 'utf8');
assert.match(questPinSource, /quest-pin-toggle-20260908/);
assert.match(questPinSource, /\/player\/quest-pins/);
assert.match(questPinSource, /sortActiveItems/);

const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrapSource, /installQuestPinPersistence20260908\(\)/);
const indexSource = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
assert.match(indexSource, /questPinPersistenceRouter20260908/);
assert.match(indexSource, /app\.use\('\/api\/player', questPinPersistenceRouter20260908\)/);

assert.equal(isActiveSkillCard({ id: 520, card_category: 2 }), false, '蒙脸眩晕 card 520 不得进入技能树/技能池');
assert.equal(Boolean(getSkillEffect(520)), false, '蒙脸眩晕 card 520 不得保留可执行技能效果');

console.log('guild upgrade/member role, task pin persistence, hidden masked stun: PASS');
