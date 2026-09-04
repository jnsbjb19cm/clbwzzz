import { BattleEngine } from '../battle/BattleEngine.js';
import {
  TICK_INTERVAL,
  getAttackCooldown,
  roundBattleAmount,
} from '../battle/BattleConfig.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { getCardTraits, isSuicideCard } from '../core/CardTraitRegistry.js';
import { audio } from '../core/AudioManager.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleAttackTimingFix');
const UNLOADED_ATTACK_RELEASE_FALLBACK = 0.22;
const UNLOADED_MUSHROOM_BUBBLE_FALLBACK = 0.12;
const UNLOADED_MUSHROOM_DAMAGE_FALLBACK = 0.22;

function queueAttackRelease(engine, action) {
  engine._pendingAttackReleases ??= [];
  engine._pendingAttackReleases.push(action);
  if (engine._pendingAttackReleases.length > 256) {
    engine._pendingAttackReleases.splice(0, engine._pendingAttackReleases.length - 256);
  }
}

function resolveAttackReleaseDelay(unit) {
  if (!unitAnimPlayer.hasAnim(unit?.res)) return UNLOADED_ATTACK_RELEASE_FALLBACK;
  return Math.max(0.035, unitAnimPlayer.resolveAttackReleaseDelay(unit));
}

function fireProjectileAtReleasedFrame(engine, unit, target, damage, opts = {}) {
  const before = engine.projectiles.length;
  engine.fireProjectile(unit, target, damage, opts);
  for (let index = before; index < engine.projectiles.length; index += 1) {
    const projectile = engine.projectiles[index];
    if (Number(projectile?.sourceUid) !== Number(unit?.uid)) continue;
    projectile.delay = 0;
    projectile.launched = true;
  }
}

function resolveReleasedAttack(engine, action) {
  const unit = engine.units.find((candidate) => candidate.uid === action.sourceUid && candidate.alive);
  if (!unit) return;

  if (action.directStrike === 'all') {
    audio.playSfx('sound/effect/fire/b58.mp3', { tier: 'combat' });
    const victims = engine.units.filter((u) =>
      u.alive
      && u.team !== unit.team
      && !u.isLowTarget?.()
      && u.bossCommanderOnly !== true);
    for (const vic of victims) {
      engine.applyCardHit(unit, vic, action.damage, {
        ranged: true,
        ignoreCombatLayers: true,
      });
      engine.spawnImpactFx(vic.lane, vic.col, action.damage, unit.res);
    }
    engine.pushLog(`【${unit.name}】召唤小蘑菇，全屏造成 ${action.damage} 伤害`);
    return;
  }
  if (action.directStrike === 'farthest') {
    audio.playAttack(unit.cardId, unit);
    const enemies = engine.getEnemiesInLane(unit, unit.lane);
    if (enemies.length) {
      const far = [...enemies].sort((a, b) => b.dist - a.dist)[0].unit;
      engine.applyCardHit(unit, far, action.damage, { ranged: true });
      engine.spawnImpactFx(far.lane, far.col, action.damage, unit.res);
      engine.pushLog(`【${unit.name}】雷电击中 ${far.name}`);
    }
    return;
  }

  audio.playAttack(unit.cardId, unit);

  // BOSS commander 只是展示/指挥模型。普通攻击如果在索敌阶段得到 enemy-base，
  // 出手帧也必须保持 enemy-base 协议；CoopBossBattle.damageBase('enemy') 会在服务端
  // 权威地把这份基地伤害映射到真实 BOSS HP，不能把子弹二次改写为 commander UID。
  if (action.targetBase) {
    if (action.ranged) {
      unit._skipNextAttackAnimation = true;
      fireProjectileAtReleasedFrame(
        engine,
        unit,
        {
          _isBase: true,
          lane: action.lane,
          col: unit.getBaseFracCol(),
          team: action.targetBase,
        },
        action.damage,
        {
          targetBase: action.targetBase,
          trajectory: action.trajectory,
        },
      );
      return;
    }

    if (engine.hasBaseLaneBlocker(unit)) return;
    const baseCol = unit.getBaseFracCol();
    const applied = engine.damageBase(action.targetBase, action.damage);
    if (applied > 0) {
      engine.spawnImpactFx(action.lane, baseCol, applied, unit.res);
      engine.spawnFloat(action.lane, baseCol, -applied);
    }
    return;
  }

  const target = engine.units.find(
    (candidate) => candidate.uid === action.targetUid
      && candidate.alive
      && candidate.team !== unit.team
      && engine.isValidEnemyTarget(unit, candidate)
      && candidate.bossCommanderOnly !== true,
  );

  if (action.ranged) {
    const projectileTarget = target ?? {
      uid: action.targetUid,
      lane: action.targetLane,
      col: action.targetCol,
      team: unit.team === 'player' ? 'enemy' : 'player',
    };
    unit._skipNextAttackAnimation = true;
    fireProjectileAtReleasedFrame(engine, unit, projectileTarget, action.damage, {
      trajectory: action.trajectory,
      targetUid: action.targetUid,
      hitLane: action.targetLane,
      hitCol: action.hitCol,
      resolveCol: action.hitCol,
    });
    if ((getCardTraits(unit.cardId) || {}).shots === 2 && !action._isSecondShot) {
      queueAttackRelease(engine, { ...action, _isSecondShot: true, at: action.at + 0.22 });
    }
    return;
  }

  if (!target || target.lane !== action.targetLane) return;

  engine.resolveMeleeImpact(unit, target, action.damage);
  if (!target.alive) engine.pushLog(`${unit.name} 击败 ${target.name}`);
}

