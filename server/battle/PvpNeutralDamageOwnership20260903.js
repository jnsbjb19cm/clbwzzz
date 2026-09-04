import { BattleEngine } from '../../src/battle/BattleEngine.js';
import { BattleUnit } from '../../src/battle/BattleUnit.js';
import { BattleSkillSystem } from '../../src/systems/BattleSkillSystem.js';
import { PvpBattle } from './PvpBattle.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpNeutralDamageOwnership20260903');
const NEUTRAL_BARRIER_IDS = new Set([1000, 1001, 1002, 1003, 1004]);

let activeDamageSource = null;

function isNeutralBarrier(unit) {
  return Boolean(unit?.pvpNeutral) && NEUTRAL_BARRIER_IDS.has(Number(unit.cardId));
}

function normalizeSource(source) {
  const team = source?.team === 'enemy' ? 'enemy' : source?.team === 'player' ? 'player' : null;
  if (!team) return null;
  const ownerUserId = Number(source?.ownerUserId);
  return {
    team,
    ownerUserId: Number.isFinite(ownerUserId) && ownerUserId > 0 ? ownerUserId : null,
  };
}

function sourceFromUnit(unit) {
  return normalizeSource({
    team: unit?.team,
    ownerUserId: unit?.pvpOwnerUserId,
  });
}

function sourceFromActiveSkill(engine) {
  return normalizeSource({
    team: engine?.__pvpActiveSkillSide,
    ownerUserId: engine?.__pvpActiveSkillOwnerUserId,
  });
}

function withDamageSource(source, callback) {
  const previous = activeDamageSource;
  const normalized = normalizeSource(source);
  if (normalized) activeDamageSource = normalized;
  try {
    return callback();
  } finally {
    activeDamageSource = previous;
  }
}

function stampBarrierDamage(unit, source, now) {
  if (!isNeutralBarrier(unit)) return;
  const normalized = normalizeSource(source);
  if (!normalized) return;
  unit.__pvpLastHitTeam = normalized.team;
  unit.__pvpLastHitOwnerUserId = normalized.ownerUserId;
  unit.__pvpLastDamageAt = Number(now) || 0;
}

function tagNewDots(unit, startIndex, source) {
  if (!isNeutralBarrier(unit) || !Array.isArray(unit.dots)) return;
  const normalized = normalizeSource(source);
  if (!normalized) return;
  for (const dot of unit.dots.slice(Math.max(0, startIndex))) {
    if (!dot || typeof dot !== 'object') continue;
    dot.__pvpSourceTeam = normalized.team;
    dot.__pvpSourceOwnerUserId = normalized.ownerUserId;
  }
}

function dotSource(dot, unit) {
  return normalizeSource({
    team: dot?.__pvpSourceTeam ?? unit?.__pvpLastHitTeam,
    ownerUserId: dot?.__pvpSourceOwnerUserId ?? unit?.__pvpLastHitOwnerUserId,
  });
}

