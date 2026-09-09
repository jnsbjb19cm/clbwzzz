import { CoopBossBattle } from './CoopBossBattle.js';

const { BattleUnit } = await import('../../src/battle/BattleUnit.js');

const PATCH_FLAG = Symbol.for('clbwzzz.bossSummonRules20260819');
const ENEMY_DEPLOY_MIN_COL = 7;
const ENEMY_DEPLOY_MAX_COL = 11;
const ALIEN_SENTINEL_CARD_ID = 38;
const ALIEN_SENTINEL_DELAY = 5;
const STONE_GIANT_CARD_ID = 35;
const MONSTER_TOASTER_CARD_ID = 20;
const WALNUT_GUARD_CARD_ID = 2;
const BURROW_CARD_IDS = new Set([43, 41]); // 钻地大蒜 / 地道工兵
const REAR_SUPPORT_CARD_IDS = new Set([36]); // 蒲公英精灵
const PHANTOM_FLYING_NINJA_CARD_ID = 45; // 幻.飞行忍者
const GIANT_HEAD_CARD_ID = 5; // 巨头怪
const SLIME_NINJA_CARD_ID = 28; // 软泥忍者怪
const DANDELION_CARD_ID = 36; // 蒲公英精灵

// 循环波次里的特殊召唤数量：简单/普通/困难。
const DIFFICULTY_BURROW_COUNT = Object.freeze({ 简单: 1, 普通: 2, 困难: 5 });
const DIFFICULTY_FLYING_NINJA_COUNT = Object.freeze({ 简单: 3, 普通: 5, 困难: 5 });

// 每个 BOSS 固定最多 10 种部署卡，单位数量另外计算。
const FIXED_HIGH_CARD_IDS = Object.freeze([36, 32, 54, 41, 43, 45, 64, MONSTER_TOASTER_CARD_ID]);
const RANDOM_HIGH_CARD_IDS = Object.freeze([73, 46, 105, 100, 102]);
const LOW_CARD_IDS = Object.freeze([5, 28, 12, 16, 69, 3, 25, 27, 21]);
const BONUS_CARD_IDS = Object.freeze([STONE_GIANT_CARD_ID, 39, 51, WALNUT_GUARD_CARD_ID]);

export const BOSS_MINION_CARD_IDS = Object.freeze([
  ...new Set([
    ...FIXED_HIGH_CARD_IDS,
    ...RANDOM_HIGH_CARD_IDS,
    ...LOW_CARD_IDS,
    ...BONUS_CARD_IDS,
    ALIEN_SENTINEL_CARD_ID,
  ]),
]);

const DEFAULT_ROSTER = Object.freeze({
  fixed: FIXED_HIGH_CARD_IDS,
  random: RANDOM_HIGH_CARD_IDS,
  low: LOW_CARD_IDS,
  bonus: BONUS_CARD_IDS,
});

const BOSS_ROSTERS = Object.freeze({
  boss_dot: {
    fixed: [36, 32, 43, MONSTER_TOASTER_CARD_ID],
    random: [73, 46],
    low: [5, 28, 3, 25, 21, 41],
    bonus: [STONE_GIANT_CARD_ID, 39, WALNUT_GUARD_CARD_ID],
  },
  boss_gravo: {
    fixed: [36, 41, 43, 64, MONSTER_TOASTER_CARD_ID],
    random: [105, 100, 102],
    low: [27, 5, 12, 16, 69, 21],
    bonus: [STONE_GIANT_CARD_ID, 39, WALNUT_GUARD_CARD_ID],
  },
  boss_fire: {
    fixed: [36, 32, 45, 64, MONSTER_TOASTER_CARD_ID],
    random: [105, 100, 102, 46],
    low: [16, 69, 12, 27, 3, 43, 41],
    bonus: [STONE_GIANT_CARD_ID, 51, WALNUT_GUARD_CARD_ID],
  },
  boss_forest: {
    fixed: [36, 32, 54, 41, 43, MONSTER_TOASTER_CARD_ID],
    random: [73, 46, 100],
    low: [28, 3, 25, 21, 5],
    bonus: [STONE_GIANT_CARD_ID, 39, 51, WALNUT_GUARD_CARD_ID],
  },
  boss_ice: {
    fixed: [36, 54, 45, 64, 43, MONSTER_TOASTER_CARD_ID],
    random: [46, 105, 102, 73],
    low: [28, 12, 69, 27, 21, 41],
    bonus: [STONE_GIANT_CARD_ID, 51, WALNUT_GUARD_CARD_ID],
  },
});

