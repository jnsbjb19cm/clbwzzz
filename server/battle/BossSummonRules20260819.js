import { CoopBossBattle } from './CoopBossBattle.js';

const { BattleUnit } = await import('../../src/battle/BattleUnit.js');

const PATCH_FLAG = Symbol.for('clbwzzz.bossSummonRules20260819');
const ENEMY_DEPLOY_MIN_COL = 7;
const ENEMY_DEPLOY_MAX_COL = 11;
const ALIEN_SENTINEL_CARD_ID = 38;
const ALIEN_SENTINEL_DELAY = 5;

/*
 * BOSS 召唤池必须保持“广池”，不能退化成只会叫固定几张卡。
 * 每个 BOSS 有偏好池，同时仍会回退到完整池；bossList.minionCardIds 也会并入候选。
 */
const FIXED_HIGH_CARD_IDS = Object.freeze([36, 32, 54, 41, 43, 45, 64]);
const RANDOM_HIGH_CARD_IDS = Object.freeze([73, 46, 105, 100, 102]);
const LOW_CARD_IDS = Object.freeze([5, 28, 12, 16, 69, 3, 25, 27, 21]);
const BONUS_CARD_IDS = Object.freeze([35, 39, 51]);

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
    fixed: [36, 32, 43],
    random: [73, 46],
    low: [5, 28, 3, 25, 21],
    bonus: [35, 39],
  },
  boss_gravo: {
    fixed: [36, 41, 43, 64],
    random: [105, 100, 102],
    low: [27, 5, 12, 16, 69, 21],
    bonus: [35, 39],
  },
  boss_fire: {
    fixed: [36, 32, 45, 64],
    random: [105, 100, 102, 46],
    low: [16, 69, 12, 27, 3],
    bonus: [35, 51],
  },
  boss_forest: {
    fixed: [36, 32, 54, 41, 43],
    random: [73, 46, 100],
    low: [28, 3, 25, 21, 5],
    bonus: [35, 39, 51],
  },
  boss_ice: {
    fixed: [36, 54, 45, 64, 43],
    random: [46, 105, 102, 73],
    low: [28, 12, 69, 27, 21],
    bonus: [35, 51],
  },
});