export function installBattleAttackTimingFix() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalTriggerAttack = unitAnimPlayer.triggerAttack.bind(unitAnimPlayer);
  unitAnimPlayer.triggerAttack = function triggerAttackWithoutReleaseReset(unit, engine, duration) {
    if (unit?._skipNextAttackAnimation) {
      unit._skipNextAttackAnimation = false;
      return;
    }
    return originalTriggerAttack(unit, engine, duration);
  };

  const originalTryFirstContactStun = BattleEngine.prototype.tryFirstContactStun;
  BattleEngine.prototype.tryFirstContactStun = function tryFirstContactStunExactlyOnce(unit) {
    if (Number(unit?.cardId) !== 23 || unit._firstContactStun || !unit.alive) {
      return originalTryFirstContactStun.call(this, unit);
    }

    // 核心旧实现会遍历 contactEnemies() 的所有目标一起击晕。这里把这一真实 seam
    // 临时收窄到“移动方向上最先碰到的一个目标”，从而仍走原首碰逻辑/动画/音效，
    // 但一生只会消费一个首碰目标。
    const contacts = this.contactEnemies(unit);
    if (!contacts.length) return false;
    const dir = this.getMoveDir(unit);
    const first = [...contacts].sort((a, b) => {
      const aForward = (a.col - unit.col) * dir;
      const bForward = (b.col - unit.col) * dir;
      const aBehind = aForward < -1e-6 ? 1 : 0;
      const bBehind = bForward < -1e-6 ? 1 : 0;
      if (aBehind !== bBehind) return aBehind - bBehind;
      const aDist = Math.abs(a.col - unit.col);
      const bDist = Math.abs(b.col - unit.col);
      if (Math.abs(aDist - bDist) > 1e-9) return aDist - bDist;
      return Number(a.uid) - Number(b.uid);
    })[0];

    const previousContactEnemies = this.contactEnemies;
    this.contactEnemies = function firstFlyShoeContactOnly(candidate) {
      if (candidate === unit) return first?.alive ? [first] : [];
      return previousContactEnemies.call(this, candidate);
    };

    let result;
    try {
      result = originalTryFirstContactStun.call(this, unit);
    } finally {
      this.contactEnemies = previousContactEnemies;
    }

    if (result) {
      unit._firstAttackDone = true;
      unit._firstStrikeSpecialDone = true;
      unit._flyShoeSpecialUntil = Math.max(
        Number(unit._flyShoeSpecialUntil) || 0,
        Number(unit._forcedAnimUntil) || this.time,
      );
      unit._flyShoeNormalAttackPending = true;
    }
    return result;
  };

  const originalTryMushroomAttack = BattleEngine.prototype.tryMushroomAttack;
  BattleEngine.prototype.tryMushroomAttack = function tryMushroomAttackWithStablePreloadFallback(unit) {
    const animReady = unitAnimPlayer.hasAnim(unit?.res);
    const pendingBefore = this.pendingDamageEvents?.length ?? 0;
    const fxBefore = this.skillFx?.length ?? 0;
    const result = originalTryMushroomAttack.call(this, unit);
    if (!result || animReady) return result;

    const event = this.pendingDamageEvents?.[pendingBefore];
    if (event?.sourceUid === unit.uid) {
      event.at = Math.min(event.at, this.time + UNLOADED_MUSHROOM_DAMAGE_FALLBACK);
    }
    const fx = this.skillFx?.[fxBefore];
    if (fx?.kind === 'mushroom_bubble' && fx.skillId === 58) {
      fx.startAt = Math.min(fx.startAt ?? Infinity, this.time + UNLOADED_MUSHROOM_BUBBLE_FALLBACK);
    }
    return result;
  };

  const originalTrySuicideBomber = BattleEngine.prototype.trySuicideBomber;
  BattleEngine.prototype.trySuicideBomber = function trySuicideBomberWithImpactFx(unit) {
    const victims = this.findSuicideVictims?.(unit)?.map((victim) => ({
      uid: victim.uid,
      lane: victim.lane,
      col: victim.col,
    })) ?? [];
    const hitsBase = Boolean(unit?.attackingBase && !this.hasBaseLaneBlocker(unit));
    const baseCol = hitsBase ? unit.getBaseFracCol() : null;
    const lane = unit?.lane;
    const damage = roundBattleAmount(Math.max(1, Number(unit?.atk) || 1));
    const result = originalTrySuicideBomber.call(this, unit);
    if (!result) return result;

    for (const victim of victims) {
      this.spawnImpactFx(victim.lane, victim.col, damage, unit.res);
    }
    if (hitsBase && baseCol != null) {
      this.spawnImpactFx(lane, baseCol, damage, unit.res);
    }
    return result;
  };

  const originalTryAttack = BattleEngine.prototype.tryAttack;
  BattleEngine.prototype.tryAttack = function tryAttackAtAnimationRelease(unit) {
    if (unit._forcedAnimState && this.time >= (unit._forcedAnimUntil ?? 0)) {
      unit._forcedAnimState = null;
      unit._forcedAnimUntil = 0;
    }
    if (unit.isDefensive() && unit.atk <= 0) return false;
    if (isSuicideCard(unit)) return this.trySuicideBomber(unit);
    if (unit.cardId === 58) return originalTryAttack.call(this, unit);

    // 飞鞋怪在首次物理接触之前绝不能提前进入普通攻击动画；否则攻击动画锁会让它
    // 停在接触距离之外，永远触发不了首碰（23 vs 5 首次相遇卡死的实际根因）。
    if (Number(unit.cardId) === 23 && !unit._firstContactStun && !unit.attackingBase) return false;

    if (Number(unit.cardId) === 23 && unit._firstContactStun) {
      const specialUntil = Math.max(
        Number(unit._flyShoeSpecialUntil) || 0,
        unit._forcedAnimState === 'secondAttackStatus' ? Number(unit._forcedAnimUntil) || 0 : 0,
      );
      if (this.time + 1e-6 < specialUntil) return false;
      if (unit._flyShoeNormalAttackPending) {
        unit._flyShoeNormalAttackPending = false;
        unit.atkTimer = 0;
      }
    }

    if (unit.atkRate === 3 || unit.cardId === 25) {
      return originalTryAttack.call(this, unit);
    }

    unit.atkTimer -= TICK_INTERVAL;
    if (unit.atkTimer > 0) return false;

    if (unit.cardId === 46) {
      const hasEnemy = this.getEnemiesInLane(unit, unit.lane).length > 0;
      if (!hasEnemy) return false;
      unit.atkTimer = Math.max(
        getAttackCooldown(unit.atkSpeed) * this.getAtkSpeedMult(unit),
        unitAnimPlayer.resolveAttackDuration(unit),
      );
      const damage = roundBattleAmount(
        Math.max(1, unit.atk + this.getAuraBonus(unit) + (unit.tempAtkBonus ?? 0)),
      );
      unitAnimPlayer.triggerAttack(unit, this);
      const releaseDelay = resolveAttackReleaseDelay(unit);
      queueAttackRelease(this, {
        at: this.time + releaseDelay,
        sourceUid: unit.uid,
        lane: unit.lane,
        damage,
        ranged: false,
        directStrike: 'farthest',
        targetLane: unit.lane,
        targetCol: unit.col,
      });
      return true;
    }

    const target = this.chooseTarget(unit);
    if (!target) return false;

    unit.atkTimer = Math.max(
      getAttackCooldown(unit.atkSpeed) * this.getAtkSpeedMult(unit),
      unitAnimPlayer.resolveAttackDuration(unit),
    );
    const damage = roundBattleAmount(
      Math.max(1, unit.atk + this.getAuraBonus(unit) + (unit.tempAtkBonus ?? 0)),
    );
    const ranged = Boolean(unit.isRanged?.());
    const trajectory = ranged && unit.isParabola?.() ? 'parabola' : 'straight';

    unitAnimPlayer.triggerAttack(unit, this);
    const releaseDelay = resolveAttackReleaseDelay(unit);

    const action = {
      at: this.time + releaseDelay,
      sourceUid: unit.uid,
      lane: unit.lane,
      damage,
      ranged,
      trajectory,
      targetUid: target._isBase ? null : target.uid,
      targetLane: target.lane,
      targetCol: target.col,
      targetBase: target._isBase
        ? (unit.team === 'player' ? 'enemy' : 'player')
        : null,
      hitCol: target._isBase
        ? target.col
        : (unit.team === 'player' ? target.col - 0.42 : target.col + 0.42),
    };
    queueAttackRelease(this, action);
    return true;
  };

  const originalTick = BattleEngine.prototype.tick;
  BattleEngine.prototype.tick = function tickWithAnimationReleasedAttacks(dt) {
    const result = originalTick.call(this, dt);
    if (!this._pendingAttackReleases?.length) return result;

    const due = [];
    const waiting = [];
    for (const action of this._pendingAttackReleases) {
      (this.time + 1e-6 >= action.at ? due : waiting).push(action);
    }
    this._pendingAttackReleases = waiting;
    for (const action of due) resolveReleasedAttack(this, action);
    return result;
  };
}
