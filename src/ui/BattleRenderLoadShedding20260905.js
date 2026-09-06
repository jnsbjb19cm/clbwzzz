import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwz.battleRenderLoadShedding20260905');
const NAME_WIDTH_CACHE_LIMIT = 256;
const UNIT_NAME_FONT = 'bold 9px "Microsoft YaHei", sans-serif';
const MANUAL_LOW_QUALITY_FLAG = Symbol('manualLowQualityAccessor20260905');

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

/**
 * BattleRenderer 的旧 draw() 会依据单位数/全屏技能/特效数自动写 _lowQuality=true。
 * 现在低画质只能由用户/设置显式 forceLowQuality 开启，因此把 _lowQuality 变为
 * forceLowQuality 的只读镜像；旧 draw 的自动赋值仍可执行，但 setter 不再改变画质。
 */
function installManualLowQualityAccessor(renderer) {
  const current = Object.getOwnPropertyDescriptor(renderer, '_lowQuality');
  if (current?.get?.[MANUAL_LOW_QUALITY_FLAG]) return;

  const getter = function manualLowQualityGetter20260905() {
    return Boolean(this.forceLowQuality);
  };
  getter[MANUAL_LOW_QUALITY_FLAG] = true;

  Object.defineProperty(renderer, '_lowQuality', {
    configurable: true,
    enumerable: current?.enumerable ?? true,
    get: getter,
    set() {
      // Intentional no-op: automatic load heuristics may not lower visual quality.
    },
  });
}

export function installBattleRenderLoadShedding20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithManualVisualQuality20260905(engine) {
    const { units, highTierUnits } = countUnitLoad(engine);
    const effects = countEffects(engine);

    this.__perfUnits20260905 = units;
    this.__perfHighTierUnits20260905 = highTierUnits;
    this.__perfEffects20260905 = effects;
    this.__perfTargetFrameMs20260905 = 0;
    // 只保留负载诊断，不再把它转换成画质降级。
    this.__perfHeavyVisuals20260905 = units >= 20 || effects >= 28;
    this.__perfSkipHalos20260905 = false;
    this.__perfShowUnitNames20260905 = shouldShowUnitNames();

    installManualLowQualityAccessor(this);

    // 旧 Renderer 在 >=24 单位/全屏技能时还会整帧节流到约 30 FPS。
    // 清掉时间戳仅用于保持 RAF 刷新频率；不删星星、不删品质圈、不强制低画质。
    this._lastHeavyDrawAt = null;
    try {
      return previousDraw.call(this, engine);
    } finally {
      this._lastHeavyDrawAt = null;
    }
  };

  // 名称文本在大军团里每帧 measureText N 次会制造额外 CPU 压力。
  // 这是无损缓存，不改变可见内容，因此继续保留。
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
        visualQuality: 'manual only; unit/effect counts never force low quality',
        decorativeHaloDisabledAt: 'only when explicit low-quality mode chooses a cheaper halo implementation',
        unitNames: 'setting read once per frame; text width cached per label',
      },
    });
  }
}
