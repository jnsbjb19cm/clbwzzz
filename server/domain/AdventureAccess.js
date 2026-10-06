import { createRequire } from 'node:module';
import { createAdventureStages, FOREST_BOSS_IDS, TEMPLE_BOSS_IDS, isForestUnlocked, isAdventureStageUnlocked, BOSS_REGION_PREREQUISITES_ENABLED } from '../../src/data/AdventureCampaign.js';
const require=createRequire(import.meta.url);
const stages=new Map(createAdventureStages(require('../../src/data/stageInfo.json')).map(s=>[s.id,s]));
export async function assertAdventureAccess(conn, userId, room) {
  const stage=room?.mode==='pve'?stages.get(Number(room.stageId)):null;
  if (room?.mode === 'pve' && Number(room.stageId) >= 10000 && !stage) throw new Error('冒险关卡不存在');
  const bosses=[...FOREST_BOSS_IDS,...TEMPLE_BOSS_IDS];
  const bossIndex=room?.mode==='boss'?bosses.indexOf(room.bossId):-1;
  if (bossIndex >= 0 && !BOSS_REGION_PREREQUISITES_ENABLED) return;
  if(!stage && bossIndex<0)return;
  const rows=await conn.all('SELECT stage_id AS stageId FROM player_stage_progress WHERE user_id=? AND cleared=1',[userId]);
  const cleared=rows.map(r=>String(r.stageId));
  if(stage && !isAdventureStageUnlocked(stage,cleared))throw new Error('请先通关当前难度的前置关卡');
  if(bossIndex>=0) {
    if(!isForestUnlocked(cleared))throw new Error('请先通关冒险大陆最终关');
    if(bossIndex>0 && !cleared.includes(bosses[bossIndex-1]))throw new Error('请先击败上一位 BOSS');
  }
}
/**
 * 2026-10-06：悲伤密林 BOSS 的材料掉落表。
 * 每只 BOSS 掉自己那份（多特→巫蛊 / 沃里尔→铠甲 / 安娜→冰晶 / 树妖→精元），
 * 对应任务"以毒攻毒 / 铠甲的研发 / 海德的请求 / 神秘的魔法"的收集目标。
 * 数值可调：首次通关必掉 FIRST，之后每次 CHANCE 概率掉 MIN~MAX 个。
 */
export const BOSS_MATERIAL_DROP = Object.freeze({
  boss_dot: 53001,     // 多特的巫蛊
  boss_gravo: 53002,   // 沃里尔的铠甲
  boss_ice: 53003,     // 安娜的冰晶
  boss_forest: 53004,  // 树妖的精元
});
const BOSS_DROP_FIRST_CLEAR = 10;
const BOSS_DROP_CHANCE = 0.7;
const BOSS_DROP_MIN = 3;
const BOSS_DROP_MAX = 8;

async function grantBossMaterial(conn, userId, itemId, count) {
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  if (!amount) return 0;
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
    [userId, itemId],
  );
  if (row) {
    await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0', [amount, userId, itemId]);
  } else {
    await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)', [userId, itemId, amount]);
  }
  return amount;
}

export async function recordAdventureBossClear(conn,userId,bossId) {
  if(![...FOREST_BOSS_IDS,...TEMPLE_BOSS_IDS].includes(bossId))return null;
  const row=await conn.get('SELECT stage_id, clear_count FROM player_stage_progress WHERE user_id=? AND stage_id=?',[userId,bossId]);
  const firstClear = !row;
  if(row)await conn.run('UPDATE player_stage_progress SET cleared=1, clear_count=clear_count+1 WHERE user_id=? AND stage_id=?',[userId,bossId]);
  else await conn.run('INSERT INTO player_stage_progress(user_id,stage_id,cleared,best_stars,clear_count,best_time_ms) VALUES(?,?,1,1,1,0)',[userId,bossId]);

  // 掉落（服务端权威）：首次通关必掉，之后按概率掉；材料直接进背包。
  const itemId = BOSS_MATERIAL_DROP[bossId];
  if (!itemId) return null;
  let count = 0;
  if (firstClear) count = BOSS_DROP_FIRST_CLEAR;
  else if (Math.random() < BOSS_DROP_CHANCE) {
    count = BOSS_DROP_MIN + Math.floor(Math.random() * (BOSS_DROP_MAX - BOSS_DROP_MIN + 1));
  }
  if (!count) return { bossId, itemId, count: 0, firstClear };
  await grantBossMaterial(conn, userId, itemId, count);
  return { bossId, itemId, count, firstClear };
}
