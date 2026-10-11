/**
 * 2026-10-11：中间中立柱强制与"当前地图场景"一致
 *
 * 背景：一整天排查下来，"地图→中间柱"这条链在各个模块里有多份实现与多份地图编号，
 *       服务端给过来的柱子 id 与房间/战场显示的地图对不上（房间=8，柱子却是沙滩的 1004）。
 *       反复改服务端来源都没能收敛。
 * 做法：客户端直接**兜底纠正** —— 战斗中周期性检查中立柱，
 *       如果它的 cardId 与本场景（[data-round3-scene] 或 __pvpMapScene）应有的柱子不一致，
 *       就把它的显示身份改成正确的那根（cardId / res / 名称 / 美术），血量沿用 220 不变。
 *
 * 说明：这是一层"显示纠正"，如果日后把 7 份地图数据合并成单一来源，本模块可以整体删除。
 */

const PILLAR_BY_SCENE = Object.freeze({
  grass: 1002,   // 木桩 -> 木精灵
  ice: 1000,     // 冰山 -> 冰精灵
  rock: 1003,    // 黄沙（另可能随机沙丘，见下）
  forest: 1002,  // 古老密林 -> 木桩 -> 木精灵
  fire: 1001,    // 火焰 -> 火山 -> 火精灵
  beach: 1004,   // 沙滩 -> 沙丘 -> 沙精灵
  temple: 1000,  // 海底神殿（随机，见下）
});
const RANDOM_BY_SCENE = Object.freeze({
  rock: [1003, 1004],                        // 黄沙：土块/沙丘
  temple: [1000, 1001, 1002, 1003, 1004],    // 海底神殿：五种
});
const PILLAR_NAME = Object.freeze({ 1000: '冰山', 1001: '火山', 1002: '木桩', 1003: '土块', 1004: '沙丘' });
const PILLAR_IDS = [1000, 1001, 1002, 1003, 1004];
const PATCHED_FLAG = Symbol.for('clbwz.pillarSceneForcer20261011');

function currentScene() {
  const dom = document?.querySelector?.('[data-round3-scene]')?.dataset?.round3Scene ?? null;
  if (dom) return String(dom);
  const g = String(window?.__pvpMapScene || '');
  if (PILLAR_BY_SCENE[g] || RANDOM_BY_SCENE[g]) return g;
  const btnId = document?.querySelector?.('.dice-btn')?.dataset?.mapId ?? null;
  const idToScene = { '2': 'grass', '4': 'ice', '7': 'rock', '8': 'forest', '9': 'fire', '10': 'beach', '11': 'temple' };
  return idToScene[String(btnId)] ?? 'grass';
}

/** 本场景应有的柱子 id（随机场景每次调用可能不同；已有的不重复换） */
function expectedPillar(scene, currentIds = []) {
  const rand = RANDOM_BY_SCENE[scene];
  if (rand) return expectedPillarForArray(rand, currentIds);
  const one = PILLAR_BY_SCENE[scene];
  return Number.isInteger(one) ? one : null;
}
function expectedPillarForArray(arr, currentIds) {
  const existing = arr.find((id) => currentIds.includes(id));
  return existing ?? arr[Math.floor(Math.random() * arr.length)];
}

function forcePillars() {
  const wrap = document.querySelector('.battlefield-wrap');
  const engine = wrap?.__battleView?.engine;
  const units = engine?.units;
  if (!Array.isArray(units) || !units.length) return false;
  const scene = currentScene();
  const pillars = units.filter((u) => u && (u.team === 'neutral' || u.pvpNeutral) && !u.isPvpBarrier);
  if (!pillars.length) return false;
  const currentIds = pillars.map((u) => Number(u.cardId));
  const id = expectedPillar(scene, currentIds);
  if (!id) return false;
  let changed = 0;
  for (const u of pillars) {
    if (Number(u.cardId) === id) continue;
    // 关键：渲染取美术会读 unit.card（只改 cardId/res 不够 ✗）
    // -> 必须把 unit.card 换成目标柱子对应的卡对象 ✔
    const db = globalThis.__clbwzAppInstance?.db ?? null;
    const nextCard = db?.getById?.(id) ?? null;
    u.cardId = id;
    u.res = id;
    u.name = nextCard?.name ?? PILLAR_NAME[id] ?? u.name;
    u.spriteRes = null;
    u.artRes = id;
    if (nextCard) {
      u.card = nextCard;
      u.atkStyle = nextCard.atkStyle ?? u.atkStyle;
      u.viewType = nextCard.viewType ?? u.viewType;
      u.cardType = nextCard.type ?? u.cardType;
    }
    u.__pillarForced = true;
    u.__pillarScene = scene;
    changed += 1;
  }
  if (changed) console.info('[clbwz] 中间柱已按场景纠正:', scene, '->', PILLAR_NAME[id], '(' + id + ')', '改了', changed, '根');
  return changed > 0;
}

export function installBattlePillarSceneForcer20261011() {
  if (globalThis[PATCHED_FLAG]) return;
  globalThis[PATCHED_FLAG] = true;
  let lastScene = null;
  setInterval(() => {
    try {
      const scene = currentScene();
      const sceneChanged = scene !== lastScene;
      lastScene = scene;
      // 场景变化时强制重算；平时只在发现不一致时纠正
      const wrap = document.querySelector('.battlefield-wrap');
      const units = wrap?.__battleView?.engine?.units ?? [];
      const pillars = units.filter((u) => u && (u.team === 'neutral' || u.pvpNeutral) && !u.isPvpBarrier);
      const wrong = pillars.length > 0 && pillars.some((u) => {
        const want = PILLAR_BY_SCENE[scene];
        return Number.isInteger(want) && Number(u.cardId) !== want && !RANDOM_BY_SCENE[scene];
      });
      if (sceneChanged || wrong) forcePillars();
    } catch { /* 忽略 */ }
  }, 600);
  console.info('[clbwz] 中间柱场景纠正已启用（PILLAR_BY_SCENE）');
}
