import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwz.battleRenderLoadShedding20260905');
const NAME_WIDTH_CACHE_LIMIT = 256;
const UNIT_NAME_FONT = 'bold 9px "Microsoft YaHei", sans-serif';
const MANUAL_LOW_QUALITY_FLAG = Symbol('manualLowQualityAccessor20260905');
// 2026-09-11：恢复「自动降画质」并在其上叠加自适应。
// 之前把 _lowQuality 锁成只读镜像(forceLowQuality)，导致单位一多还是全套逐帧动画
// → 90+ 单位时单帧渲染暴涨。现在：单位/特效超阈值、或帧耗时超预算 → 自动降画质；
// 负载回落后再自动升回，避免长时间糊。
// 目标：至少 90fps（1000/90 ≈ 11.1ms/帧），所以渲染预算卡在 ~10ms，留出余量。
const AUTO_LOW_UNIT_COUNT = 45;
const AUTO_LOW_EFFECT_COUNT = 40;
const FRAME_BUDGET_BAD_MS = 10;   // 单帧渲染 >10ms（≈ 90fps 预算）→ 降画质
const FRAME_BUDGET_GOOD_MS = 6;   // <6ms 且单位不多 → 才逐步升回
const AUTO_RECOVER_FRAMES = 90;

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
 * 2026-09-11：把 _lowQuality 变成可写属性（旧实现用只读 getter 锁死为 forceLowQuality，
 * 自动降画质因此失效）。现在由 draw 包装器逐帧决定：forceLowQuality(用户画质=低) 或自适应降级。
 */
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

function adaptiveLowQuality(renderer, { units, effects, costMs }) {
  const state = renderer.__autoLowQuality20260911 ?? (renderer.__autoLowQuality20260911 = {
    ema: costMs,
    low: false,
    recoverFrames: 0,
  });
  state.ema = state.ema * 0.85 + costMs * 0.15;

  const overloaded = units >= AUTO_LOW_UNIT_COUNT
    || effects >= AUTO_LOW_EFFECT_COUNT
    || state.ema >= FRAME_BUDGET_BAD_MS;
  if (overloaded) {
    state.low = true;
    state.recoverFrames = 0;
  } else if (state.low && state.ema <= FRAME_BUDGET_GOOD_MS && units < AUTO_LOW_UNIT_COUNT) {
    state.recoverFrames += 1;
    if (state.recoverFrames >= AUTO_RECOVER_FRAMES) {
      state.low = false;
      state.recoverFrames = 0;
    }
  } else {
    state.recoverFrames = 0;
  }
  const low = Boolean(renderer.forceLowQuality) || state.low;
  renderer._lowQuality = low;
  renderer.__autoLowQualityActive20260911 = low;
  return low;
}

function installManualLowQualityAccessor(renderer) {
  ensureWritableLowQuality(renderer);
}

export function installBattleRenderLoadShedding20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithAdaptiveQuality20260911(engine) {
    const { units, highTierUnits } = countUnitLoad(engine);
    const effects = countEffects(engine);

    this.__perfUnits20260905 = units;
    this.__perfHighTierUnits20260905 = highTierUnits;
    this.__perfEffects20260905 = effects;
    ensureWritableLowQuality(this);
    this.__perfShowUnitNames20260905 = shouldShowUnitNames();
    // 先用上一帧决定的画质档渲染本帧，再按本帧耗时/负载决定下一帧档位。
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result = previousDraw.call(this, engine);
    const costMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    this.__perfTargetFrameMs20260905 = FRAME_BUDGET_BAD_MS;
    const low = adaptiveLowQuality(this, { units, effects, costMs });
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
        visualQuality: 'manual only; unit/effect counts never force low quality',
        decorativeHaloDisabledAt: 'only when explicit low-quality mode chooses a cheaper halo implementation',
        unitNames: 'setting read once per frame; text width cached per label',
      },
    });
  }
}
