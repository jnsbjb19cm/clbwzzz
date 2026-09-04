import { BattleEngine } from '../../src/battle/BattleEngine.js';
import { BattleUnit } from '../../src/battle/BattleUnit.js';
import { BattleSkillSystem } from '../../src/systems/BattleSkillSystem.js';
import { PvpBattle } from './PvpBattle.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpRound2Gameplay');
const BARRIER_HP = 220;
const SPIRIT_HP = 220;
const SPIRIT_ATK = 8;
const BARRIER_TO_SPIRIT = new Map([
  [1000, 1005],
  [1001, 1006],
  [1002, 1007],
  [1003, 1008],
  [1004, 1009],
]);
const SPIRIT_IDS = new Set(BARRIER_TO_SPIRIT.values());

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function clampResource(value) {
  return Math.max(0, Math.min(999, Number(value) || 0));
}

function isNeutralBarrier(unit) {
  return Boolean(unit?.pvpNeutral && BARRIER_TO_SPIRIT.has(Number(unit.cardId)));
}

function normalizeBarrier(unit) {
  if (!isNeutralBarrier(unit)) return;
  if (!unit.__pvpBarrierStatsReady) {
    unit.__pvpBarrierStatsReady = true;
    unit.maxHp = BARRIER_HP;
    unit.baseMaxHp = BARRIER_HP;
    unit.hp = BARRIER_HP;
  } else {
    unit.maxHp = BARRIER_HP;
    unit.baseMaxHp = BARRIER_HP;
    unit.hp = Math.max(0, Math.min(BARRIER_HP, Number(unit.hp) || 0));
  }
  unit.atk = 0;
  unit.moveSpeed = 0;
  unit.atkSpeed = 0;
  unit.atkTimer = 999;
}

function normalizeSpirit(unit) {
  if (!unit || !SPIRIT_IDS.has(Number(unit.cardId))) return;
  if (!unit.__pvpSpiritStatsReady) {
    unit.__pvpSpiritStatsReady = true;
    unit.maxHp = SPIRIT_HP;
    unit.baseMaxHp = SPIRIT_HP;
    unit.hp = SPIRIT_HP;
  } else {
    unit.maxHp = SPIRIT_HP;
    unit.baseMaxHp = SPIRIT_HP;
    unit.hp = Math.max(0, Math.min(SPIRIT_HP, Number(unit.hp) || 0));
  }
  unit.atk = SPIRIT_ATK;
}

function normalizeNeutralUnits(battle) {
  for (const unit of battle.engine?.units ?? []) {
    normalizeBarrier(unit);
    if (unit.__pvpBarrierSummon) normalizeSpirit(unit);
  }
}

function rememberLastHit(target, attacker) {
  if (!isNeutralBarrier(target) || !attacker) return;
  if (attacker.team !== 'player' && attacker.team !== 'enemy') return;
  target.__pvpLastHitTeam = attacker.team;
  target.__pvpLastHitOwnerUserId = attacker.pvpOwnerUserId ?? null;
}

function withOwnerResources(engine, attacker, callback) {
  const battle = engine.__authorityBattle;
  const ownerId = Number(attacker?.pvpOwnerUserId);
  if (!battle?.resourcesOf || !Number.isInteger(ownerId) || ownerId <= 0) return callback();
  const resource = battle.resourcesOf(ownerId);
  const previousSun = engine.sunlight;
  const previousFood = engine.food;
  engine.sunlight = clampResource(resource.sun);
  engine.food = clampResource(resource.food);
  try {
    return callback();
  } finally {
    // 火龙读取该玩家资源；大肚神偷等对资源的修改也写回该玩家，而非全局引擎。
    resource.sun = clampResource(engine.sunlight);
    resource.food = clampResource(engine.food);
    engine.sunlight = previousSun;
    engine.food = previousFood;
  }
}

