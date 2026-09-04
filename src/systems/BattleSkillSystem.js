import { COLS, LANES, roundBattleAmount } from '../battle/BattleConfig.js';
import {
  getSkillResolutionDelay,
  getSkillVisualDuration,
} from '../battle/SkillAnimationConfig.js';
import { audio } from '../core/AudioManager.js';
import {
  getSkillCooldownSec,
  getSkillEffect,
  getSkillMpCost,
  isActiveSkillCard,
} from '../core/SkillRegistry.js';

const BOSS_TARGETING_SKILL_ID = 517;

function isHostileSkillTarget(unit, engine = null, skillId = null) {
  const hostile = Boolean(
    unit?.alive && (unit.team === 'enemy' || unit.team === 'neutral' || unit.pvpNeutral),
  );
  if (!hostile) return false;
  const commanderBoss = Boolean(unit?.isBoss || unit?.pvpBoss || unit?.bossCommanderOnly);
  if (engine?.coopBoss && commanderBoss && Number(skillId) !== BOSS_TARGETING_SKILL_ID) return false;
  return true;
}

export class BattleSkillSystem {
  constructor(engine, db) {
    this.engine = engine;
    this.db = db;
    this.cooldowns = {};
    this.pendingSkillId = null;
    this.pendingEffect = null;
    this.pendingCasts = [];
  }

  getSkillCard(skillId) {
    const card = this.db.getById(skillId);
    return card && isActiveSkillCard(card) ? card : null;
  }

  canCast(skillId) {
    if (this.engine.status !== 'playing') {
      return { ok: false, error: 'battle ended' };
    }
    const card = this.getSkillCard(skillId);
    if (!card) return { ok: false, error: 'invalid skill' };
    const mp = getSkillMpCost(card);
    if (!this.engine.trainingMode && this.engine.heroMp < mp) {
      return { ok: false, error: `not enough MP: ${mp}` };
    }
    const cd = this.cooldowns[skillId] ?? 0;
    if (!this.engine.trainingMode && cd > 0) {
      return { ok: false, error: `cooldown ${cd.toFixed(0)}s` };
    }
    const effect = getSkillEffect(skillId);
    if (!effect) return { ok: false, error: 'missing skill effect' };
    return { ok: true, card, effect, mpCost: mp };
  }
  beginCast(skillId) {
    const check = this.canCast(skillId);
    if (!check.ok) return check;
    if (check.effect.needsTarget) {
      this.pendingSkillId = skillId;
      this.pendingEffect = check.effect;
      this.engine.cancelPlacing();
      return { ok: true, needsTarget: true, card: check.card, effect: check.effect };
    }
    return this.resolveCast(skillId);
  }

  cancelTargeting() {
    this.pendingSkillId = null;
    this.pendingEffect = null;
    this.engine.skillTargetError = '';
  }

  tryTarget(lane, col) {
    if (!this.pendingSkillId || !this.pendingEffect) {
      return { ok: false, error: 'no pending skill' };
    }
    if (
      !Number.isInteger(lane) ||
      !Number.isInteger(col) ||
      lane < 0 ||
      lane >= LANES ||
      col < 0 ||
      col >= COLS
    ) {
      return { ok: false, error: 'skill unavailable' };
    }
    return this.resolveCast(this.pendingSkillId, { lane, col });
  }

  resolveCast(skillId, target = null) {
    const check = this.canCast(skillId);
    if (!check.ok) return check;

    const { card, effect, mpCost } = check;
    if (effect.needsTarget && !target) {
      return { ok: false, error: 'target required' };
    }
    const cdSec = getSkillCooldownSec(card);

    if (!this.engine.trainingMode) {
      this.engine.heroMp = roundBattleAmount(this.engine.heroMp - mpCost);
      this.cooldowns[skillId] = cdSec;
    }
    this.pendingSkillId = null;
    this.pendingEffect = null;
    this.engine.skillTargetError = '';

    this.showEffect(skillId, effect, target);
    this.pendingCasts.push({
      at: this.engine.time + getSkillResolutionDelay(skillId, 0.9),
      skillId,
      effect,
      target: target ? { lane: target.lane, col: target.col } : null,
      card,
    });
    audio.playSkill(skillId);
    this.engine.pushLog('skill cast');
    return { ok: true, message: 'skill cast' };
  }

