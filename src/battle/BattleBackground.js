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
  // 2026-10-11 用户：新增 4 张地图（素材从 resources/background 复制到 assets/battle/background，
  // 因为战斗实际是从 /battle/background/ 取图的）
  forest: { base: 'backforest.png', left: 'leftforest.png', right: 'rightforest.png', label: '古老密林' },
  fire:   { base: 'backfire.png',   left: 'leftfire.png',   right: 'rightfire.png',   label: '火焰' },
  beach:  { base: 'backbeach.png',  left: 'leftbeach.png',  right: 'rightbeach.png',  label: '沙滩' },
  temple: { base: 'backtemple.png', left: 'lefttemple.png', right: 'righttemple.png', label: '海底神殿' },
  volcano: {
    // 2026-10-11：火焰素材已就位（原来用草地占位）
    base: 'backfire.png',
    left: 'leftfire.png',
    right: 'rightfire.png',
    label: '火山',
  },
});

/** BOSS → 场景（痴情的多特=草地、愤怒的沃里尔=黄沙、疯狂的安娜=冰川、火焰的复仇=火山、树妖洛丽塔=黄沙） */
export const BOSS_SCENE = Object.freeze({
  boss_dot: 'grass',
  boss_gravo: 'fire',   // 2026-10-11 用户：愤怒的沃里尔改为「火焰」地图（原黄沙）
  boss_ice: 'ice',
  boss_fire: 'volcano',
  boss_forest: 'rock',
  // 2026-10-11 用户：海洋神殿组 —— 除「狂暴的刀牙」用沙滩外，其余都是海底神殿
  boss_shark: 'beach',      // 狂暴的刀牙
  boss_lobster: 'temple',   // 龙虾战士
  boss_bluebaby: 'temple',  // 失控的蓝贝贝
  boss_turtle: 'temple',    // 龟老师
  boss_princess: 'temple',  // 人鱼公主琴音
});

/**
 * 2026-10-11 用户：「房间 roll 了 50 次都没有新地图 / 沃里尔也没修」
 * 真凶：房间 roll 会把地图 id 塞进 stage.mapBg_res（PvpBattleBridgeFinal.js:149
 *       mapBg_res: Number(this.pvp.mapId) || 4），但本函数**完全不读它** ✗，
 *       自己又随机 roll 一次 → 两套机制打架，房间选的地图永远不生效 ✗
 * 修：优先采用 stage.mapBg_res / window.__pvpMapScene 指定的场景 ✔
 */
export const MAP_BG_RES_TO_SCENE = Object.freeze({
  1: 'grass',   // 密林（老关卡默认）
  2: 'grass',   // 草地（房间 roll 用 2）
  4: 'ice',     // 冰川
  7: 'rock',    // 黄沙
  8: 'forest',  // 古老密林（新）
  9: 'fire',    // 火焰（新）
  10: 'beach',  // 沙滩（新）
  11: 'temple', // 海底神殿（新）
});

/** PVP 随机池（火山未做不参与随机） */
// 2026-10-11 用户：随机地图也要包含新地图
const PVP_SCENE_POOL = ['grass', 'rock', 'ice', 'forest', 'fire', 'beach', 'temple'];

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

  // 优先级：BOSS 指定 > 关卡/房间自带的地图 id > PVP 随机
  // （2026-10-11：新增中间这一档，房间 roll 出来的地图才会真正生效 ✔）
  let sceneKey = 'grass';
  const explicitScene = (typeof window !== 'undefined' && window.__pvpMapScene)
    ? String(window.__pvpMapScene)
    : MAP_BG_RES_TO_SCENE[Number(stage?.mapBg_res)];
  if (bossId) {
    sceneKey = BOSS_SCENE[bossId] || 'grass';
  } else if (explicitScene && SCENE_SETS[explicitScene]) {
    sceneKey = explicitScene;
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
    label: scene.label,   // 2026-10-11：原来这里漏了 label，界面上取地图名会拿到 undefined ✗
    leftColumnUrl: `/battle/background/${scene.left}`,
    rightColumnUrl: `/battle/background/${scene.right}`,
    showLeftColumn: true,
    showRightColumn: !isBoss,
    columnRightW: COLUMN_RIGHT_W,
    mapIndex: 1,
    isBoss,
  };
}