function spawnBarrierSpirit(engine, barrier) {
  if (!isNeutralBarrier(barrier) || barrier.__pvpBarrierResolved) return null;
  barrier.__pvpBarrierResolved = true;
  const spiritId = BARRIER_TO_SPIRIT.get(Number(barrier.cardId));
  const team = barrier.__pvpLastHitTeam === 'enemy' ? 'enemy' : 'player';
  const spirit = engine.spawnSummon(spiritId, barrier.lane, barrier.col, team);
  if (!spirit) return null;
  spirit.__pvpBarrierSummon = true;
  spirit.pvpOwnerUserId = barrier.__pvpLastHitOwnerUserId ?? null;
  normalizeSpirit(spirit);
  engine.pushLog(`【${barrier.name}】被击碎，${team === 'player' ? '蓝方' : '红方'}召唤【${spirit.name}】`);
  return spirit;
}

function unitsInAura(engine, spirit, sameTeam) {
  return engine.units.filter((unit) => {
    if (!unit.alive || unit === spirit || unit.team === 'neutral') return false;
    if (sameTeam ? unit.team !== spirit.team : unit.team === spirit.team) return false;
    return Math.abs(unit.lane - spirit.lane) <= 1
      && Math.abs(Math.round(unit.col) - Math.round(spirit.col)) <= 1;
  });
}

function applySpiritAura(engine, spirit) {
  const now = engine.time;
  const allies = unitsInAura(engine, spirit, true);
  const enemies = unitsInAura(engine, spirit, false);
  switch (Number(spirit.cardId)) {
    case 1005:
      for (const unit of enemies) unit.slowedUntil = Math.max(Number(unit.slowedUntil) || 0, now + 1.25);
      break;
    case 1006:
      for (const unit of enemies) {
        if (now < Number(unit.__pvpFireSpiritDotUntil || 0)) continue;
        unit.__pvpFireSpiritDotUntil = now + 1.8;
        unit.dots ??= [];
        unit.dots.push({ kind: 'burn', dps: 2, every: 1, until: now + 2 });
      }
      break;
    case 1007:
      for (const unit of allies) {
        const healed = unit.heal(4);
        if (healed > 0) engine.spawnFloat(unit.lane, unit.col, healed);
      }
      break;
    case 1008:
      for (const unit of allies) {
        unit.tempAtkBonus = Math.max(Number(unit.tempAtkBonus) || 0, 4);
        unit.atkBuffUntil = Math.max(Number(unit.atkBuffUntil) || 0, now + 1.25);
      }
      break;
    case 1009:
      for (const unit of allies) {
        unit.__pvpSpiritDamageReduction = 0.25;
        unit.__pvpSpiritDamageReductionUntil = now + 1.25;
      }
      break;
    default:
      break;
  }
}

function tickSpiritAuras(battle, dt) {
  const engine = battle.engine;
  for (const unit of engine.units) {
    if (!unit.alive || !unit.__pvpBarrierSummon) continue;
    normalizeSpirit(unit);
    unit.__pvpSpiritAuraTimer = (Number(unit.__pvpSpiritAuraTimer) || 0) + dt;
    if (unit.__pvpSpiritAuraTimer < 1) continue;
    unit.__pvpSpiritAuraTimer %= 1;
    applySpiritAura(engine, unit);
  }
}

