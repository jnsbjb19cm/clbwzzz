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

/**
 * 冒险大陆"基地"血量系数：沿用现有 stage.hp 曲线，只调系数（不在结果上再单乘）。
 * 原公式 calcHeroHp 的系数 = 50 × BATTLE_STAT_SCALE(0.75) = 37.5；
 * 终关 stage.hp=580 → 21750，太高。目标终关 5550 → 系数 = 37.5 × (5550 / 21750) = 9.568965517241379。
 * 例：1-1=400、1-3=1435、2-3=2679、4-4=4401、最终关=5550。
 */
export const ADVENTURE_BASE_HP_COEFFICIENT = 9.568965517241379;

/** 旧公式（calcHeroHp = stage.hp × 37.5）下的基地血量：只用来判断"改系数之前是否超过 5000"。 */
const LEGACY_HERO_HP_COEFFICIENT = 37.5;

/** 改之前基地血量就超过这个值的关卡，不走等比缩小，改走"缓坡"。 */
export const ADVENTURE_HIGH_HP_THRESHOLD = 5000;
/** 缓坡终点：最终关（旧 21750）落在 8000。 */
export const ADVENTURE_HIGH_HP_MAX = 8000;
// 缓坡斜率 = (8000 - 5000) / (21750 - 5000)，21750 = 最终关 stage.hp 580 在旧公式下的基地血量。
const ADVENTURE_HIGH_HP_SLOPE = (ADVENTURE_HIGH_HP_MAX - ADVENTURE_HIGH_HP_THRESHOLD)
  / (580 * LEGACY_HERO_HP_COEFFICIENT - ADVENTURE_HIGH_HP_THRESHOLD);

/**
 * 冒险基地血量：
 *  - 旧公式下 ≤5000 的关卡：沿用等比缩小（ADVENTURE_BASE_HP_COEFFICIENT）。
 *  - 旧公式下 >5000 的关卡：从 5000 缓慢升到 8000（最终关 = 8000），不再一起被压到 5000 档。
 */
export function adventureBaseHp(stage) {
  const hp = Number(stage?.hp);
  if (!Number.isFinite(hp) || hp <= 0) return 400;
  const legacyHp = hp * LEGACY_HERO_HP_COEFFICIENT;
  if (legacyHp > ADVENTURE_HIGH_HP_THRESHOLD) {
    return Math.round(
      ADVENTURE_HIGH_HP_THRESHOLD
      + (legacyHp - ADVENTURE_HIGH_HP_THRESHOLD) * ADVENTURE_HIGH_HP_SLOPE,
    );
  }
  return Math.max(400, Math.floor(hp * ADVENTURE_BASE_HP_COEFFICIENT));
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
