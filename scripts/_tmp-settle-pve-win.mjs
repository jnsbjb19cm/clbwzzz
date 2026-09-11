// 临时验证（用完即删）：PVE 服务端胜利结算（首通/功勋/掉落/入库）
import fs from 'node:fs';
import { createRequire } from 'node:module';

const DB = 'server/data/e2e-settle-20260911.sqlite';
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.rmSync(f); } catch { /* ignore */ } }
process.env.DATABASE_PATH = DB;
process.env.JWT_SECRET = 'e2e-settle';

const { db, createPlayerData, withTransaction } = await import('../server/database.js');
const { settlePveStageForPlayer } = await import('../server/battle/PveStageSettlement20260911.js');
const require = createRequire(import.meta.url);
const stageInfo = require('../src/data/stageInfo.json');
const stage = stageInfo.find((s) => Number(s.stage_id) === 1);

const rows = [];
const check = (n, ok, d) => rows.push({ n, ok: Boolean(ok), d });

const ins = await db.run("INSERT INTO users(username,password_hash) VALUES('settle_u','x')");
const userId = Number(ins.lastInsertRowid);
await createPlayerData(userId, '结算测试');

const drops = [{ itemId: 10001, count: 2 }, { itemId: 10002, count: 1 }];
const first = await withTransaction((conn) => settlePveStageForPlayer(conn, userId, {
  stageId: 1, stage, won: true, durationMs: 12345, drops,
}));
check('首通：金币/经验/功勋 > 0', first.gold > 0 && first.exp > 0 && first.honor >= 50,
  JSON.stringify({ gold: first.gold, exp: first.exp, honor: first.honor }));
check('首通：firstClear=true', first.firstClear === true, String(first.firstClear));
check('掉落每份入库 + 首通奖励进战利品', first.items.length >= drops.length,
  JSON.stringify(first.items));

const item1 = await db.get('SELECT count FROM player_items WHERE user_id=? AND item_id=10001 AND is_bound=0', [userId]);
check('掉落道具已写库(10001 x2)', Number(item1?.count) === 2, JSON.stringify(item1));
const prof = await db.get('SELECT gold, exp, honor, level FROM player_profiles WHERE user_id=?', [userId]);
check('玩家资料已入账(金币/经验/功勋)', Number(prof?.gold) > 0 && Number(prof?.exp) > 0 && Number(prof?.honor) >= 50,
  JSON.stringify(prof));
const prog = await db.get('SELECT cleared, clear_count, best_time_ms FROM player_stage_progress WHERE user_id=? AND stage_id=?', [userId, '1']);
check('通关进度已写库(cleared/次数/最佳时间)', Number(prog?.cleared) === 1 && Number(prog?.clear_count) === 1 && Number(prog?.best_time_ms) === 12345,
  JSON.stringify(prog));

// 第二次通关：不再是首通，功勋 10，掉落照发
const second = await withTransaction((conn) => settlePveStageForPlayer(conn, userId, {
  stageId: 1, stage, won: true, durationMs: 9000, drops: [{ itemId: 10001, count: 1 }],
}));
check('重复通关：firstClear=false 且功勋=10', second.firstClear === false && second.honor === 10,
  JSON.stringify({ firstClear: second.firstClear, honor: second.honor }));
const prog2 = await db.get('SELECT clear_count, best_time_ms FROM player_stage_progress WHERE user_id=? AND stage_id=?', [userId, '1']);
check('重复通关：次数+1、最佳时间取更小', Number(prog2?.clear_count) === 2 && Number(prog2?.best_time_ms) === 9000,
  JSON.stringify(prog2));

// 失败：只有基础金币/经验，无首通/功勋/进度
const loseUser = Number((await db.run("INSERT INTO users(username,password_hash) VALUES('settle_l','x')")).lastInsertRowid);
await createPlayerData(loseUser, '失败测试');
const lose = await withTransaction((conn) => settlePveStageForPlayer(conn, loseUser, { stageId: 1, stage, won: false, durationMs: 1000, drops: [] }));
check('失败结算：给基础金币/经验，无首通/功勋', lose.gold > 0 && lose.exp > 0 && lose.honor === 0 && lose.firstClear === false,
  JSON.stringify({ gold: lose.gold, exp: lose.exp, honor: lose.honor }));

db.close?.();
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.rmSync(f); } catch { /* ignore */ } }

const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : `  << ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
process.exit(bad.length ? 1 : 0);
