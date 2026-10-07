import { designedPlantWaves, monsterMirrorWaves, finalAdventureWaves, adventureDesignSummary, applyAdventureDifficulty } from './AdventureStageDesign.js';
// Reset specification: independent stage IDs preserve all legacy saves and rewards.
export const ADVENTURE_DIFFICULTIES = ['简单', '普通', '困难'];
// Current release: forest and ocean are always open; prerequisites are future work.
export const BOSS_REGION_PREREQUISITES_ENABLED = false;
export const FOREST_BOSS_IDS = ['boss_dot', 'boss_gravo', 'boss_ice', 'boss_forest'];
export const TEMPLE_BOSS_IDS = ['boss_shark', 'boss_lobster', 'boss_bluebaby', 'boss_turtle', 'boss_princess'];
export const campaignStageId = (route, index, difficulty = 0) => 10000 + difficulty * 100 + route * 20 + index;
export const campaignFinalId = (difficulty = 0) => 10099 + difficulty * 100;

export function createAdventureStages(legacy) {
  const result = [];
  for (let difficulty = 0; difficulty < 3; difficulty++) {
    for (let route = 0; route < 2; route++) {
      for (let index = 1; index <= 16; index++) {
        const act = Math.ceil(index / 4), node = (index - 1) % 4 + 1;
        // Preserve route scenery/rewards, but both routes use the same chapter's base HP.
        const original = legacy.find(s => Number(s.map_id) === act + route * 4 && Number(s.stage_num) === node) || legacy[0];
        const pairedBaseline = legacy.find(s => Number(s.map_id) === act && Number(s.stage_num) === node) || legacy[0];
        const id = campaignStageId(route, index, difficulty);
        result.push({ ...original, hp: pairedBaseline.hp, id, stage_id: id, stage_num: node,
          stage_name: `${route ? '怪物' : '植物'}线 ${act}-${node} · ${ADVENTURE_DIFFICULTIES[difficulty]}`,
          adventure: { route, index, act, node, difficulty, challenge: node === 4, final: false },
          encounter: adventureDesignSummary(route, index),
          prerequisites: index === 1 ? [] : [campaignStageId(route, index - 1, difficulty)] });
      }
    }
    const original = legacy.find(s => Number(s.map_id) === 9 && Number(s.stage_num) === 5) || legacy.at(-1);
    const id = campaignFinalId(difficulty);
    result.push({ ...original, id, stage_id: id, stage_name: `大陆最终关 · ${ADVENTURE_DIFFICULTIES[difficulty]}`,
      adventure: { route: 2, index: 17, act: 5, node: 4, difficulty, challenge: true, final: true },
      encounter: adventureDesignSummary(2, 17),
      prerequisites: [campaignStageId(0, 16, difficulty), campaignStageId(1, 16, difficulty)] });
  }
  return result;
}

export function isAdventureStageUnlocked(stage, cleared = []) {
  const ids = new Set(cleared.map(Number));
  return ids.has(Number(stage.id)) || (stage.prerequisites || []).every(id => ids.has(id));
}
export function isForestUnlocked(cleared = []) {
  if (!BOSS_REGION_PREREQUISITES_ENABLED) return true;
  return [0, 1, 2].some(d => cleared.map(Number).includes(campaignFinalId(d)));
}

/**
 * 噩梦模式解锁条件：通关全部「困难」关卡（两条线的 1-1~4-4 + 困难最终关）。
 * 模式本身尚未开放，界面点击现在只提示"暂未开放"。
 */
export function isNightmareUnlocked(cleared = []) {
  const ids = new Set(cleared.map(Number));
  for (const route of [0, 1]) {
    for (let index = 1; index <= 16; index++) {
      if (!ids.has(campaignStageId(route, index, 2))) return false;
    }
  }
  return ids.has(campaignFinalId(2));
}

// 冒险大陆敌方单位血量全局系数（1 = 原值）。
//   敌方单位血量 = 参考卡 card_hp × CRAFT_QUALITY_MULT[adventureQuality(stage, 本关第几个出怪)] × ADVENTURE_ENEMY_HP_SCALE
// 想整体削弱就把数字调小（0.8 = 削 20%，0.7 = 削 30%）。
export const ADVENTURE_ENEMY_HP_SCALE = 1;