/*
 * 主批次严格是 3 / 5 个，而不是“若干个 3/5 人 group”。
 * 普通难度在 3 与 5 之间交替；困难固定 5。
 * 石巨人是例外：场上最多 1 个。
 * 钻地大蒜/地道工兵是渗透单位：一次只出 1 个，并且场上不能同时存在二者。
 * 品质/星级还会随波数缓慢成长，但各难度区间互相错开。
 */
const DIFFICULTY_SUMMON_PROFILE = Object.freeze({
  简单: { interval: 20, batch: () => 3, craftBase: 1, craftMax: 2, starBase: 0, starMax: 2, cap: 28 },
  普通: { interval: 16, batch: (wave) => (wave % 2 === 0 ? 5 : 3), craftBase: 2, craftMax: 4, starBase: 1, starMax: 4, cap: 36 },
  困难: { interval: 12, batch: () => 5, craftBase: 3, craftMax: 5, starBase: 2, starMax: 6, cap: 46 },
});

function profileOf(battle) {
  return DIFFICULTY_SUMMON_PROFILE[battle.difficulty] ?? DIFFICULTY_SUMMON_PROFILE.简单;
}

function isTargetBoss(battle) {
  return ['boss_dot', 'boss_gravo'].includes(String(battle?.bossInfo?.id || ''));
}

function rosterOf(battle) {
  return BOSS_ROSTERS[battle.bossInfo?.id] ?? DEFAULT_ROSTER;
}