  showEffect(skillId, effect, target) {
    const eng = this.engine;
    // Meteor rain (517): 原实现 push 8 个全屏 fx，drawSkillFx 会对每个 fx 全屏画一遍
    // → 同一动画叠 8 层(t 同步推进)，画面糊/错乱。改为只推 1 个全屏 fx，
    // 陨石雨本来就是 position=2 全屏动画，落点分散交给 impactFx 表现。
    if (effect.kind === 'damage_all_enemies') {
      // 原版陨石雨全屏动画循环播放两遍：动画慢放后一遍 1.18s，两遍 = 2.37s
      eng.pushSkillEffect?.('damage_all_enemies',
        null, 0, skillId,
        getSkillVisualDuration(skillId, 0.9), true);
      return;
    }
    if (effect.kind === 'firebird') {
      eng.pushSkillEffect?.(
        effect.kind,
        null,
        0,
        skillId,
        getSkillVisualDuration(skillId, 0.9),
        false,
      );
      return;
    }
    const animationDuration = getSkillVisualDuration(skillId, 0.9);
    const requestedDuration = effect.duration ?? effect.burnSec ?? 0.9;
    eng.pushSkillEffect?.(
      effect.kind,
      target,
      effect.radius ?? 0,
      skillId,
      Math.max(requestedDuration, animationDuration),
      requestedDuration > animationDuration + 0.05,
    );
  }