// 冒险大陆"基地"血量（2026-10-07 起）：每关一张表。
// 之前试过公式（等比缩小 → 旧值>5000 走缓坡），但目标数值里同一输入对应多个结果
// （2-3 与 2-4 的 stage.hp 都是 100；3-3 与 3-4 的旧基地都是 12000），公式做不到，只能查表。
//
// 怪物线：下面 16 个数对应 index 1~16（1-1 … 4-4）；最终关单独 9000。
// 植物线：怪物线 × ADVENTURE_PLANT_HP_RATIO；最终关不参与，两条线都 9000。
const ADVENTURE_MONSTER_BASE_HP = Object.freeze([
  750, 900, 2225, 1125, 2250, 2550, 3000, 3750,
  4800, 6650, 7330, 8550, 7890, 8000, 8350, 8750,
]);
const ADVENTURE_FINAL_BASE_HP = 9000;
export const ADVENTURE_PLANT_HP_RATIO = 0.85;

export function adventureBaseHp(stage) {
  const adv = stage?.adventure;
  if (!adv) return 400;
  if (adv.final) return ADVENTURE_FINAL_BASE_HP;
  const monsterHp = ADVENTURE_MONSTER_BASE_HP[Number(adv.index) - 1];
  if (!Number.isFinite(monsterHp)) return 400;
  return Number(adv.route) === 0 ? Math.round(monsterHp * ADVENTURE_PLANT_HP_RATIO) : monsterHp;
}

// Keep existing craft-quality enum: 普通=2, 优秀=4, 精良=3, 完美=5.
export function adventureQuality(stage, ordinal = 0) {
  const { difficulty, act, final } = stage.adventure;
  const pool = difficulty === 0 ? [2] : difficulty === 1 ? [2, 4]
    : final ? [5] : act === 1 ? [4] : act === 2 ? [4, 3] : act === 3 ? [4, 4, 3, 3, 5] : [3, 5];
  return pool[Math.abs(ordinal) % pool.length];
}

// Each tuple is [card ID, document row, document column]; omitted coordinates use (3,2).
const base = [
  [[1,3,3],[1,5,3],[2,3,2],[7,4,4],[4,2,5]],
  [[2,2,2]],
  [[2,1,2],[7,3,5],[4,1,5]],
  [[1,4,4],[4,3,5]],
  [[2,3,2],[1,2,3],[1,3,4],[1,4,4]],
];
export function adventureWaveTemplate(stage) {
  const a = stage.adventure;
  if (!a) return null;
  // 难度调整只在最外层做一次：否则怪物线镜像时会连带把"植物线专属"的后排补怪也镜像过去。
  return applyAdventureDifficulty(stage, baseAdventureWaves(stage));
}

function baseAdventureWaves(stage) {
  const a = stage.adventure;
  if (a.final) return finalAdventureWaves();
  if (a.route === 1) return monsterMirrorWaves(baseAdventureWaves({ ...stage, adventure: { ...a, route: 0 } }));
  if (a.index > 5) return designedPlantWaves(a.index);
  const waves = base.map(w => w.map(entry => [...entry]));
  if (a.index === 2) { waves[0][4] = [9,4,3]; waves[2].push([4,2,5]); }
  if (a.index === 3) { waves[0].push([14,4,3]); waves[1].push([9,4,5]); waves[2][2] = [4,5,5]; }
  if (a.index === 4) {
    waves[1] = [[2,1,2],[15,1,1]];
    waves[2] = [[2,2,2],[7,3,5],[4,1,5],[30,3,3]];
    waves[3] = [[1,4,4],[4,5,3],[30,2,3],[30,1,3]];
    waves[4] = [[2,3,2],[1,2,3],[1,3,4],[1,5,4],[30,4,3]];
  }
  if (a.index === 5) {
    waves[0].push([17,3,5]); waves[1].push([15,3,1]); waves[2].push([30,3,3]);
    waves[3] = [[1,4,4],[17,3,5]]; waves[4].push([30,3,3]);
  }
  return waves;
}

// Desired cell, above, below; then each rear column, then each forward column.
export function adventurePlacementCells(row, column) {
  const r = Math.max(1, Math.min(5, Math.round(row))), c = Math.max(1, Math.min(5, Math.round(column)));
  const rows = [r];
  for (let i = r - 1; i >= 1; i--) rows.push(i);
  for (let i = r + 1; i <= 5; i++) rows.push(i);
  const columns = [c];
  for (let i = c + 1; i <= 5; i++) columns.push(i);
  for (let i = c - 1; i >= 1; i--) columns.push(i);
  return columns.flatMap(col => rows.map(lane => ({ lane: lane - 1, col: col + 6 })));
}
