// Ordinary-card encounters only. A chapter's fourth node is a challenge, never a BOSS battle.
// Five-wave cadence and paired HP budgets stay shared between the two routes.
export const PLANT_STAGE_DESIGNS = [
  ['初识防线','前排掩护、两翼射击；先处理远程单位。'],
  ['投手加入','南瓜加入后排；尝试远近组合。'],
  ['补给阵地','小麦与投手配合；不要放任后排成长。'],
  ['西瓜突围','普通单位真·西瓜太郎多路推进，考验防线补位。'],
  ['寒冰前哨','寒冰椰子与地刺配合；优先处理控制单位。'],
  ['错峰夹击','上、下路轮流推进，中路留出补位窗口。',2,18,30,17,9],
  ['补给护卫','医生支援轻装阵线；集中火力拆除支援。',2,18,16,22,17],
  ['坚盾连阵','巨盾掩护冰系后排；第五波集中检验破阵能力。',21,18,30,22,54],
  ['交叉火网','三头仙人掌加入，注意分散摆放。',21,25,16,19,17],
  ['地底来客','钻地大蒜与地面部队交错；预留后排补位资源。',2,25,43,22,18],
  ['空地交替','水蜜桃出现在侧翼；兼顾空中与地面。',21,18,40,36,25],
  ['炮阵试炼','玉米炮手与巨盾组成阵地，突破侧翼打开缺口。',21,70,30,36,54],
  ['树荫防线','树精守卫支援前排；不要把火力分得过散。',21,70,69,68,25],
  ['蘑菇回廊','蘑菇仙人与地下单位掩护推进，分批处理。',21,58,43,36,70],
  ['剑客合击','猕猴桃剑客与菠萝勇士交替，控制单位作掩护。',21,70,69,68,54],
  ['古树攻坚','战争古树与全线支援组合；普通怪物的阶段难关。',21,70,55,103,54],
].map(([name,tip,front,ranged,raider,support,special],index)=>({name,tip,index:index+1,front,ranged,raider,support,special}));

// Use genuinely same-tier monster cards, keeping their existing models/skills and database stats.
// Some tiers lack an exact role equivalent; HP and wave DPS are paired by the spawn layer.
const MONSTER_EQUIVALENT = {
  1:83,2:6,4:83,7:5,9:62,14:86,15:62,16:74,17:86,18:92,
  19:24,21:27,22:26,25:63,30:31,36:51,40:23,43:41,54:46,
  55:116,58:118,68:24,69:74,70:20,103:39,
};
export function monsterMirrorWaves(plantWaves) {
  return plantWaves.map(wave=>wave.map(([id,row,col])=>{
    const counterpart=MONSTER_EQUIVALENT[id];
    if (!counterpart) throw new Error(`No monster counterpart for campaign card ${id}`);
    return [counterpart,row,col,id]; // fourth field is HP / wave-DPS reference, never a spawned extra card
  }));
}

/**
 * 关卡级"某张卡刷得太快太多"瘦身（2026-10-09 用户要求）。
 *   2-4 花生神射手(18)、3-4 玉米炮手(70) 原来 5 波里出现 6 次、而且有时同一波同时 2 只
 *   → 现在：同一波最多 1 只、整个循环最多 3 只（保留最先出现的 3 次）。
 * 只在植物线模板上做，怪物线是它的镜像，所以两条线一起生效。
 */
const STAGE_CARD_THINNING = Object.freeze({
  8: { cardId: 18, maxPerWave: 1, maxPerCycle: 3 },
  12: { cardId: 70, maxPerWave: 1, maxPerCycle: 3 },
});

function thinStageCards(index, waves) {
  const cfg = STAGE_CARD_THINNING[Number(index)];
  if (!cfg) return waves;
  let keptTotal = 0;
  return waves.map((wave) => {
    let seenInWave = 0;
    return wave.filter(([id]) => {
      if (Number(id) !== cfg.cardId) return true;
      seenInWave += 1;
      if (seenInWave > cfg.maxPerWave) return false;
      keptTotal += 1;
      return keptTotal <= cfg.maxPerCycle;
    });
  });
}

/**
 * 关卡级出怪间隔覆盖（秒）。2026-10-09 用户要求：2-4 / 3-4 波次稍微延后。
 * 只覆盖这两个关卡 index；返回 null 表示用全局 WAVE_INTERVAL(10s)。
 */
const ADVENTURE_WAVE_INTERVAL_OVERRIDE = Object.freeze({ 8: 12, 12: 12 });

