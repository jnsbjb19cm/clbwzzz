import { BattleEngine } from './BattleEngine.js';
import { BattleUnit } from './BattleUnit.js';
import { roundBattleAmount } from './BattleConfig.js';
import { BattleSkillSystem } from '../systems/BattleSkillSystem.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRuleConvergence20260830');
const ALIEN_SENTINEL_GROUND_FLAG = Symbol.for('clbwzzz.alienSentinelGroundRule20260830');
const ALIEN_SENTINEL_CARD_ID = 38;
const SCARECROW_FAMILY = new Set([19, 32]);
const DANDELION_FAMILY = new Set([22, 36]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isLaunchOwnedProjectile(projectile) {
  return Boolean(
    projectile
      && !projectile.visualOnly
      && !projectile.pierce
      && !projectile.targetBase
      && (projectile.trajectory === 'straight' || projectile.trajectory === 'parabola'),
  );
}

function detachLegacyProjectileTarget(projectile) {
  if (!isLaunchOwnedProjectile(projectile)) return;
  if (!projectile.__launchOwnedTargetDetached20260830) {
    projectile.__launchOwnedTargetDetached20260830 = true;
    projectile.__launchOwnedOriginalTargetUid = projectile.targetUid ?? null;
  }
  projectile.targetUid = null;
  projectile.hitLane = finite(projectile.flightEndLane, projectile.hitLane);
  projectile.hitCol = finite(projectile.flightEndCol, projectile.hitCol);
  projectile.resolveCol = finite(projectile.flightEndCol, projectile.resolveCol ?? projectile.hitCol);
}

export function installAlienSentinelGroundRule20260830() {
  if (globalThis[ALIEN_SENTINEL_GROUND_FLAG]) return;
  globalThis[ALIEN_SENTINEL_GROUND_FLAG] = true;

  const previousTryAbduct = BattleEngine.prototype.tryAbduct;
  BattleEngine.prototype.tryAbduct = function tryAbductAnyLowQualityGroundUnit(unit, ...args) {
    if (Number(unit?.cardId) !== ALIEN_SENTINEL_CARD_ID) {
      return previousTryAbduct.call(this, unit, ...args);
    }
    if (Number.isFinite(Number(unit?._alienSentinelResolveAt))) return false;
    if (!unit?.alive || unit._abductUntil || (unit._abductCdUntil && finite(this.time) < finite(unit._abductCdUntil))) {
      return false;
    }

    const victims = this.contactEnemies(unit).filter(
      (target) => !target.isFlying?.() && finite(target.quality, 1) < 5,
    );
    if (!victims.length) return false;

    unit._abductCdUntil = finite(this.time) + 5;
    unit._abductUntil = finite(this.time) + 5;
    unit._abductVictimUids = victims.map((victim) => victim.uid);
    for (const victim of victims) {
      victim.frozenUntil = Math.max(finite(victim.frozenUntil), finite(this.time) + 5);
      this.pushLog?.(`【${unit.name}】吸走 ${victim.name}，吸收中…`);
    }
    return true;
  };
}

function installLaunchOwnedProjectileRule() {
  const previousUpdateProjectiles = BattleEngine.prototype.updateProjectiles;
  BattleEngine.prototype.updateProjectiles = function updateProjectilesWithLaunchOwnedTargets(dt) {
    for (const projectile of this.projectiles ?? []) detachLegacyProjectileTarget(projectile);
    return previousUpdateProjectiles.call(this, dt);
  };
}

function shuffled(values, rng) {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const roll = Math.max(0, Math.min(0.999999, finite(rng?.(), Math.random())));
    const other = Math.floor(roll * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

function canonicalizeRemovedTeam(engine, unit) {
  if (engine.__pvpActiveSkillSide !== 'enemy') return;
  if (unit.team === 'player') unit.team = 'enemy';
  else if (unit.team === 'enemy') unit.team = 'player';
}

function phaseOutEnemies(skillSystem, effect) {
  const engine = skillSystem.engine;
  const now = finite(engine.time);
  const candidates = (engine.units ?? []).filter((unit) =>
    unit?.alive
      && unit.team === 'enemy'
      && unit.pvpNeutral !== true
      && unit.bossCommanderOnly !== true
      && unit.isBoss !== true
      && unit.pvpBoss !== true,
  );
  if (!candidates.length) return 0;

  const minCount = Math.max(1, Math.floor(finite(effect.countMin, 3)));
  const maxCount = Math.max(minCount, Math.floor(finite(effect.countMax, 5)));
  const rng = typeof engine.rng === 'function' ? engine.rng : Math.random;
  const wanted = minCount + Math.floor(Math.max(0, Math.min(0.999999, finite(rng(), 0))) * (maxCount - minCount + 1));
  const selected = shuffled(candidates, rng).slice(0, Math.min(candidates.length, wanted));
  const selectedSet = new Set(selected);
  const duration = Math.max(0.1, finite(effect.duration, 10));

  engine.__phaseOutRecords20260830 ??= [];
  engine.units = (engine.units ?? []).filter((unit) => !selectedSet.has(unit));
  for (const unit of selected) {
    const record = {
      unit,
      uid: Number(unit.uid),
      lane: finite(unit.lane),
      col: finite(unit.col),
      restoreAt: now + duration,
    };
    canonicalizeRemovedTeam(engine, unit);
    unit._phaseOutUntil20260830 = record.restoreAt;
    unit._phaseOutOriginalLane20260830 = record.lane;
    unit._phaseOutOriginalCol20260830 = record.col;
    engine.__phaseOutRecords20260830.push(record);
  }

  const removedUids = new Set(selected.map((unit) => Number(unit.uid)));
  for (const unit of engine.units ?? []) {
    if (removedUids.has(Number(unit.lockedTargetUid))) unit.lockedTargetUid = null;
  }
  engine.pushLog?.(`【幻之境】${selected.length} 张敌方卡牌暂时消失 ${duration} 秒`);
  return selected.length;
}

function restorePhasedUnits(engine) {
  const records = engine.__phaseOutRecords20260830 ?? [];
  if (!records.length) return;
  const now = finite(engine.time);
  const waiting = [];
  for (const record of records) {
    if (now + 1e-9 < record.restoreAt) {
      waiting.push(record);
      continue;
    }
    const unit = record.unit;
    if (!unit) continue;
    unit.lane = record.lane;
    unit.col = record.col;
    unit.renderX = record.col;
    unit.renderY = record.lane;
    unit.alive = true;
    unit.hp = Math.max(1, finite(unit.maxHp, 1));
    unit.attackingBase = false;
    unit.lockedTargetUid = null;
    unit._deathAnimStartedAt = undefined;
    unit._deathUntil = undefined;
    unit._deathResolved = false;
    unit._phaseOutUntil20260830 = 0;
    if (!(engine.units ?? []).some((candidate) => Number(candidate.uid) === Number(unit.uid))) {
      engine.units.push(unit);
      engine.initUnitSpawnFade?.(unit);
    }
  }
  engine.__phaseOutRecords20260830 = waiting;
}

function installSkillSemanticRules() {
  const previousApplyEffect = BattleSkillSystem.prototype.applyEffect;
  BattleSkillSystem.prototype.applyEffect = function applyEffectWithCorrect547And550(skillId, effect, target, card) {
    const id = Number(skillId);
    if (id === 547 || effect?.kind === 'base_invulnerable') {
      const side = this.engine.__pvpActiveSkillSide === 'enemy' ? 'enemy' : 'player';
      this.engine.__baseInvulnUntil20260830 ??= { player: 0, enemy: 0 };
      this.engine.__baseInvulnUntil20260830[side] = Math.max(
        finite(this.engine.__baseInvulnUntil20260830[side]),
        finite(this.engine.time) + Math.max(0.1, finite(effect?.duration, 10)),
      );
      this.engine.pushLog?.('【铁壳功】己方基地进入无敌状态');
      return;
    }
    if (id === 550 || effect?.kind === 'phase_out_enemies') {
      phaseOutEnemies(this, effect ?? {});
      return;
    }
    return previousApplyEffect.call(this, skillId, effect, target, card);
  };

  const previousTick = BattleSkillSystem.prototype.tick;
  BattleSkillSystem.prototype.tick = function tickWithPhaseOutRestore(dt) {
    const result = previousTick.call(this, dt);
    restorePhasedUnits(this.engine);
    return result;
  };

  const previousDamageBase = BattleEngine.prototype.damageBase;
  BattleEngine.prototype.damageBase = function damageBaseWithInvulnerability(side, amount) {
    const until = finite(this.__baseInvulnUntil20260830?.[side]);
    if ((side === 'player' || side === 'enemy') && finite(this.time) < until) {
      this.pushLog?.(`${side === 'player' ? '己方' : '敌方'}基地处于无敌状态`);
      return 0;
    }
    return previousDamageBase.call(this, side, amount);
  };
}

function installTalentSemanticRules() {
  BattleEngine.prototype.applyTalentCardBonus = function applyTalentCardBonusConverged(unit) {
    if (!unit || unit.__talentApplied20260830) return unit;
    unit.__talentApplied20260830 = true;
    unit.__battleEngine20260830 = this;
    if (unit.team !== 'player') return unit;

    const bonus = this.talentBonus ?? {};
    let atkPct = Math.max(0, finite(bonus.globalAtkPct, bonus.atkPct));
    let hpPct = Math.max(0, finite(bonus.globalHpPct, bonus.hpPct));
    if (SCARECROW_FAMILY.has(Number(unit.cardId))) atkPct += Math.max(0, finite(bonus.scarecrowAtkPct));
    if (DANDELION_FAMILY.has(Number(unit.cardId))) hpPct += Math.max(0, finite(bonus.dandelionHpPct));

    if (unit.atk > 0 && atkPct > 0) unit.atk = roundBattleAmount(unit.atk * (1 + atkPct / 100));
    if (hpPct > 0) {
      unit.maxHp = Math.max(1, roundBattleAmount(unit.maxHp * (1 + hpPct / 100)));
      unit.baseMaxHp = unit.maxHp;
      unit.hp = unit.maxHp;
    }
    return unit;
  };

  const previousGetAuraBonus = BattleEngine.prototype.getAuraBonus;
  BattleEngine.prototype.getAuraBonus = function getAuraBonusWithConditionalTalent(unit) {
    let bonus = finite(previousGetAuraBonus.call(this, unit));
    if (unit?.team === 'player' && finite(this.heroHp) < 100) {
      const pct = Math.max(0, finite(this.talentBonus?.lowBaseAtkPct));
      if (pct > 0) bonus += finite(unit.atk) * pct / 100;
    }
    return roundBattleAmount(bonus);
  };

  const previousTakeDamage = BattleUnit.prototype.takeDamage;
  BattleUnit.prototype.takeDamage = function takeDamageWithConditionalTalent(amount, now = 0) {
    let nextAmount = finite(amount);
    const engine = this.__battleEngine20260830;
    if (this.team === 'player' && engine && finite(engine.heroHp) < 100) {
      const pct = Math.max(0, Math.min(90, finite(engine.talentBonus?.lowBaseDamageReductionPct)));
      if (pct > 0) nextAmount *= 1 - pct / 100;
    }
    return previousTakeDamage.call(this, nextAmount, now);
  };

  const previousDoAreaHeal = BattleEngine.prototype.doAreaHeal;
  BattleEngine.prototype.doAreaHeal = function doAreaHealWithDandelionTalent(lane, col, team, amount, radius = 1) {
    let nextAmount = finite(amount);
    if (team === 'player' && finite(this.talentBonus?.dandelionHealPct) > 0) {
      const healer = (this.units ?? []).find((unit) =>
        unit?.alive
          && unit.team === team
          && DANDELION_FAMILY.has(Number(unit.cardId))
          && Number(unit.lastHealTick) === Number(this.battleTick)
          && Number(unit.lane) === Number(lane)
          && Math.abs(finite(unit.col) - finite(col)) < 0.51,
      );
      if (healer) nextAmount *= 1 + Math.max(0, finite(this.talentBonus.dandelionHealPct)) / 100;
    }
    return previousDoAreaHeal.call(this, lane, col, team, nextAmount, radius);
  };

  const previousSpawnSummon = BattleEngine.prototype.spawnSummon;
  BattleEngine.prototype.spawnSummon = function spawnSummonWithTalent(...args) {
    const unit = previousSpawnSummon.apply(this, args);
    if (unit?.team === 'player') this.applyTalentCardBonus(unit);
    return unit;
  };

  const previousTick = BattleEngine.prototype.tick;
  BattleEngine.prototype.tick = function tickWithEngineBackrefs(dt) {
    for (const unit of this.units ?? []) unit.__battleEngine20260830 = this;
    const result = previousTick.call(this, dt);
    for (const unit of this.units ?? []) unit.__battleEngine20260830 = this;
    return result;
  };
}

export function installBattleRuleConvergence20260830() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installAlienSentinelGroundRule20260830();
  installLaunchOwnedProjectileRule();
  installSkillSemanticRules();
  installTalentSemanticRules();
}