export function installPvpRound2Gameplay() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousTakeDamage = BattleUnit.prototype.takeDamage;
  BattleUnit.prototype.takeDamage = function takeDamageWithSpiritReduction(amount, now = 0) {
    const active = Number(this.__pvpSpiritDamageReductionUntil || 0) > Number(now || 0);
    const ratio = active ? Math.max(0, Math.min(0.9, Number(this.__pvpSpiritDamageReduction) || 0)) : 0;
    return previousTakeDamage.call(this, Number(amount) * (1 - ratio), now);
  };

  const previousApplyCardHit = BattleEngine.prototype.applyCardHit;
  BattleEngine.prototype.applyCardHit = function applyCardHitWithOwnerResources(attacker, target, ...args) {
    rememberLastHit(target, attacker);
    return withOwnerResources(this, attacker, () => previousApplyCardHit.call(this, attacker, target, ...args));
  };

  const previousSkillHitUnit = BattleSkillSystem.prototype.hitUnit;
  BattleSkillSystem.prototype.hitUnit = function hitUnitWithBarrierOwner(unit, damage) {
    if (isNeutralBarrier(unit)) {
      const side = this.engine.__pvpActiveSkillSide;
      if (side === 'player' || side === 'enemy') {
        unit.__pvpLastHitTeam = side;
        unit.__pvpLastHitOwnerUserId = this.engine.__pvpActiveSkillOwnerUserId ?? null;
      }
    }
    return previousSkillHitUnit.call(this, unit, damage);
  };

  const previousCastSkill = PvpBattle.prototype.castSkill;
  PvpBattle.prototype.castSkill = function castSkillWithOwner(userId, payload = {}) {
    const result = previousCastSkill.call(this, userId, payload);
    const pending = this.skillStateOf(userId).pending.at(-1);
    if (pending) pending.userId = Number(userId);
    return result;
  };

  const previousApplySkillCast = PvpBattle.prototype.applySkillCast;
  PvpBattle.prototype.applySkillCast = function applySkillCastWithOwner(cast) {
    const engine = this.engine;
    const previousSide = engine.__pvpActiveSkillSide;
    const previousOwner = engine.__pvpActiveSkillOwnerUserId;
    engine.__pvpActiveSkillSide = cast.team === 'red' ? 'enemy' : 'player';
    engine.__pvpActiveSkillOwnerUserId = Number(cast.userId) || null;
    try {
      return previousApplySkillCast.call(this, cast);
    } finally {
      engine.__pvpActiveSkillSide = previousSide;
      engine.__pvpActiveSkillOwnerUserId = previousOwner;
    }
  };

  const previousOnUnitDeath = BattleEngine.prototype.onUnitDeath;
  BattleEngine.prototype.onUnitDeath = function onUnitDeathWithBarrierSummon(unit) {
    const shouldSpawn = isNeutralBarrier(unit) && !unit.__pvpBarrierResolved;
    const result = previousOnUnitDeath.call(this, unit);
    if (shouldSpawn && !unit.alive) spawnBarrierSpirit(this, unit);
    return result;
  };

  const previousTick = PvpBattle.prototype.tick;
  PvpBattle.prototype.tick = function tickWithBarrierStatsAndAuras(dt) {
    this.engine.__authorityBattle = this;
    normalizeNeutralUnits(this);
    const result = previousTick.call(this, dt);
    normalizeNeutralUnits(this);
    tickSpiritAuras(this, Number(dt) || 0);
    return result;
  };

  const previousSnapshot = PvpBattle.prototype.snapshot;
  PvpBattle.prototype.snapshot = function snapshotWithBarrierStats() {
    this.engine.__authorityBattle = this;
    normalizeNeutralUnits(this);
    const snapshot = previousSnapshot.call(this);
    normalizeNeutralUnits(this);
    for (const data of snapshot.units ?? []) {
      const unit = this.engine.units.find((candidate) => Number(candidate.uid) === Number(data.uid));
      if (isNeutralBarrier(unit)) {
        data.hp = round1(unit.hp);
        data.maxHp = BARRIER_HP;
        data.neutral = true;
        data.barrier = true;
      } else if (unit?.__pvpBarrierSummon) {
        data.hp = round1(unit.hp);
        data.maxHp = SPIRIT_HP;
        data.atk = SPIRIT_ATK;
        data.neutralSpirit = true;
        data.ownerUserId = unit.pvpOwnerUserId ?? null;
      }
    }
    snapshot.neutralBarrierRule = {
      hp: BARRIER_HP,
      summonHp: SPIRIT_HP,
      summonAtk: SPIRIT_ATK,
      ownership: 'last-hit-team',
    };
    snapshot.resourceSpecials = 'owner-scoped-v1';
    return snapshot;
  };
}