export function adventureWaveInterval(stage) {
  const index = Number(stage?.adventure?.index);
  const value = Number(ADVENTURE_WAVE_INTERVAL_OVERRIDE[index]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function designedPlantWaves(index) {
  const p=PLANT_STAGE_DESIGNS[index-1];
  if (!p?.front) return null; // first five are authored verbatim in AdventureCampaign.js
  const flank=index%2 ? 1 : 5, opposite=6-flank;
  const waves=[
    [[p.front,3,2],[p.ranged,2,4],[p.ranged,4,4],[p.raider,3,4]],
    [[p.raider,flank,4],[p.special,opposite,5]],
    [[p.front,2,2],[p.support,3,5],[p.raider,opposite,4],[p.ranged,5,4]],
    [[p.special,flank,5],[p.raider,2,4],[p.ranged,4,3]],
    [[p.front,4,2],[p.ranged,1,4],[p.raider,3,4],[p.ranged,5,4],[p.support,2,5]],
  ];
  // Gradual density ramp: 18 → 20 ordinary cards/cycle; challenge nodes add only two.
  if(index>=9)waves[1].push([p.ranged,3,4]);
  if(index>=13)waves[3].push([p.raider,opposite,4]);
  if(index%4===0) { waves[2].push([p.special,4,5]); waves[4].push([p.raider,opposite,4]); }
  return thinStageCards(index, waves);
}

export function finalAdventureWaves() {
  return [
    [[21,3,2],[18,2,4],[83,4,4],[27,3,4]],
    [[43,1,4],[12,5,4],[17,3,5]],
    [[21,2,2],[70,4,5],[26,3,5],[69,5,4]],
    [[58,1,3],[98,5,4],[30,2,4],[41,4,4]],
    [[21,3,2],[55,2,4],[105,4,4],[54,1,5],[51,5,5],[18,3,4]],
  ];
}

// ==================== 按难度调整冒险阵型（2026-10-07）====================
// 简单：原阵型。普通/困难：左右镜像微调 + 按下面规则补后排。
export const ADVENTURE_REAR_COL = 5;
const MINE_CARD_ID = 61;   // 黑铁土豆雷（植物卡，铺在植物线后排）
const SPRAY_CARD_ID = 62;  // 喷喷怪（怪物卡，站在怪物线挑战关/最终关后排）
// 补后排时的落点优先级：先中路，再两侧，尽量避免和已有单位同格。
const REAR_LANE_ORDER = [3, 1, 5, 2, 4];

function rearCountOf(wave) {
  return wave.filter((entry) => Number(entry[2]) >= ADVENTURE_REAR_COL).length;
}
function lanesTakenAt(wave, col) {
  return new Set(wave.filter((entry) => Number(entry[2]) === col).map((entry) => Number(entry[1])));
}

/** 一个 5 波循环里最多补多少只（2026-10-09 用户要求：5 波之内最多 8 只）。 */
export const ADVENTURE_REINFORCE_MAX_PER_CYCLE = 8;

/**
 * 每波往后排空位补 count 只；该波后排已经 >2 只就整波跳过（用户定的规则）。
 * maxPerCycle：整个循环（5 波）的补充总量上限 —— 困难原本 2/波×5 = 10 只会超，现在封到 8。
 */
export function reinforceRear(waves, cardId, count, { maxPerCycle = Number.POSITIVE_INFINITY } = {}) {
  let placed = 0;
  return waves.map((wave) => {
    if (rearCountOf(wave) > 2) return wave;
    const budget = Math.max(0, Math.floor(maxPerCycle) - placed);
    if (budget <= 0) return wave;
    const taken = lanesTakenAt(wave, ADVENTURE_REAR_COL);
    const extra = [];
    for (const lane of REAR_LANE_ORDER) {
      if (extra.length >= Math.min(count, budget)) break;
      if (taken.has(lane)) continue;
      extra.push([cardId, lane, ADVENTURE_REAR_COL]);
    }
    placed += extra.length;
    return extra.length ? [...wave, ...extra] : wave;
  });
}

/** 左右镜像：row → 6-row。单位、列、强度都不变，只是站位镜像。 */
export function mirrorLanes(waves) {
  return waves.map((wave) => wave.map((entry) => {
    const [id, row, col, ...rest] = entry;
    return [id, 6 - Number(row), col, ...rest];
  }));
}

/**
 * 同一波里两只怪刷在同一格 → 把后者挪到最近的空格（不改数量、不改波次时间）。
 *
 * 2026-10-07 排查 2-4 时发现：designedPlantWaves 的"补怪"和它自带的编排撞格 ——
 *   · `index % 4 === 0` 的关（2-4 / 3-4 / 4-4）第 5 波：补进来的 [p.raider, opposite, 4]
 *     在 opposite === 1 时正好压在已有的 [p.ranged, 1, 4] 上
 *     （植物线 2-4 简单第 5 波 (1,4) 同时刷 18 和 30）；
 *   · 奇数关（2-3 / 3-1 / 3-3 / 4-1 / 4-3）第 3 波：[p.raider, opposite, 4] 与 [p.ranged, 5, 4] 撞格。
 * 全关卡共 48 处（简单/普通/困难都有，因为该函数与难度无关）。
 * WaveManager 的换算是 `lane = row-1, col = column + 6`，同格就是真的两只怪叠在一起。
 *
 * 这里在最外层统一兜一遍：同格就找最近的空格（优先上下换行，其次换列），
 * **没有撞格的编队一个字节都不动**。
 */
export function dedupeWaveCells(waves) {
  const all = waves.flat();
  const lanes = [...new Set(all.map((e) => Number(e[1])))].sort((a, b) => a - b);
  const cols = [...new Set(all.map((e) => Number(e[2])))].sort((a, b) => a - b);
  return waves.map((wave) => {
    const used = new Set();
    return wave.map((entry) => {
      const [id, row, col, ...rest] = entry;
      const lane = Number(row);
      const column = Number(col);
      const key = (l, c) => `${l},${c}`;
      if (!used.has(key(lane, column))) {
        used.add(key(lane, column));
        return [id, lane, column, ...rest];
      }
      // 撞格：同列上下找最近空格
      for (let distance = 1; distance <= lanes.length; distance += 1) {
        for (const candidateLane of [lane - distance, lane + distance]) {
          if (!lanes.includes(candidateLane)) continue;
          if (used.has(key(candidateLane, column))) continue;
          used.add(key(candidateLane, column));
          return [id, candidateLane, column, ...rest];
        }
      }
      // 再退一步：同行的其它列
      for (const candidateCol of cols) {
        if (candidateCol === column || used.has(key(lane, candidateCol))) continue;
        used.add(key(lane, candidateCol));
        return [id, lane, candidateCol, ...rest];
      }
      used.add(key(lane, column));
      return [id, lane, column, ...rest];
    });
  });
}

/**
 * 按 `stage.adventure.difficulty` 调整波次：
 *  - 简单(0)：原样；
 *  - 普通(1)/困难(2)：先左右镜像；
 *  - 植物线：后排补黑铁土豆雷（普通 +1/波、困难 +2/波）；
 *  - 怪物线：普通难度的挑战关(node 4)与最终关，后排补 1 只喷喷怪。
 */
export function applyAdventureDifficulty(stage, waves) {
  const a = stage?.adventure;
  if (!a || !Array.isArray(waves) || waves.length === 0) return waves;
  const difficulty = Number(a.difficulty) || 0;
  if (difficulty <= 0) return waves;

  let out = mirrorLanes(waves);
  // 最终关是"双线会合"（route 2），按怪物线那侧处理。
  const monsterSide = Number(a.route) === 1 || a.final === true;
  const isChallenge = a.final === true || Number(a.node) === 4;
  if (Number(a.route) === 0) {
    out = reinforceRear(out, MINE_CARD_ID, difficulty >= 2 ? 2 : 1, { maxPerCycle: ADVENTURE_REINFORCE_MAX_PER_CYCLE });
  } else if (monsterSide && difficulty === 1 && isChallenge) {
    out = reinforceRear(out, SPRAY_CARD_ID, 1);
  }
  return out;
}

/**
 * 补怪在**场上**的数量上限（2026-10-09 用户要求）：
 *   黑铁土豆雷 普通 ≤ 3、困难 ≤ 5（简单本来就不补怪）。
 * 波次是无限循环的，光靠"每波补 N 只"会越堆越多，所以在出怪时按场上存活数卡上限。
 */
export const ADVENTURE_REINFORCE_ALIVE_CAP = Object.freeze({
  [MINE_CARD_ID]: Object.freeze({ 1: 3, 2: 5 }),
});

/** 返回该卡在当前难度的在场上限；没有上限返回 null */
export function adventureReinforceAliveCap(stage, cardId) {
  const table = ADVENTURE_REINFORCE_ALIVE_CAP[Number(cardId)];
  if (!table) return null;
  const difficulty = Number(stage?.adventure?.difficulty) || 0;
  const cap = Number(table[difficulty]);
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

export function adventureDesignSummary(route,index) {
  const p=PLANT_STAGE_DESIGNS[index-1];
  if(!p)return {name:'双线会合',tip:'植物与怪物混编的最终难关，无独立 BOSS。'};
  return {name:p.name,tip:route===0?p.tip:`对标植物线 ${Math.ceil(index/4)}-${(index-1)%4+1}：同卡牌等级、同波次、同生命预算与基地血量；使用怪物单位技能组合。`};
}
