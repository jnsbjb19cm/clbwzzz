import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwz.battleRenderLoadShedding20260905');
const HIGH_TIER_HALO_BUDGET = 8;
const NAME_WIDTH_CACHE_LIMIT = 256;
const UNIT_NAME_FONT = 'bold 9px "Microsoft YaHei", sans-serif';

function countUnitLoad(engine) {
  let units = 0;
  let highTierUnits = 0;
  for (const unit of engine?.units ?? []) {
    if (!unit?.alive) continue;
    units += 1;
    const craftQuality = Number(unit.craftQuality);
    const strengthLv = Number(unit.strengthLv);
    if (craftQuality >= 3 || strengthLv >= 4) highTierUnits += 1;
  }
  return { units, highTierUnits };
}

function countEffects(engine) {
  return (engine?.floats?.length ?? 0)
    + (engine?.impactFx?.length ?? 0)
    + (engine?.bumpFx?.length ?? 0)
    + (engine?.deployEffects?.length ?? 0)
    + (engine?.skillFx?.length ?? engine?.skillEffects?.length ?? 0)
    + (engine?.projectiles?.length ?? 0);
}

function shouldShowUnitNames() {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem('clbwz_show_unit_names') !== '0';
}

export function installBattleRenderLoadShedding20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithVisualBudget20260905(engine) {
    const { units, highTierUnits } = countUnitLoad(engine);
    const effects = countEffects(engine);

    this.__perfUnits20260905 = units;
    this.__perfHighTierUnits20260905 = highTierUnits;
    this.__perfEffects20260905 = effects;
    this.__perfTargetFrameMs20260905 = 0;
    this.__perfHeavyVisuals20260905 = units >= 20 || effects >= 28;
    // 4/5级或高品质卡较多时，品质光环的径向渐变+动画包会先成为纯视觉瓶颈。
    // 这里只提前舍弃光环，不提前把单位切成静态精灵，因此移动/攻击表现仍按正常 RAF 跑。
    this.__perfSkipHalos20260905 = this.__perfHeavyVisuals20260905
      || highTierUnits >= HIGH_TIER_HALO_BUDGET;
    // 原版每个单位名称都会读 localStorage；改成每个战斗帧只读一次。
    this.__perfShowUnitNames20260905 = shouldShowUnitNames();

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

  // 品质光环每个单位每帧都包含径向渐变+动画包；大军团或高等级卡密集时是高成本纯装饰。
  // 只去掉这层，不隐藏单位、血条、名字、冰冻/眩晕等战斗状态。
  const previousDrawUnitHalo = BattleRenderer.prototype.drawUnitHalo;
  BattleRenderer.prototype.drawUnitHalo = function drawUnitHaloLoadShedding20260905(ctx, unit, layout) {
    if (this.__perfSkipHalos20260905) return;
    return previousDrawUnitHalo.call(this, ctx, unit, layout);
  };

  // 名称文本在大军团里每帧 measureText N 次会制造额外 CPU 压力。
  // 标签字体固定，因此缓存测量宽度；显示开关仍由每一帧刷新，用户切设置能立即生效。
  BattleRenderer.prototype.drawUnitName = function drawUnitNameCached20260905(ctx, x, y, w, name, team) {
    if (this.__perfShowUnitNames20260905 === false) return;
    const nameText = String(name ?? '').trim();
    if (!nameText) return;
    const label = nameText.length > 5 ? `${nameText.slice(0, 5)}…` : nameText;
    ctx.font = UNIT_NAME_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';

    let cache = this.__perfNameWidthCache20260905;
    if (!cache) cache = this.__perfNameWidthCache20260905 = new Map();
    let textWidth = cache.get(label);
    if (textWidth == null) {
      textWidth = ctx.measureText(label).width + 6;
      if (cache.size >= NAME_WIDTH_CACHE_LIMIT) cache.clear();
      cache.set(label, textWidth);
    }

    ctx.fillRect(x + w / 2 - textWidth / 2, y - 2, textWidth, 12);
    ctx.fillStyle = team === 'player' ? '#bbf7d0' : '#fecaca';
    ctx.fillText(label, x + w / 2, y + 8);
  };

  if (typeof window !== 'undefined') {
    window.__battleRenderLoadShedding20260905 = () => ({
      enabled: true,
      policy: {
        renderCadence: 'requestAnimationFrame; internal 30FPS throttle neutralized',
        heavyVisuals: '>=20 units or >=28 effects -> low-quality decoration',
        decorativeHaloDisabledAt: `heavy visuals or >=${HIGH_TIER_HALO_BUDGET} high-tier units`,
        unitNames: 'setting read once per frame; text width cached per label',
      },
    });
  }
}
