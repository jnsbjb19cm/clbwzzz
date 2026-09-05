/**
 * 战斗场地分层：场景底图 + 左右柱。
 * 场景规则：
 *  - PVP：随机场景（草地/黄沙/冰川），战斗 UI 显示地图名
 *  - PVE：始终草地（左柱为蘑菇）
 *  - BOSS：按 BOSS 定义（多特=草地、沃里尔=黄沙、安娜=冰川、火焰=火山(未做)、树妖=黄沙）
 */
export const COLUMN_RIGHT_W = 370;
export const PROVIDED_GRASS_BACKGROUND_URL = new URL(
  '../../resources/background/grassbg.png',
  import.meta.url,
).href;

export const SCENE_SETS = Object.freeze({
  grass: {
    base: 'grassbg.png',
    left: 'mushroomleft.png',
    right: 'mushroomright.png',
    label: '草地',
  },
  rock: {
    base: 'backrock.png',
    left: 'leftrock.png',
    right: 'rightrock.png',
    label: '黄沙',
  },
  ice: {
    base: 'backice.png',
    left: 'leftice.png',
    right: 'rightice.png',
    label: '冰川',
  },
  volcano: {
    // 火山图尚未制作：先用草地素材占位
    base: 'grassbg.jpg',
    left: 'mushroomleft.png',
    right: 'mushroomright.png',
    label: '火山',
  },
});

/** BOSS → 场景（痴情的多特=草地、愤怒的沃里尔=黄沙、疯狂的安娜=冰川、火焰的复仇=火山、树妖洛丽塔=黄沙） */
export const BOSS_SCENE = Object.freeze({
  boss_dot: 'grass',
  boss_gravo: 'rock',
  boss_ice: 'ice',
  boss_fire: 'volcano',
  boss_forest: 'rock',
});

/** PVP 随机池（火山未做不参与随机） */
const PVP_SCENE_POOL = ['grass', 'rock', 'ice'];

/**
 * @param {object} stage
 * @param {{ trainingMode?: boolean, pvpMode?: boolean, useMap?: boolean, bossId?: string, trainingMap?: string }} opts
 */
export function resolveBattleBackground(
  stage,
  { trainingMode = false, pvpMode = false, useMap = true, bossId = null, trainingMap = null } = {},
) {
  const isBoss = Boolean(bossId) || stage?.stage_type === 2;

  // 训练营换背景：trainingMap 指定固定场景（grass/rock/ice）优先。
  // 必须返回与普通场景完全相同的字段名；旧代码只返回 columnLeftUrl/columnRightUrl，
  // BattleView 实际读取 leftColumnUrl/rightColumnUrl + showRightColumn，导致训练营左右基地柱子消失。
  if (trainingMap && SCENE_SETS[trainingMap]) {
    const scene = SCENE_SETS[trainingMap];
    const isGrass = trainingMap === 'grass';
    const baseUrl = isGrass
      ? PROVIDED_GRASS_BACKGROUND_URL
      : `/battle/background/${scene.base}`;
    const leftColumnUrl = `/battle/background/${scene.left}`;
    const rightColumnUrl = `/battle/background/${scene.right}`;

    return {
      baseUrl,
      grassUrl: baseUrl,
      grassCorridorUrl: '/battle/background/grassbg.png',
      useMap: false,
      mapUrl: baseUrl,
      sceneKey: trainingMap,
      sceneLabel: scene.label,
      label: scene.label,
      leftColumnUrl,
      rightColumnUrl,
      // 兼容旧调用名。
      leftUrl: leftColumnUrl,
      rightUrl: rightColumnUrl,
      columnLeftUrl: leftColumnUrl,
      columnRightUrl: rightColumnUrl,
      showLeftColumn: true,
      showRightColumn: true,
      columnRightW: COLUMN_RIGHT_W,
      mapIndex: 1,
      isBoss: false,
    };
  }

  let sceneKey = 'grass';
  if (bossId) {
    sceneKey = BOSS_SCENE[bossId] || 'grass';
  } else if (pvpMode) {
    sceneKey = PVP_SCENE_POOL[Math.floor(Math.random() * PVP_SCENE_POOL.length)];
  }

  const scene = SCENE_SETS[sceneKey];
  const baseUrl = sceneKey === 'grass'
    ? PROVIDED_GRASS_BACKGROUND_URL
    : `/battle/background/${scene.base}`;

  return {
    baseUrl,
    grassUrl: baseUrl,
    grassCorridorUrl: '/battle/background/grassbg.png',
    useMap: false,
    mapUrl: baseUrl,
    sceneKey,
    sceneLabel: scene.label,
    leftColumnUrl: `/battle/background/${scene.left}`,
    rightColumnUrl: `/battle/background/${scene.right}`,
    showLeftColumn: true,
    showRightColumn: !isBoss,
    columnRightW: COLUMN_RIGHT_W,
    mapIndex: 1,
    isBoss,
  };
}
