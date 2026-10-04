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
export async function recordAdventureBossClear(conn,userId,bossId) {
  if(![...FOREST_BOSS_IDS,...TEMPLE_BOSS_IDS].includes(bossId))return;
  const row=await conn.get('SELECT stage_id FROM player_stage_progress WHERE user_id=? AND stage_id=?',[userId,bossId]);
  if(row)await conn.run('UPDATE player_stage_progress SET cleared=1, clear_count=clear_count+1 WHERE user_id=? AND stage_id=?',[userId,bossId]);
  else await conn.run('INSERT INTO player_stage_progress(user_id,stage_id,cleared,best_stars,clear_count,best_time_ms) VALUES(?,?,1,1,1,0)',[userId,bossId]);
}