/*
 * 主批次严格是 3 / 5 个，而不是“若干个 3/5 人 group”。
 * 普通难度在 3 与 5 之间交替；困难固定 5。
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

function rosterOf(battle) {
  return BOSS_ROSTERS[battle.bossInfo?.id] ?? DEFAULT_ROSTER;
}

function uniqueIds(values) {
  return [...new Set((values ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function fullPoolOf(battle) {
  const roster = rosterOf(battle);
  return uniqueIds([
    ...(battle.bossInfo?.minionCardIds ?? []),
    ...roster.low,
    ...roster.random,
    ...roster.fixed,
    ...roster.bonus,
    ...BOSS_MINION_CARD_IDS,
  ]).filter((id) => id !== ALIEN_SENTINEL_CARD_ID);
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
  // 3 人组轮换上/中/下，避免一直堵同三路。
  const variants = [
    [0, 1, 2],
    [1, 2, 3],
    [2, 3, 4],
  ];
  return variants[Math.max(0, wave - 1) % variants.length];
}

function cellFree(battle, lane, col) {
  return !(battle.engine.getUnitsAt?.(lane, col) ?? []).some((unit) =>
    unit?.alive && unit.pvpNeutral !== true && unit.bossCommanderOnly !== true,
  );
}

function chooseColumn(battle, lanes, { staticUnit = false } = {}) {
  // 不可移动补位站得更靠前；主力移动组从后排出发。
  const columns = staticUnit ? [8, 7, 9, 10, 11] : [10, 9, 11, 8, 7];
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
    return card;
  }
  return null;
}

function spawnUnit(battle, card, lane, col, wave, { sentinel = false } = {}) {
  if (!battle.bossUnit?.alive || !card) return null;
  if (battle.activeBossMinions().length >= effectiveMinionCap(battle)) return null;

  const unit = new BattleUnit({
    card,
    lane,
    col,
    team: 'enemy',
    instance: instanceForWave(battle, wave),
  });
  unit.uid = ++battle.uidSeq;
  unit.pvpBossMinion = true;
  unit.pvpOwnerUserId = null;

  // BOSS 难度仍对基础战斗数值生效，但不会让小怪倍率压过 BOSS 本体。
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

function spawnMainBatch(battle, wave) {
  const count = profileOf(battle).batch(wave);
  const lanes = laneOrder(count, wave);
  const col = chooseColumn(battle, lanes);
  if (col == null) return [];

  const movablePool = cardPoolOf(battle, true);
  const card = chooseCard(battle, movablePool, wave - 1);
  if (!card) return [];
  return lanes.map((lane) => spawnUnit(battle, card, lane, col, wave)).filter(Boolean);
}

function spawnStaticSupplement(battle, wave) {
  // 每第 3 波补一张不可移动卡；已有同类型不可移动卡时换下一种。
  if (wave % 3 !== 0) return null;
  const pool = cardPoolOf(battle, false);
  const card = chooseCard(battle, pool, wave - 1, { avoidActiveStatic: true });
  if (!card) return null;

  const laneStart = (wave - 1) % 5;
  for (let offset = 0; offset < 5; offset += 1) {
    const lane = (laneStart + offset) % 5;
    const col = chooseColumn(battle, [lane], { staticUnit: true });
    if (col == null) continue;
    return spawnUnit(battle, card, lane, col, wave);
  }
  return null;
}

function spawnSentinelExtra(battle, wave) {
  // 外星哨兵是额外机制，不占 3/5 主批次数量；降低频率避免每波都出现。
  if (wave % 4 !== 0 || activeCardCount(battle, ALIEN_SENTINEL_CARD_ID) > 0) return null;
  const victim = battle.engine.units
    .filter((unit) =>
      unit?.alive
      && unit.team === 'player'
      && unit.pvpNeutral !== true
      && unit.bossCommanderOnly !== true
      && !unit.isMovable?.(),
    )
    .sort((a, b) => Number(a.uid) - Number(b.uid))[0];
  if (!victim) return null;
  const card = battle.db?.getById?.(ALIEN_SENTINEL_CARD_ID);
  if (!card) return null;
  return spawnUnit(
    battle,
    card,
    Math.floor(victim.lane),
    Math.floor(victim.col),
    wave,
    { sentinel: true },
  );
}

export function installBossSummonRules20260819() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  CoopBossBattle.prototype.getBossMinionInterval = function getBossMinionInterval() {
    return profileOf(this).interval;
  };

  CoopBossBattle.prototype.getBossMinionBatchSize = function getBossMinionBatchSize(wave = null) {
    const targetWave = Number.isInteger(Number(wave)) && Number(wave) > 0
      ? Number(wave)
      : Math.max(1, Number(this.bossMinionWave || 0) + 1);
    return profileOf(this).batch(targetWave);
  };

  // 兼容旧调用：单只召唤仍从完整移动池取卡，但正常 tick 使用 spawnBossMinionBatch。
  CoopBossBattle.prototype.spawnBossMinion = function spawnBossMinionLatest() {
    const wave = Math.max(1, Number(this.bossMinionWave || 0) + 1);
    const card = chooseCard(this, cardPoolOf(this, true), this.bossMinionCount);
    if (!card) return null;
    const lane = this.bossMinionCount % 5;
    const col = chooseColumn(this, [lane]);
    return col == null ? null : spawnUnit(this, card, lane, col, wave);
  };

  CoopBossBattle.prototype.spawnBossMinionBatch = function spawnBossMinionBatch() {
    if (!this.bossUnit?.alive) return [];
    const wave = Math.max(0, Number(this.bossMinionWave) || 0) + 1;
    this.bossMinionWave = wave;

    const spawned = spawnMainBatch(this, wave);
    const supplement = spawnStaticSupplement(this, wave);
    if (supplement) spawned.push(supplement);
    const sentinel = spawnSentinelExtra(this, wave);
    if (sentinel) spawned.push(sentinel);

    this.engine.pushLog?.(
      `【${this.bossInfo.name}】第${wave}批：主力${this.getBossMinionBatchSize(wave)}张`
      + `${supplement ? ' + 不可移动补位' : ''}${sentinel ? ' + 外星哨兵' : ''}`,
    );
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