export function installPvpNeutralDamageOwnership20260903() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 最低层只在真正扣到血时写入归属。这样“先红方打过、后蓝方造成致死伤害”
  // 不会继续沿用红方的旧 last-hit 元数据。
  const previousTakeDamage = BattleUnit.prototype.takeDamage;
  BattleUnit.prototype.takeDamage = function takeDamageWithNeutralOwnership(amount, now = 0) {
    const applied = previousTakeDamage.call(this, amount, now);
    if (applied > 0 && isNeutralBarrier(this) && activeDamageSource) {
      stampBarrierDamage(this, activeDamageSource, now);
    }
    return applied;
  };

  const previousApplyCardHit = BattleEngine.prototype.applyCardHit;
  BattleEngine.prototype.applyCardHit = function applyCardHitWithNeutralOwnership(attacker, victim, damage, options = {}) {
    const source = sourceFromUnit(attacker);
    const dotStart = Array.isArray(victim?.dots) ? victim.dots.length : 0;
    const result = withDamageSource(source, () => previousApplyCardHit.call(this, attacker, victim, damage, options));
    tagNewDots(victim, dotStart, source);
    return result;
  };

  for (const methodName of ['trySuicideBomber', 'deathExplosion', 'whiteSlashStrike']) {
    const previous = BattleEngine.prototype[methodName];
    if (typeof previous !== 'function') continue;
    BattleEngine.prototype[methodName] = function cardAreaDamageWithNeutralOwnership(sourceUnit, ...args) {
      return withDamageSource(sourceFromUnit(sourceUnit), () => previous.call(this, sourceUnit, ...args));
    };
  }

  const previousHitUnit = BattleSkillSystem.prototype.hitUnit;
  BattleSkillSystem.prototype.hitUnit = function hitUnitWithNeutralOwnership(unit, damage) {
    const source = sourceFromActiveSkill(this.engine) ?? activeDamageSource;
    return withDamageSource(source, () => previousHitUnit.call(this, unit, damage));
  };

  const previousApplyEffect = BattleSkillSystem.prototype.applyEffect;
  BattleSkillSystem.prototype.applyEffect = function applyEffectWithNeutralOwnership(skillId, effect, target, card) {
    const source = sourceFromActiveSkill(this.engine) ?? activeDamageSource;
    const barriers = (this.engine?.units ?? [])
      .filter(isNeutralBarrier)
      .map((unit) => ({ unit, dotStart: Array.isArray(unit.dots) ? unit.dots.length : 0 }));
    const result = withDamageSource(source, () => previousApplyEffect.call(this, skillId, effect, target, card));
    for (const { unit, dotStart } of barriers) tagNewDots(unit, dotStart, source);
    return result;
  };

  // DOT 原实现会把同一单位所有 DOT 聚合后一次扣血，来源会丢失。
  // 非中立单位仍走原逻辑；中立障碍逐 DOT 结算并携带施加者阵营。
  const previousTickDots = BattleSkillSystem.prototype.tickDots;
  BattleSkillSystem.prototype.tickDots = function tickDotsWithNeutralOwnership(dt) {
    const barriers = (this.engine?.units ?? []).filter((unit) => unit.alive && isNeutralBarrier(unit) && unit.dots?.length);
    const saved = barriers.map((unit) => ({ unit, dots: unit.dots }));
    for (const { unit } of saved) unit.dots = [];
    previousTickDots.call(this, dt);
    for (const { unit, dots } of saved) unit.dots = dots;

    const now = this.engine.time;
    for (const { unit } of saved) {
      if (!unit.alive || !unit.dots?.length) continue;
      const kept = [];
      for (const dot of unit.dots) {
        const every = Math.max(0.1, Number(dot.every) || 1);
        dot.nextAt ??= Math.min(dot.until, now + every);
        let total = 0;
        while (now + 1e-6 >= dot.nextAt && dot.nextAt <= dot.until + 1e-6) {
          total += Number(dot.dps) || 0;
          dot.nextAt += every;
        }
        if (total > 0 && unit.alive) {
          withDamageSource(dotSource(dot, unit), () => this.hitUnit(unit, total));
        }
        if (now < dot.until - 1e-6 || dot.nextAt <= dot.until + 1e-6) kept.push(dot);
      }
      unit.dots = kept;
    }
  };

  // PvpBattle 的持续火墙字段在施放结束后才逐帧结算，补上施法者归属。
  const previousApplySkillCast = PvpBattle.prototype.applySkillCast;
  PvpBattle.prototype.applySkillCast = function applySkillCastWithFieldOwnership(cast) {
    const before = this.skillFields?.length ?? 0;
    const result = previousApplySkillCast.call(this, cast);
    const source = normalizeSource({
      team: cast?.team === 'red' ? 'enemy' : cast?.team === 'blue' ? 'player' : null,
      ownerUserId: cast?.userId,
    });
    if (source) {
      for (const field of (this.skillFields ?? []).slice(before)) {
        field.__pvpSourceTeam = source.team;
        field.__pvpSourceOwnerUserId = source.ownerUserId;
      }
    }
    return result;
  };

  PvpBattle.prototype.tickSkillFields = function tickSkillFieldsWithNeutralOwnership(dt) {
    const now = this.engine.time;
    this.skillFields = (this.skillFields ?? []).filter((field) => {
      if (now >= field.until) return false;
      if (field.kind === 'fire_wall') {
        const source = normalizeSource({
          team: field.__pvpSourceTeam,
          ownerUserId: field.__pvpSourceOwnerUserId,
        });
        for (const unit of [...this.engine.units]) {
          if (!unit.alive) continue;
          if (unit.team !== field.targetTeam && !isNeutralBarrier(unit)) continue;
          if (Math.abs(unit.col - field.col) >= 0.55) continue;
          withDamageSource(source, () => this.engine.skills.applyContinuousDamage(unit, field.dps * dt));
        }
      }
      return true;
    });
  };
}
