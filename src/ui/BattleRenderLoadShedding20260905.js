import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwz.battleRenderLoadShedding20260905');

function countAlive(engine) {
  let count = 0;
  for (const unit of engine?.units ?? []) if (unit?.alive) count += 1;
  return count;
}

function countEffects(engine) {
  return (engine?.floats?.length ?? 0)
    + (engine?.impactFx?.length ?? 0)
    + (engine?.bumpFx?.length ?? 0)
    + (engine?.deployEffects?.length ?? 0)
    + (engine?.skillFx?.length ?? engine?.skillEffects?.length ?? 0)
    + (engine?.projectiles?.length ?? 0);
}

function targetFrameMs(units, effects) {
  if (units >= 44 || effects >= 68) return 50;       // 20 FPS，极端团战优先稳定输入/网络
  if (units >= 30 || effects >= 44) return 1000 / 24;
  if (units >= 16 || effects >= 24) return 1000 / 30;
  return 0;
}

export function installBattleRenderLoadShedding20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithLoadShedding20260905(engine) {
    const units = countAlive(engine);
    const effects = countEffects(engine);
    const frameMs = targetFrameMs(units, effects);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    this.__perfUnits20260905 = units;
    this.__perfEffects20260905 = effects;
    this.__perfTargetFrameMs20260905 = frameMs;
    this.__perfHeavyVisuals20260905 = units >= 20 || effects >= 28;

    if (frameMs > 0
      && Number.isFinite(this.__perfLastDrawAt20260905)
      && now - this.__perfLastDrawAt20260905 < frameMs) {
      return;
    }
    this.__perfLastDrawAt20260905 = frameMs > 0 ? now : undefined;

    // 原渲染器40个特效才切低画质；多目标技能在30~40个对象时已经会抖。
    // 临时 forceLowQuality，只影响这一帧的装饰层，不改变游戏设置，也不改变伤害/动画状态。
    const previousForceLowQuality = this.forceLowQuality;
    if (this.__perfHeavyVisuals20260905) this.forceLowQuality = true;
    try {
      return previousDraw.call(this, engine);
    } finally {
      this.forceLowQuality = previousForceLowQuality;
    }
  };

  // 品质光环每个单位每帧都包含径向渐变+动画包；大军团时是高成本纯装饰。
  // 重负载时只去掉这层，不隐藏单位、血条、名字、冰冻/眩晕等战斗状态。
  const previousDrawUnitHalo = BattleRenderer.prototype.drawUnitHalo;
  BattleRenderer.prototype.drawUnitHalo = function drawUnitHaloLoadShedding20260905(ctx, unit, layout) {
    if (this.__perfHeavyVisuals20260905) return;
    return previousDrawUnitHalo.call(this, ctx, unit, layout);
  };

  if (typeof window !== 'undefined') {
    window.__battleRenderLoadShedding20260905 = () => ({
      enabled: true,
      policy: {
        medium: '>=16 units or >=24 effects -> 30fps cap',
        heavy: '>=30 units or >=44 effects -> 24fps cap',
        extreme: '>=44 units or >=68 effects -> 20fps cap',
        decorativeHaloDisabledAt: '>=20 units or >=28 effects',
      },
    });
  }
}
