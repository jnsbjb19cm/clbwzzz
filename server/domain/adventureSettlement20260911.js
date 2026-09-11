import { db, withTransaction } from '../database.js';
import { settleStageResult } from '../routes/stageResultAuthority20260908.js';

await db.run(`CREATE TABLE IF NOT EXISTS adventure_battle_results (
  battle_id VARCHAR(64) NOT NULL, user_id BIGINT NOT NULL, result_json TEXT NOT NULL,
  PRIMARY KEY(battle_id,user_id)
)`);
const MATERIALS = [10001,10002,10003,10004,10005,50001,50011,50031];
let pending = Promise.resolve();

// One transaction for all starting participants, including temporarily disconnected
// players. A durable battle id prevents duplicate rewards if settlement is retried.
export function settleAdventureBattle(battleId, battle, members, rng = Math.random) {
  const run = pending.then(() => withTransaction(async conn => {
    const results = {};
    const ids = [...new Set(members.map(m => Number(m.userId)).filter(id => id > 0))].sort((a,b)=>a-b);
    if (battle.mode !== 'pve' || battle.status !== 'finished') throw new Error('冒险尚未结束');
    for (const userId of ids) {
      await conn.run('UPDATE player_profiles SET gold=gold WHERE user_id=?', [userId]);
      const saved = await conn.get('SELECT result_json FROM adventure_battle_results WHERE battle_id=? AND user_id=?', [battleId,userId]);
      if (saved) { results[userId] = JSON.parse(saved.result_json); continue; }
      const won = battle.winner === 'blue';
      // Independent rolls per participant; clients never submit loot or victory.
      const count = won ? 1 + Math.floor(rng() * 3) : 0;
      const drops = Array.from({length:count}, () => ({itemId:MATERIALS[Math.floor(rng()*MATERIALS.length)],count:1}));
      const result = await settleStageResult(conn, userId, {
        won, stageId:battle.stageId, durationMs:Math.round(battle.engine.time*1000), bestStars:1, drops,
      });
      results[userId] = result;
      await conn.run('INSERT INTO adventure_battle_results(battle_id,user_id,result_json) VALUES(?,?,?)', [battleId,userId,JSON.stringify(result)]);
    }
    return results;
  }));
  pending = run.catch(() => {});
  return run;
}