  applyEffect(skillId, effect, target, card) {
    const eng = this.engine;
    const t = eng.time;

    switch (effect.kind) {
      case 'aoe_damage':
        this.damageInRadius(target.lane, target.col, effect.radius, effect.damage, skillId);
        break;
      case 'cell_damage': {
        this.damageInRadius(target.lane, target.col, 0, effect.damage, skillId);
        if (effect.freezeSec) {
          const cell = this.engine.getUnitsAt(target.lane, Math.round(target.col));
          for (const u of cell) {
            if (!isHostileSkillTarget(u, eng, skillId)) continue;
            u.frozenUntil = Math.max(u.frozenUntil || 0, this.engine.time + effect.freezeSec);
          }
        }
        break;
      }
      case 'row_damage':
        this.damageRow(target.lane, effect.damage, skillId);
        break;
      case 'row_damage_stun':
        for (const unit of [...eng.units]) {
          if (!isHostileSkillTarget(unit, eng, skillId) || unit.lane !== target.lane) continue;
          this.hitUnit(unit, effect.damage);
          if (unit.alive) unit.stunnedUntil = Math.max(unit.stunnedUntil ?? 0, t + effect.stunSec);
        }
        break;
      case 'thunderstorm': {
        const enemies = eng.units.filter((unit) => isHostileSkillTarget(unit, eng, skillId));
        const highestHp = [...enemies].sort((a, b) => b.hp - a.hp)[0];
        const combined = effect.damage * enemies.length;
        for (const unit of [...enemies]) this.hitUnit(unit, effect.damage);
        if (highestHp?.alive && combined > 0) this.hitUnit(highestHp, combined);
        break;
      }
      case 'firebird':
        for (const unit of [...eng.units]) {
          if (!isHostileSkillTarget(unit, eng, skillId)) continue;
          this.hitUnit(unit, effect.damage);
          if (!unit.alive) continue;
          unit.dots = unit.dots ?? [];
          unit.dots.push({ dps: effect.burnDps, until: t + effect.burnSec, every: 1, kind: 'burn' });
        }
        break;
      case 'sacred_revival':
        for (const unit of eng.units) {
          if (!unit.alive || unit.team !== 'player') continue;
          const healed = unit.heal(effect.amount);
          if (healed > 0) eng.spawnFloat(unit.lane, unit.col, healed);
          unit.hots = unit.hots ?? [];
          unit.hots.push({
            amount: effect.hotAmount,
            every: effect.hotEvery,
            nextAt: t + effect.hotEvery,
            until: t + effect.duration,
          });
        }
        break;
      case 'fatal_curse':
        for (const unit of eng.units) {
          if (!isHostileSkillTarget(unit, eng, skillId)) continue;
          unit.dots = unit.dots ?? [];
          unit.dots.push({ dps: effect.dps, until: t + effect.duration, every: 1, kind: 'curse' });
          unit.damageTakenBonus = Math.max(unit.damageTakenBonus ?? 0, effect.vulnerability);
          unit.damageTakenBonusUntil = Math.max(unit.damageTakenBonusUntil ?? 0, t + effect.duration);
        }
        break;
      case 'enemy_hero_damage':
        {
          if (eng.coopBoss && Number(skillId) !== BOSS_TARGETING_SKILL_ID) break;
          const applied = eng.damageBase('enemy', effect.damage);
          if (applied > 0) eng.spawnFloat(2, eng.getOpponentBaseEdgeCol('player'), -applied);
        }
        break;
      case 'enemy_hero_stun':
        // 敌方"英雄"眩晕 = 禁用敌方行动：禁止敌方部署 + 暂停波次出怪（不冻结场上单位）
        {
          const stunSec = effect.stunSec ?? 10;
          eng.enemyDeployLockedUntil = Math.max(eng.enemyDeployLockedUntil ?? 0, t + stunSec);
          eng.enemySpawnHaltUntil = Math.max(eng.enemySpawnHaltUntil ?? 0, t + stunSec);
          eng.pushLog('敌方英雄被眩晕，无法释放技能和部署');
        }
        break;
      case 'aoe_rect': {
        // 4×5 范围（lane 半径 2 × col 半径 1）
        for (const u of [...eng.units]) {
          if (!isHostileSkillTarget(u, eng, skillId)) continue;
          const unitCol = eng.getUnitGridCol(u);
          if (
            Math.abs(u.lane - target.lane) <= (effect.radiusLane ?? 1) &&
            Math.abs(unitCol - target.col) <= (effect.radiusCol ?? 1)
          ) {
            this.hitUnit(u, effect.damage);
          }
        }
        break;
      }
      case 'buff_as_ms':
        // 全场攻速/移速提升（attackSpeed/移动速度加成，持续 duration）
        for (const u of eng.units) {
          if (!u.alive || u.team !== 'player') continue;
          u.tempAsMsUntil = Math.max(u.tempAsMsUntil ?? 0, t + (effect.duration ?? 10));
          u.asMsSpeedUp = 1.6;
        }
        break;
      case 'spawn_portal':
        // 简化：在敌方场地随机生成 3 个"传送门"占位单位（存活数秒后消失）
        {
          const count = effect.count ?? 3;
          for (let i = 0; i < count; i++) {
            const lane = Math.floor(Math.random() * LANES);
            const col = Math.max(1, COLS - 2 - i);
            eng.spawnPortal?.(lane, col, 12) ?? eng.pushLog('召唤传送门');
          }
        }
        break;
      case 'portal_wave':
        // 简化：持续期间每秒在敌方场地生成一只临时小怪
        eng.portalWaveUntil = Math.max(eng.portalWaveUntil ?? 0, t + (effect.duration ?? 10));
        break;
      case 'heal_all_allies':
        for (const u of eng.units) {
          if (!u.alive || u.team !== 'player') continue;
          const healed = u.heal(effect.amount);
          if (healed > 0) eng.spawnFloat(u.lane, u.col, healed);
        }
        break;
      case 'heal_hero':
        {
          const before = eng.heroHp;
          eng.heroHp = roundBattleAmount(
            Math.min(eng.heroMaxHp, eng.heroHp + roundBattleAmount(effect.amount)),
          );
          const healed = roundBattleAmount(eng.heroHp - before);
          if (healed > 0) eng.spawnFloat(2, eng.getOpponentBaseEdgeCol('enemy'), healed);
        }
        break;
      case 'damage_all_enemies':
        for (const u of [...eng.units]) {
          if (!isHostileSkillTarget(u, eng, skillId)) continue;
          this.hitUnit(u, effect.damage);
        }
        break;
      case 'freeze_all_enemies':
        for (const u of eng.units) {
          if (!isHostileSkillTarget(u, eng, skillId)) continue;
          u.frozenUntil = t + effect.freezeSec;
          u.slowedUntil = t + effect.freezeSec + effect.slowSec;
        }
        break;
      case 'invuln_all_allies':
        for (const u of eng.units) {
          if (!u.alive || u.team !== 'player') continue;
          u.invulnUntil = t + effect.duration;
        }
        break;
      case 'buff_atk_allies':
        for (const u of eng.units) {
          if (!u.alive || u.team !== 'player') continue;
          u.tempAtkBonus = (u.tempAtkBonus ?? 0) + effect.amount;
          u.atkBuffUntil = Math.max(u.atkBuffUntil ?? 0, t + effect.duration);
        }
        break;
      case 'buff_max_hp':
        for (const u of eng.units) {
          if (!u.alive || u.team !== 'player') continue;
          u.tempMaxHpBonus = roundBattleAmount((u.tempMaxHpBonus ?? 0) + effect.amount);
          u.maxHp = roundBattleAmount(u.maxHp + effect.amount);
          u.hp = roundBattleAmount(Math.min(u.maxHp, u.hp + effect.amount));
          u.maxHpBuffUntil = Math.max(u.maxHpBuffUntil ?? 0, t + effect.duration);
        }
        break;
      case 'fire_wall':
        eng.activeFields.push({
          kind: 'fire_wall',
          skillId: Number(skillId),
          col: target.col,
          dps: effect.dps,
          until: t + effect.duration,
        });
        break;
      case 'poison_aoe':
        this.poisonInRadius(
          target.lane,
          target.col,
          effect.radius,
          effect.dps,
          effect.duration,
          skillId,
        );
        break;
      default:
        eng.pushLog('skill effect');
        break;
    }
  }

