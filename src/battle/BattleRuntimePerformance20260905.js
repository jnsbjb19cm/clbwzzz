import { BattleEngine } from './BattleEngine.js';
import { roundBattleAmount } from './BattleConfig.js';

const PATCH_FLAG = Symbol.for('clbwz.battleRuntimePerformance20260905');

const NORMAL_LIMITS = Object.freeze({
  floats: 40,
  impacts: 32,
  bumps: 18,
  deploys: 18,
  skills: 8,
});

const HEAVY_LIMITS = Object.freeze({
  floats: 24,
  impacts: 20,
  bumps: 10,
  deploys: 10,
  skills: 5,
});

function unitCount(engine) {
  return (engine?.units ?? []).reduce((count, unit) => count + (unit?.alive ? 1 : 0), 0);
}

function limitsFor(engine) {
  return unitCount(engine) >= 24 ? HEAVY_LIMITS : NORMAL_LIMITS;
}

function trimOldest(array, max) {
  if (!Array.isArray(array) || array.length <= max) return;
  array.splice(0, array.length - max);
}

function installFloatBudget() {
  const previous = BattleEngine.prototype.spawnFloat;
  BattleEngine.prototype.spawnFloat = function spawnFloatPerformance20260905(lane, col, amount) {
    const limits = limitsFor(this);
    if (limits === HEAVY_LIMITS) {
      const amt = roundBattleAmount(amount);
      const existing = (this.floats ?? []).find((float) => (
        Number(float.lane) === Number(lane)
        && Math.abs(Number(float.col) - Number(col)) <= 0.34
        && Number(float.life) > 0.78
        && Math.sign(Number(float.amount) || 0) === Math.sign(amt)
      ));
      if (existing) {
        existing.amount = roundBattleAmount((Number(existing.amount) || 0) + amt);
        existing.life = Math.max(Number(existing.life) || 0, 1.05);
        existing.col = (Number(existing.col) + Number(col)) / 2;
        trimOldest(this.floats, limits.floats);
        return;
      }
    }
    const result = previous.call(this, lane, col, amount);
    trimOldest(this.floats, limits.floats);
    return result;
  };
}

function installImpactBudget() {
  const previous = BattleEngine.prototype.spawnImpactFx;
  BattleEngine.prototype.spawnImpactFx = function spawnImpactFxPerformance20260905(lane, col, amount, res = null) {
    this.impactFx ??= [];
    const limits = limitsFor(this);
    if (limits === HEAVY_LIMITS) {
      const recent = [...this.impactFx].reverse().find((impact) => (
        Number(impact.lane) === Number(lane)
        && Math.abs(Number(impact.col) - Number(col)) <= 0.28
        && String(impact.res ?? '') === String(res ?? '')
        && Number(impact.t) <= 0.12
      ));
      if (recent) {
        recent.amount = roundBattleAmount((Number(recent.amount) || 0) + (Number(amount) || 0));
        recent.life = Math.max(Number(recent.life) || 0, 1.2);
        return;
      }
    }
    const result = previous.call(this, lane, col, amount, res);
    trimOldest(this.impactFx, limits.impacts);
    return result;
  };
}

function installSmallFxBudgets() {
  const previousBump = BattleEngine.prototype.spawnBumpFx;
  BattleEngine.prototype.spawnBumpFx = function spawnBumpFxPerformance20260905(...args) {
    const result = previousBump.apply(this, args);
    trimOldest(this.bumpFx, limitsFor(this).bumps);
    return result;
  };

  const previousDeploy = BattleEngine.prototype.pushDeployEffect;
  BattleEngine.prototype.pushDeployEffect = function pushDeployEffectPerformance20260905(...args) {
    const result = previousDeploy.apply(this, args);
    trimOldest(this.deployEffects, limitsFor(this).deploys);
    return result;
  };

  const previousSkill = BattleEngine.prototype.pushSkillEffect;
  BattleEngine.prototype.pushSkillEffect = function pushSkillEffectPerformance20260905(...args) {
    const result = previousSkill.apply(this, args);
    trimOldest(this.skillFx, limitsFor(this).skills);
    this.skillEffects = this.skillFx;
    return result;
  };
}

function installPeriodicCleanup() {
  const previousUpdateFx = BattleEngine.prototype.updateFx;
  BattleEngine.prototype.updateFx = function updateFxPerformance20260905(dt) {
    const result = previousUpdateFx.call(this, dt);
    const limits = limitsFor(this);
    trimOldest(this.impactFx, limits.impacts);
    trimOldest(this.bumpFx, limits.bumps);
    trimOldest(this.skillFx, limits.skills);
    trimOldest(this.deployEffects, limits.deploys);
    trimOldest(this.floats, limits.floats);
    this.skillEffects = this.skillFx;
    return result;
  };
}

function installClientRenderLoadShedding() {
  // PvpBattle 的 Node 无头环境会伪造 window/document 供共用战斗引擎加载，
  // 所以不能仅用 typeof window 判断。真实浏览器必须同时具有 navigator + RAF。
  const realBrowser = typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof window.requestAnimationFrame === 'function';
  if (!realBrowser) return;
  void import('../ui/BattleRenderLoadShedding20260905.js')
    .then(({ installBattleRenderLoadShedding20260905 }) => {
      installBattleRenderLoadShedding20260905?.();
    })
    .catch((error) => {
      console.warn('[clbwz] battle render load-shedding patch failed to load', error);
    });
}

export function installBattleRuntimePerformance20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installFloatBudget();
  installImpactBudget();
  installSmallFxBudgets();
  installPeriodicCleanup();
  installClientRenderLoadShedding();
}

export const BATTLE_RUNTIME_PERFORMANCE_20260905 = Object.freeze({
  heavyUnitThreshold: 24,
  normal: NORMAL_LIMITS,
  heavy: HEAVY_LIMITS,
});
