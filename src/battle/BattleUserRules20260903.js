import { BattleEngine } from './BattleEngine.js';
import { BattleUnit } from './BattleUnit.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleUserRules20260903');
const FLYING_PEACH_CARD_ID = 40;
const PHANTOM_FLYING_NINJA_CARD_ID = 45;
const PEACH_SUICIDE_FX = 'peach-suicide-burst';
const PEACH_SUICIDE_CONTACT_COL = 1.0;

function isFlyingPeach(unit) {
  return Number(unit?.cardId) === FLYING_PEACH_CARD_ID && Number(unit?.viewType) === 6;
}

function clearPeachLandingState(unit) {
  if (!isFlyingPeach(unit)) return;
  unit._aerialLandingRequested = false;
  unit._baseLandingRequested = false;
  unit._aerialLandingUntil = 0;
  unit._aerialLanded = false;
  unit._aerialWasFlying = true;
}

function pushPeachSuicideFx(engine, unit) {
  if (!engine || !unit || unit._peachSuicideFxDone) return;
  unit._peachSuicideFxDone = true;
  engine.impactFx ??= [];
  engine.impactFx.push({
    kind: PEACH_SUICIDE_FX,
    lane: Number(unit.lane) || 0,
    col: Number(unit.col) || 0,
    amount: 0,
    // authority snapshot 已经会同步 impact.res；同时写入 res，使联机端无需新增协议字段也能识别自爆FX。
    res: PEACH_SUICIDE_FX,
    t: 0,
    life: 0.82,
  });
}

function phantomDiedBeforeLanding(unit) {
  return Number(unit?.cardId) === PHANTOM_FLYING_NINJA_CARD_ID
    && Number(unit?.viewType) === 6
    && unit?._aerialLanded !== true;
}

export function installBattleUserRules20260903() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousIsFlying = BattleUnit.prototype.isFlying;
  BattleUnit.prototype.isFlying = function isFlyingWithPermanentPeachRule() {
    if (isFlyingPeach(this)) {
      return this.alive !== false;
    }
    return previousIsFlying.call(this);
  };

  const previousRequestAerialLanding = BattleEngine.prototype.requestAerialLanding;
  BattleEngine.prototype.requestAerialLanding = function requestAerialLandingWithPermanentPeachRule(unit, options = {}) {
    if (isFlyingPeach(unit)) {
      clearPeachLandingState(unit);
      return false;
    }
    return previousRequestAerialLanding.call(this, unit, options);
  };

  const previousForceAerialLanding = BattleEngine.prototype.forceAerialLanding;
  BattleEngine.prototype.forceAerialLanding = function forceAerialLandingWithPermanentPeachRule(unit, ...args) {
    if (isFlyingPeach(unit)) {
      clearPeachLandingState(unit);
      return false;
    }
    return previousForceAerialLanding.call(this, unit, ...args);
  };

  // 飞行水蜜桃必须比普通“贴身自爆”更早发现空中目标。
  // 只扩大40号卡的横向触发距离；黑铁土豆雷/热血火龙果继续沿用核心0.62列规则。
  const previousUnitsInSuicideContact = BattleEngine.prototype.unitsInSuicideContact;
  BattleEngine.prototype.unitsInSuicideContact = function unitsInSuicideContactWithPeachRange(unit, ...args) {
    if (!isFlyingPeach(unit)) {
      return previousUnitsInSuicideContact.call(this, unit, ...args);
    }
    return (this.units ?? []).filter((target) => {
      if (!target?.alive || target.team === unit.team) return false;
      if (Number(target.lane) !== Number(unit.lane)) return false;
      if (Math.abs(Number(target.col) - Number(unit.col)) >= PEACH_SUICIDE_CONTACT_COL) return false;
      return this.suicideTargetFilter(unit, target);
    });
  };

  // 自爆必须先正常登记死亡动画，再把单位标记为“自爆已结算”。
  // 旧实现最后把 _deathUntil 强行改成当前时刻，导致死亡动画一帧都看不到。
  BattleEngine.prototype.finishSuicideUnit = function finishSuicideUnitWithDeathAnimation(unit) {
    if (!unit || unit._suicideDeathHandled) return false;
    unit._suicideDeathHandled = true;
    unit.alive = false;
    unit._suicideRemoved = false;
    this.onUnitDeath(unit);
    unit._suicideRemoved = true;
    unit.alive = false;
    if (!(Number(unit._deathUntil) > Number(this.time))) {
      unit._deathUntil = Number(this.time) + 0.45;
    }
    return true;
  };

  const previousTrySuicideBomber = BattleEngine.prototype.trySuicideBomber;
  BattleEngine.prototype.trySuicideBomber = function trySuicideBomberWithPeachFx(unit, ...args) {
    if (isFlyingPeach(unit)) clearPeachLandingState(unit);
    const result = previousTrySuicideBomber.call(this, unit, ...args);
    if (result && isFlyingPeach(unit)) pushPeachSuicideFx(this, unit);
    return result;
  };

  const previousOnUnitDeath = BattleEngine.prototype.onUnitDeath;
  BattleEngine.prototype.onUnitDeath = function onUnitDeathWithPhantomLandingRule(unit, ...args) {
    if (!phantomDiedBeforeLanding(unit)) {
      return previousOnUnitDeath.call(this, unit, ...args);
    }

    // 幻.飞行忍者只有“真正完成落地”后死亡才允许触发死亡分身。
    // 空中、下坠中、落地动画尚未完成时死亡统一按“飞行中死亡”处理，绝不生成 60 号分身。
    // 核心 onUnitDeath 以 _suicideKilled 作为“禁止 45 号死亡召唤”的现有开关，
    // 这里仅在本次死亡结算期间临时置 true，避免改动其它死亡逻辑/掉落/击杀统计。
    const previousSuicideKilled = unit._suicideKilled;
    unit._suicideKilled = true;
    try {
      return previousOnUnitDeath.call(this, unit, ...args);
    } finally {
      unit._suicideKilled = previousSuicideKilled;
    }
  };
}
