import stages from '../data/stageInfo.json';
import { createAdventureStages } from '../data/AdventureCampaign.js';
import { BOSS_LIST } from '../data/bossList.js';

const stageNames = new Map([...stages, ...createAdventureStages(stages)].map(stage => [String(stage.stage_id), stage.stage_name]));
export function hallStageName(stageId, difficulty = '') {
  const key = String(stageId ?? '').trim();
  const stage = stageNames.get(key);
  if (stage) return stage.replace(/ · (简单|普通|困难)$/, '（$1）');
  const boss = BOSS_LIST.find(b => key === b.id || key.startsWith(`${b.id}:`) || key.startsWith(`${b.id}|`));
  if (boss) {
    const level = String(difficulty || key.slice(boss.id.length).replace(/^[:|]/, '')).trim();
    return `${boss.name}（${['简单','普通','中等','困难'].includes(level) ? level : '难度未记录'}）`;
  }
  return key ? (/^\d+$/.test(key) ? `未知关卡 #${key}` : key) : '未知关卡';
}
