import { deflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import '../src/battle/BattleEngineBaseEdgeCompat.js';
import { PvpBattle } from '../server/battle/PvpBattle.js';
import { BattleUnit } from '../src/battle/BattleUnit.js';
import { getPvpCardDb } from '../server/battle/PvpCardDb.js';

// Follow the actual server's battle installer order, without starting its HTTP server or database.
const source = fs.readFileSync('server/index.js', 'utf8');
const imports = new Map();
for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
  for (const name of match[1].split(',').map(s => s.trim())) imports.set(name, match[2]);
}
const installation = source.slice(source.indexOf('installPvpGameplayFinal();'), source.indexOf('const app = express();'));
for (const [call, name] of installation.matchAll(/(install\w+)\(\);/g)) {
  const file = imports.get(name);
  if (!file?.includes('/battle/')) continue;
  const module = await import(new URL(`../server/${file}`, import.meta.url));
  module[name]();
}
const db = getPvpCardDb();
for (const count of [30, 60, 120]) {
  const battle = new PvpBattle({ roomId: count, db, teamBlue: [{ userId: 1 }], teamRed: [{ userId: 2 }] });
  battle.engine.heroHp = battle.engine.enemyHeroHp = 1e9;
  battle.engine.units = Array.from({ length: count }, (_, index) => {
    const blue = index % 2 === 0;
    const unit = new BattleUnit({ card: db.getById([3, 1, 7, 2][index % 4]), lane: Math.floor(index / 2) % 5, col: blue ? 3 : 8, team: blue ? 'player' : 'enemy' });
    unit.hp = unit.maxHp = 1e9;
    unit.ownerUserId = blue ? 1 : 2;
    return unit;
  });
  const durations = [];
  let bytes = 0;
  let compressedBytes = 0;
  for (let i = 0; i < 300; i++) {
    const start = performance.now();
    battle.tick(1 / 30);
    if (i % 2 === 0) {
      const json=JSON.stringify(battle.snapshot());
      bytes+=Buffer.byteLength(json);
      compressedBytes+=deflateRawSync(json,{level:1}).length;
    }
    durations.push(performance.now() - start);
  }
  durations.sort((a,b) => a-b);
  assert.ok(battle.engine.units.length >= count, 'load fixture must retain its units');
  assert.ok(battle.engine.time >= 9.9, 'battle must advance ten simulated seconds');
  console.log(`${count} units, installed server battle: tick + snapshot p95=${durations[285].toFixed(2)}ms, max=${durations[299].toFixed(2)}ms, snapshots=${(bytes/1024/10).toFixed(0)}KB/s per viewer, compressed=${(compressedBytes/1024/10).toFixed(0)}KB/s`);
}
