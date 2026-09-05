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

export function installBattleRenderLoadShedding20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithVisualBudget20260905(engine) {
    const units = countAlive(engine);
    const effects = countEffects(engine);

    this.__perfUnits20260905 = units;
    this.__perfEffects20260905 = effects;
    this.__perfTargetFrameMs20260905 = 0;
    this.__perfHeavyVisuals20260905 = units >= 20 || effects >= 28;

    // BattleRenderer 自身历史上仍保留了 >=24 单位/全屏技能时的 30FPS 整帧节流。
    // 每次进入原 draw 前清掉其节流时间戳，确保真正按 RAF 刷新；性能压力只通过
    // 低画质装饰层和 effect cap 消化，绝不跳过单位位移、攻击表现与子弹整帧。
    this._lastHeavyDrawAt = null;

    const previousForceLowQuality = this.forceLowQuality;
    if (this.__perfHeavyVisuals20260905) this.forceLowQuality = true;
    try {
      return previousDraw.call(this, engine);
    } finally {
      this.forceLowQuality = previousForceLowQuality;
      // 原 draw 在重负载帧末会重新写入当前时间；再次清空，避免下一 RAF 被它挡掉。
      this._lastHeavyDrawAt = null;
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
        renderCadence: 'requestAnimationFrame; internal 30FPS throttle neutralized',
        heavyVisuals: '>=20 units or >=28 effects -> low-quality decoration',
        decorativeHaloDisabledAt: '>=20 units or >=28 effects',
      },
    });
  }
}
