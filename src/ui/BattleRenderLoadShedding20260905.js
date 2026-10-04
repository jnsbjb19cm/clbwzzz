import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwz.battleRenderLoadShedding20260905');
const NAME_WIDTH_CACHE_LIMIT = 256;
const UNIT_NAME_FONT = 'bold 9px "Microsoft YaHei", sans-serif';
// Only lossless caching/measurement here. Never trade animation fidelity for load.

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

/** Retain compatibility with old renderer instances; quality is manual only. */
function ensureWritableLowQuality(renderer) {
  const current = Object.getOwnPropertyDescriptor(renderer, '_lowQuality');
  if (current?.writable) return;
  Object.defineProperty(renderer, '_lowQuality', {
    configurable: true,
    enumerable: current?.enumerable ?? true,
    writable: true,
    value: Boolean(renderer.forceLowQuality),
  });
}

export function installBattleRenderLoadShedding20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithLosslessCaches20261002(engine) {
    const { units, highTierUnits } = countUnitLoad(engine);
    const effects = countEffects(engine);

    this.__perfUnits20260905 = units;
    this.__perfHighTierUnits20260905 = highTierUnits;
    this.__perfEffects20260905 = effects;
    ensureWritableLowQuality(this);
    this.__perfShowUnitNames20260905 = shouldShowUnitNames();
    this.__autoLowQualityActive20260911 = false;
    // Metrics are diagnostic only: they never change visual quality or animation rate.
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result = previousDraw.call(this, engine);
    const costMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    this.__perfLastRenderMs20261002 = costMs;
    const low = Boolean(this._lowQuality);
    this.__perfHeavyVisuals20260905 = low;
    this.__perfSkipHalos20260905 = low;
    return result;
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
        renderCadence: 'requestAnimationFrame; no internal frame throttle',
        visualQuality: 'manual only; load never replaces or skips unit animation',
        decorativeHaloDisabledAt: 'manual low-quality setting only; no automatic visual changes',
        unitNames: 'setting read once per frame; text width cached per label',
      },
    });
  }
}