  damageInRadius(centerLane, centerCol, radius, damage, skillId = null) {
    for (const u of [...this.engine.units]) {
      if (!isHostileSkillTarget(u, this.engine, skillId)) continue;
      const unitCol = this.engine.getUnitGridCol(u);
      if (
        Math.abs(u.lane - centerLane) <= radius &&
        Math.abs(unitCol - centerCol) <= radius
      ) {
        this.hitUnit(u, damage);
      }
    }
  }

  damageRow(lane, damage, skillId = null) {
    for (const u of [...this.engine.units]) {
      if (!isHostileSkillTarget(u, this.engine, skillId) || u.lane !== lane) continue;
      this.hitUnit(u, damage);
    }
  }

  poisonInRadius(centerLane, centerCol, radius, dps, duration, skillId = null) {
    const until = this.engine.time + duration;
    for (const u of this.engine.units) {
      if (!isHostileSkillTarget(u, this.engine, skillId)) continue;
      const unitCol = this.engine.getUnitGridCol(u);
      if (
        Math.abs(u.lane - centerLane) <= radius &&
        Math.abs(unitCol - centerCol) <= radius
      ) {
        u.dots = u.dots ?? [];
        u.dots.push({ dps, until, every: 1, kind: 'poison' });
      }
    }
  }

  hitUnit(unit, damage) {
    const vulnerability = (unit.damageTakenBonusUntil ?? 0) > this.engine.time
      ? Number(unit.damageTakenBonus || 0)
      : 0;
    const dmg = roundBattleAmount(damage + vulnerability);
    const applied = unit.takeDamage(dmg, this.engine.time);
    if (applied > 0) this.engine.spawnFloat(unit.lane, unit.col, -applied);
    if (!unit.alive) this.engine.onUnitDeath(unit);
    return applied;
  }

