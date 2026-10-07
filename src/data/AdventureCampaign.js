import { designedPlantWaves, monsterMirrorWaves, finalAdventureWaves, adventureDesignSummary } from './AdventureStageDesign.js';
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

// 冒险大陆敌方单位血量全局系数（1 = 原值）。
//   敌方单位血量 = 参考卡 card_hp × CRAFT_QUALITY_MULT[adventureQuality(stage, 本关第几个出怪)] × ADVENTURE_ENEMY_HP_SCALE
// 想整体削弱就把数字调小（0.8 = 削 20%，0.7 = 削 30%）。
export const ADVENTURE_ENEMY_HP_SCALE = 1;

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
  if (a.final) return finalAdventureWaves();
  if (a.route === 1) return monsterMirrorWaves(adventureWaveTemplate({ ...stage, adventure: { ...a, route: 0 } }));
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