function uniqueIds(values) {
  return [...new Set((values ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

const FORMATION = Object.freeze([
  { id: 2, lanes: [0, 1, 2, 3, 4], col: 7 },
  { id: 36, lanes: [1, 2, 3], col: 9 },
  { id: 20, lanes: [1, 2, 3], col: 10 },
  { id: 35, lanes: [2], col: 8 },
  { id: 25, lanes: [2], col: 11 },
]);

function fullPoolOf(battle) {
  if (battle.__bossDeckIds) return battle.__bossDeckIds;
  const roster = rosterOf(battle);
  battle.__bossDeckIds = uniqueIds([
    ...FORMATION.map(slot => slot.id),
    ...(battle.bossInfo?.minionCardIds ?? []),
    ...roster.low,
    ...roster.random,
    ...roster.fixed,
    ...roster.bonus,
    ...BOSS_MINION_CARD_IDS,
  ]).filter((id) => battle.db?.getById?.(id)).slice(0, 10);
  return battle.__bossDeckIds;
}

function cardPoolOf(battle, movable) {
  return fullPoolOf(battle).filter((id) => {
    const card = battle.db?.getById?.(id);
    return card && (Number(card.moveSpeed) > 0) === movable;
  });
}

function activeCardCount(battle, cardId) {
  return battle.activeBossMinions().filter((unit) => Number(unit.cardId) === Number(cardId)).length;
}

function activeBurrowCount(battle) {
  return battle.activeBossMinions().filter((unit) => BURROW_CARD_IDS.has(Number(unit.cardId))).length;
}

function effectiveMinionCap(battle) {
  const profile = profileOf(battle);
  const configured = Math.max(1, Math.floor(Number(battle.bossInfo?.minionCap) || 6));
  return Math.max(configured, profile.cap);
}

function instanceForWave(battle, wave) {
  const profile = profileOf(battle);
  const growth = Math.floor(Math.max(0, wave - 1) / 4);
  const craftQuality = Math.min(profile.craftMax, profile.craftBase + Math.floor(growth / 2));
  const star = Math.min(profile.starMax, profile.starBase + growth);
  return { craftQuality, strengthLv: star, star };
}

function laneOrder(count, wave) {
  if (count >= 5) return [0, 1, 2, 3, 4];
  if (count === 1) return [Math.max(0, wave - 1) % 5];
  const variants = [
    [0, 1, 2],
    [1, 2, 3],
    [2, 3, 4],
  ];
  return variants[Math.max(0, wave - 1) % variants.length].slice(0, Math.max(1, count));
}

function cellFree(battle, lane, col) {
  return !(battle.engine.getUnitsAt?.(lane, col) ?? []).some((unit) =>
    unit?.alive
      && unit.pvpNeutral !== true
      && unit.bossCommanderOnly !== true
      && unit.pvpBoss !== true
      && unit.isBoss !== true,
  );
}

function isRangedCard(card) {
  const atkStyle = Number(card?.atkStyle ?? card?.atk_style);
  const viewType = Number(card?.viewType ?? card?.card_view_type);
  return [2, 3, 17, 18, 19].includes(atkStyle) || viewType === 1 || Number(card?.id ?? card?.card_id) === 46;
}

function columnOrderForCard(card, { staticUnit = false } = {}) {
  const cardId = Number(card?.id ?? card?.card_id);
  if (cardId === WALNUT_GUARD_CARD_ID) return [7, 8, 9, 10, 11];
  if (REAR_SUPPORT_CARD_IDS.has(cardId)) return [9, 8, 10];
  if (isRangedCard(card)) return [11, 10, 9, 8, 7];
  if (staticUnit) return [8, 7, 9, 10, 11];
  return [10, 9, 11, 8, 7];
}

function chooseColumn(battle, lanes, { staticUnit = false, card = null } = {}) {
  const columns = columnOrderForCard(card, { staticUnit });
  return columns.find((col) =>
    col >= ENEMY_DEPLOY_MIN_COL
      && col <= ENEMY_DEPLOY_MAX_COL
      && lanes.every((lane) => cellFree(battle, lane, col)),
  ) ?? null;
}

function chooseCard(battle, pool, startIndex = 0, { avoidActiveStatic = false } = {}) {
  if (!pool.length) return null;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const id = pool[(startIndex + offset) % pool.length];
    const card = battle.db?.getById?.(id);
    if (!card) continue;
    if (avoidActiveStatic && Number(card.moveSpeed) <= 0 && activeCardCount(battle, id) > 0) continue;
    if (BURROW_CARD_IDS.has(Number(id)) && activeBurrowCount(battle) > 0) continue;
    return card;
  }
  return null;
}

function spawnUnit(battle, card, lane, col, wave, { sentinel = false } = {}) {
  if (!battle.bossUnit?.alive || !card) return null;
  if (battle.activeBossMinions().length >= effectiveMinionCap(battle)) return null;
  if (!fullPoolOf(battle).includes(Number(card.id))) return null;
  const formation = FORMATION.find(slot => slot.id === Number(card.id));
  if (formation && activeCardCount(battle, card.id) >= formation.lanes.length) return null;

  // 多特/沃里尔 BOSS 战中，敌方蒲公英精灵固定为普通品质、0 星。
  const isDandelion = isTargetBoss(battle) && Number(card.id) === DANDELION_CARD_ID;
  const unit = new BattleUnit({
    card,
    lane,
    col,
    team: 'enemy',
    instance: isDandelion
      ? { craftQuality: 2, strengthLv: 0, star: 0 }
      : instanceForWave(battle, wave),
  });
  unit.uid = ++battle.uidSeq;
  unit.pvpBossMinion = true;
  unit.pvpOwnerUserId = null;

  const minionMult = 1 + Math.max(0, battle.difficultyMult - 1) * 0.5;
  unit.maxHp = Math.max(1, Math.round(unit.maxHp * minionMult * 100) / 100);
  unit.baseMaxHp = unit.maxHp;
  unit.hp = unit.maxHp;
  if (unit.atk > 0) unit.atk = Math.max(1, Math.round(unit.atk * minionMult * 100) / 100);

  if (sentinel) {
    unit._alienSentinelLane = lane;
    unit._alienSentinelCol = col;
    unit._alienSentinelResolveAt = battle.engine.time + ALIEN_SENTINEL_DELAY;
    unit._alienSentinelResolved = false;
  }

  battle.engine.units.push(unit);
  battle.engine.initUnitSpawnFade?.(unit);
  battle.engine.pushDeployEffect?.(lane, col, Math.max(1, Number(unit.craftQuality) || 1));
  battle.engine.pushLog?.(`【${battle.bossInfo.name}】召唤 ${card.name}`);
  battle.bossMinionCount += 1;
  battle.pushVisualEvent?.({
    kind: 'boss-summon',
    team: 'red',
    skillId: 0,
    effectKind: sentinel ? 'alien-abduct' : 'boss-summon',
    target: { lane, col },
    duration: sentinel ? ALIEN_SENTINEL_DELAY : 0.8,
  });
  return unit;
}

function batchCountForCard(battle, card, wave) {
  const cardId = Number(card?.id ?? card?.card_id);
  if (cardId === STONE_GIANT_CARD_ID) return 1;
  if (isTargetBoss(battle) && (cardId === GIANT_HEAD_CARD_ID || cardId === SLIME_NINJA_CARD_ID)) return 5;
  if (BURROW_CARD_IDS.has(cardId)) return 1;
  return profileOf(battle).batch(wave);
}

function spawnMainBatch(battle, wave, limit = profileOf(battle).batch(wave)) {
  if (limit <= 0) return [];
  const movablePool = cardPoolOf(battle, true).filter(id => !FORMATION.some(slot => slot.id === id));
  const card = chooseCard(battle, movablePool, wave - 1);
  if (!card) return [];

  const cardId = Number(card?.id ?? card?.card_id);
  const target = batchCountForCard(battle, card, wave);
  // 多特/沃里尔 BOSS 战中，巨头怪/软泥忍者怪固定 5 只，不因普通波批次上限被压到 3。
  const count = (isTargetBoss(battle) && (cardId === GIANT_HEAD_CARD_ID || cardId === SLIME_NINJA_CARD_ID))
    ? target
    : Math.min(limit, target);
  const lanes = laneOrder(count, wave);
  const col = chooseColumn(battle, lanes, { card });
  if (col == null) return [];

  return lanes.map((lane) => spawnUnit(battle, card, lane, col, wave)).filter(Boolean);
}

function spawnFormation(battle, wave, limit) {
  const spawned = [];
  for (const slot of FORMATION) {
    const card = battle.db?.getById?.(slot.id);
    if (!card) continue;
    for (const lane of slot.lanes) {
      if (spawned.length >= limit) return spawned;
      // 已移动的石巨人仍计入数量，补阵不会叠加同类支援卡。
      if (activeCardCount(battle, slot.id) >= slot.lanes.length) break;
      if (!cellFree(battle, lane, slot.col)) continue;
      const unit = spawnUnit(battle, card, lane, slot.col, wave);
      if (unit) spawned.push(unit);
    }
  }
  return spawned;
}

// 循环波次特殊召唤：
// - 第 4 波（4,14,24...）加钻地大蒜/地道工兵：简单1 / 普通2 / 困难5
// - 第 11 波（11,21,31...）加幻.飞行忍者：简单3 / 普通5 / 困难5
function spawnWaveSpecific(battle, wave) {
  const spawned = [];
  const bossId = String(battle.bossInfo?.id || '');
  // 仅针对多特/沃里尔（格拉沃）这两个 BOSS 生效，不影响其他 BOSS。
  if (!['boss_dot', 'boss_gravo'].includes(bossId)) return spawned;
  const difficulty = String(battle.difficulty || '简单');

  if (wave % 10 === 4) {
    const count = Math.max(1, Number(DIFFICULTY_BURROW_COUNT[difficulty]) || 1);
    const burrowIds = [...BURROW_CARD_IDS];
    for (let i = 0; i < count; i += 1) {
      const cardId = burrowIds[i % burrowIds.length];
      const card = battle.db?.getById?.(cardId);
      if (!card) continue;
      const lane = Math.max(0, (wave + i) % 5);
      const col = chooseColumn(battle, [lane], { card });
      if (col == null) continue;
      const unit = spawnUnit(battle, card, lane, col, wave);
      if (unit) spawned.push(unit);
    }
  }

  if (wave > 10 && wave % 10 === 1) {
    const count = Math.max(1, Number(DIFFICULTY_FLYING_NINJA_COUNT[difficulty]) || 3);
    const card = battle.db?.getById?.(PHANTOM_FLYING_NINJA_CARD_ID);
    if (!card) return spawned;
    const lanes = laneOrder(count, wave);
    const col = chooseColumn(battle, lanes, { card });
    if (col == null) return spawned;
    for (const lane of lanes) {
      const unit = spawnUnit(battle, card, lane, col, wave);
      if (unit) spawned.push(unit);
    }
  }

  return spawned;
}

export function installBossSummonRules20260819() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalSpawnBoss = CoopBossBattle.prototype.spawnBoss;
  if (originalSpawnBoss && !originalSpawnBoss.__bossCommanderOnly20260908) {
    function spawnDisplayOnlyBoss20260908(...args) {
      const result = originalSpawnBoss.apply(this, args);
      const boss = this.bossUnit;
      if (boss) {
        boss.bossCommanderOnly = true;
        boss.moveSpeed = 0;
        boss.attackingBase = false;
        boss.atk = 0;
        boss.atkTimer = Number.POSITIVE_INFINITY;
      }
      return result;
    }
    spawnDisplayOnlyBoss20260908.__bossCommanderOnly20260908 = true;
    CoopBossBattle.prototype.spawnBoss = spawnDisplayOnlyBoss20260908;
  }

  CoopBossBattle.prototype.getBossMinionInterval = function getBossMinionInterval() {
    return profileOf(this).interval;
  };

  CoopBossBattle.prototype.getBossMinionBatchSize = function getBossMinionBatchSize(wave = null) {
    const targetWave = Number.isInteger(Number(wave)) && Number(wave) > 0
      ? Number(wave)
      : Math.max(1, Number(this.bossMinionWave || 0) + 1);
    return profileOf(this).batch(targetWave);
  };

  CoopBossBattle.prototype.spawnBossMinion = function spawnBossMinionLatest() {
    const wave = Math.max(1, Number(this.bossMinionWave || 0) + 1);
    const card = chooseCard(this, cardPoolOf(this, true), this.bossMinionCount);
    if (!card) return null;
    const lane = this.bossMinionCount % 5;
    const col = chooseColumn(this, [lane], { card });
    return col == null ? null : spawnUnit(this, card, lane, col, wave);
  };

  CoopBossBattle.prototype.spawnBossMinionBatch = function spawnBossMinionBatch() {
    if (!this.bossUnit?.alive) return [];
    const wave = Math.max(0, Number(this.bossMinionWave) || 0) + 1;
    this.bossMinionWave = wave;

    // 等待正常召唤间隔，阵型和主力共享每批 3/5 个的预算，不能一次铺满。
    const budget = profileOf(this).batch(wave);
    const spawned = spawnFormation(this, wave, Math.ceil(budget / 2));
    spawned.push(...spawnMainBatch(this, wave, budget - spawned.length));
    spawned.push(...spawnWaveSpecific(this, wave));
    this.engine.pushLog?.('【' + this.bossInfo.name + '】第' + wave + '批：补充' + spawned.length + '个单位（卡池' + fullPoolOf(this).length + '种）');
    return spawned;
  };

  CoopBossBattle.prototype.tickBossMinions = function tickBossMinionsLatest(dt) {
    if (!this.bossUnit?.alive) return;
    const interval = this.getBossMinionInterval();
    this.bossMinionTimer += Math.max(0, Number(dt) || 0);
    while (this.bossMinionTimer + 1e-9 >= interval) {
      this.bossMinionTimer -= interval;
      this.spawnBossMinionBatch();
    }
  };
}