  applyContinuousDamage(unit, amount) {
    unit._continuousDamageCarry = (unit._continuousDamageCarry ?? 0) + amount;
    const ready = Math.floor((unit._continuousDamageCarry + 1e-9) * 10) / 10;
    if (ready < 0.1) return 0;
    unit._continuousDamageCarry -= ready;
    return this.hitUnit(unit, ready);
  }

  tick(dt) {
    if (this.pendingCasts.length) {
      const due = [];
      const waiting = [];
      for (const cast of this.pendingCasts) {
        (this.engine.time >= cast.at ? due : waiting).push(cast);
      }
      this.pendingCasts = waiting;
      for (const cast of due) {
        this.applyEffect(cast.skillId, cast.effect, cast.target, cast.card);
      }
    }
    for (const id of Object.keys(this.cooldowns)) {
      this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    }
    this.tickDots(dt);
    this.tickHots();
    this.tickFields(dt);
    this.tickBuffs();
  }

  tickDots(dt) {
    const now = this.engine.time;
    for (const u of this.engine.units) {
      if (!u.alive || !u.dots?.length) continue;
      let total = 0;
      u.dots = u.dots.filter((d) => {
        const every = Math.max(0.1, Number(d.every) || 1);
        d.nextAt ??= Math.min(d.until, now + every);
        while (now + 1e-6 >= d.nextAt && d.nextAt <= d.until + 1e-6) {
          total += d.dps;
          d.nextAt += every;
        }
        return now < d.until - 1e-6 || d.nextAt <= d.until + 1e-6;
      });
      if (total > 0) this.hitUnit(u, total);
    }
  }

  tickHots() {
    const now = this.engine.time;
    for (const unit of this.engine.units) {
      if (!unit.alive || !unit.hots?.length) continue;
      unit.hots = unit.hots.filter((hot) => {
        if (now > hot.until + 1e-6) return false;
        while (now + 1e-6 >= hot.nextAt && hot.nextAt <= hot.until + 1e-6) {
          const healed = unit.heal(hot.amount);
          if (healed > 0) this.engine.spawnFloat(unit.lane, unit.col, healed);
          hot.nextAt += hot.every;
        }
        return now <= hot.until + 1e-6;
      });
    }
  }

  tickFields(dt) {
    const t = this.engine.time;
    this.engine.activeFields = (this.engine.activeFields ?? []).filter((f) => {
      if (t >= f.until) return false;
      if (f.kind === 'fire_wall') {
        for (const u of [...this.engine.units]) {
          if (!isHostileSkillTarget(u, this.engine, f.skillId)) continue;
          if (Math.abs(u.col - f.col) < 0.55) {
            this.applyContinuousDamage(u, f.dps * dt);
          }
        }
      }
      return true;
    });
  }

  tickBuffs() {
    const t = this.engine.time;
    for (const u of this.engine.units) {
      if (u.atkBuffUntil && t >= u.atkBuffUntil) {
        u.tempAtkBonus = 0;
        u.atkBuffUntil = 0;
      }
      if (u.frozenUntil && t >= u.frozenUntil) {
        u.frozenUntil = 0;
      }
      if (u.damageTakenBonusUntil && t >= u.damageTakenBonusUntil) {
        u.damageTakenBonus = 0;
        u.damageTakenBonusUntil = 0;
      }
      if (u.maxHpBuffUntil && t >= u.maxHpBuffUntil) {
        const bonus = u.tempMaxHpBonus ?? 0;
        u.maxHp = roundBattleAmount(Math.max(1, u.maxHp - bonus));
        u.hp = roundBattleAmount(Math.min(u.hp, u.maxHp));
        u.tempMaxHpBonus = 0;
        u.maxHpBuffUntil = 0;
      }
    }
  }
}
