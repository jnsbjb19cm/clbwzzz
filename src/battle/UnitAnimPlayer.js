const metaCache = new Map();
/** loadAnimPack 完成后立即可用，避免 preload 判定过严导致 ready 为空 */
const resolvedPacks = new Map();
let skipAnimRes = null;

const DEATH_ANIM_DURATION = 2.0;
// 保留当前正确动画版本：待机/移动适度提速，攻击动作单独提高流畅度。
const PASSIVE_PLAYBACK_RATE = 1.0;
// 攻击/特殊动作按原始帧率播放（1.0）：此前 1.7 倍速使 animDone 阈值缩到 58%，
// 导致攻击动画只播一半就提前结束（如蘑菇仙人）。保持完整播放。
const ACTION_PLAYBACK_RATE = 1.0;

function playbackRateForState(state) {
  if (state === 'attacking' || state === 'jump' || state === 'secondAttackStatus') {
    return ACTION_PLAYBACK_RATE;
  }
  if (String(state ?? '').startsWith('attack_')) return ACTION_PLAYBACK_RATE;
  return PASSIVE_PLAYBACK_RATE;
}

function effectiveFrameRate(anim, state) {
  let rate = (anim?.frameRate || 12) * playbackRateForState(state);
  // 攻击/特殊动作：动画包帧率偏低(9.6-12fps)会拖长到 8 秒；提升到 ≥24fps 完整播放且节奏正常
  if (state === 'attacking' || state === 'secondAttackStatus' || String(state ?? '').startsWith('attack_')) {
    rate = Math.max(rate, 24);
  }
  return Math.max(1, rate);
}

/** 有效播放帧数：完整播放（不截断，避免"播一半"） */
function getEffectiveAnimFrames(anim) {
  if (!anim?.frames?.length) return 0;
  return anim.frames.length;
}

function animationDuration(anim, fallback = 0.45, state = '') {
  const n = getEffectiveAnimFrames(anim);
  if (!n) return fallback;
  return n / effectiveFrameRate(anim, state);
}

function resolveDeathDuration(pack) {
  const anim = pack?.meta?.animations?.death;
  if (anim?.frames?.length) {
    return Math.min(DEATH_ANIM_DURATION, animationDuration(anim, DEATH_ANIM_DURATION, 'death'));
  }
  return DEATH_ANIM_DURATION;
}

async function loadSkipAnimRes() {
  if (skipAnimRes) return skipAnimRes;
  try {
    const resp = await fetch('/sprites/unit_anim/manifest.json');
    if (!resp.ok) {
      skipAnimRes = new Set();
      return skipAnimRes;
    }
    const manifest = await resp.json();
    skipAnimRes = new Set(
      [
        ...(manifest.skippedAnim ?? []),
        ...(manifest.skippedLowQuality ?? []),
        ...(manifest.skippedFragment ?? []),
      ].map(String),
    );
    return skipAnimRes;
  } catch {
    skipAnimRes = new Set();
    return skipAnimRes;
  }
}

import { drawOffsetYForUnit, FOOT_ANCHOR_RES, resNum } from './unitDisplayTuning.js';

const ANIM_CACHE_BUST = '20260826a';
const FROZEN_DEATH_DURATION = 0.16;
const TUNNEL_RUNTIME_SHEET_RES = new Set(['41', '43']);
const COMPACT_RUNTIME_STATE_SHEET_RES = new Set(['45']);

const AERIAL_VIEW_TYPE = 6;
const LAND_HP_RATIO = 0.5;
const FULL_FRAME_ATTACK_RES = new Set([20, 22, 34, 36, 38, 41, 43, 48, 54, 56, 58, 62, 64, 72, 75, 77, 92, 101, 118]);

function animUrl(res) {
  return `/sprites/unit_anim/${res}.json?v=${ANIM_CACHE_BUST}`;
}

function sheetUrl(res) {
  return `/sprites/unit_anim/${res}.png?v=${ANIM_CACHE_BUST}`;
}

function tunnelStateMetaUrl(res) {
  return `/sprites/unit_anim/${res}.underMoving.json?v=${ANIM_CACHE_BUST}`;
}

function tunnelStateSheetUrl(res) {
  return `/sprites/unit_anim/${res}.underMoving.png?v=${ANIM_CACHE_BUST}`;
}

function compactRuntimeMetaUrl(res) {
  return `/sprites/unit_anim/${res}.runtime.json?v=${ANIM_CACHE_BUST}`;
}

function compactRuntimeStateSheetUrl(res, state) {
  return `/sprites/unit_anim/${res}.${state}.runtime.png?v=${ANIM_CACHE_BUST}`;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function loadTunnelStateSheet(res) {
  if (!TUNNEL_RUNTIME_SHEET_RES.has(String(res))) return null;
  try {
    const [response, sheet] = await Promise.all([
      fetch(tunnelStateMetaUrl(res)),
      loadImage(tunnelStateSheetUrl(res)),
    ]);
    if (!response.ok || !sheet) return null;
    const runtime = await response.json();
    if (!runtime?.animation?.frames?.length) return null;
    return {
      sheet,
      frames: runtime.animation.frames,
      originX: Number(runtime.originX) || 0,
      originY: Number(runtime.originY) || 0,
      frameW: Number(runtime.frameW) || 1,
      frameH: Number(runtime.frameH) || 1,
    };
  } catch {
    return null;
  }
}

async function loadCompactRuntimeStateSheets(res) {
  if (!COMPACT_RUNTIME_STATE_SHEET_RES.has(String(res))) return null;
  try {
    const response = await fetch(compactRuntimeMetaUrl(res));
    if (!response.ok) return null;
    const runtime = await response.json();
    const entries = Object.entries(runtime?.animations ?? {})
      .filter(([, animation]) => animation?.frames?.length);
    if (!entries.length) return null;
    const initialState = runtime.animations.flying ? 'flying' : entries[0][0];
    const stateSheet = await loadCompactRuntimeStateSheet(res, initialState, runtime);
    if (!stateSheet) return null;
    return {
      runtime,
      stateSheets: { [initialState]: stateSheet },
    };
  } catch {
    return null;
  }
}

async function loadCompactRuntimeStateSheet(res, state, runtime) {
  const animation = runtime?.animations?.[state];
  if (!animation?.frames?.length) return null;
  const sheet = await loadImage(compactRuntimeStateSheetUrl(res, state));
  if (!sheet) return null;
  return {
    sheet,
    frames: animation.frames,
    originX: Number(animation.originX) || 0,
    originY: Number(animation.originY) || 0,
    frameW: Number(animation.frameW) || 1,
    frameH: Number(animation.frameH) || 1,
  };
}

function ensureDeferredCompactStateSheet(pack, res, state) {
  if (pack?.stateSheets?.[state]?.sheet) {
    return Promise.resolve(pack.stateSheets[state]);
  }
  const runtime = pack?.compactRuntimeMeta;
  if (!runtime?.animations?.[state]) return Promise.resolve(null);
  pack.compactStatePromises ??= {};
  if (!pack.compactStatePromises[state]) {
    pack.compactStatePromises[state] = loadCompactRuntimeStateSheet(res, state, runtime)
      .then((stateSheet) => {
        if (stateSheet) pack.stateSheets[state] = stateSheet;
        return stateSheet;
      });
  }
  return pack.compactStatePromises[state];
}

function ensureDeferredMainSheet(pack, res) {
  if (!pack?.deferredMain) return Promise.resolve(pack?.sheet ?? null);
  if (pack.mainSheet) return Promise.resolve(pack.mainSheet);
  if (!pack.mainSheetPromise) {
    pack.mainSheetPromise = loadImage(sheetUrl(res)).then((sheet) => {
      pack.mainSheet = sheet;
      return sheet;
    });
  }
  return pack.mainSheetPromise;
}

function frameSource(pack, state, frameIndex, res) {
  const stateSheet = pack?.stateSheets?.[state];
  if (stateSheet?.sheet) {
    return {
      sheet: stateSheet.sheet,
      frame: stateSheet.frames[frameIndex] ?? stateSheet.frames.at(-1),
      originX: stateSheet.originX,
      originY: stateSheet.originY,
      packed: true,
    };
  }
  if (pack?.compactRuntimeMeta?.animations?.[state]) {
    void ensureDeferredCompactStateSheet(pack, res, state);
    return null;
  }
  const sheet = pack?.deferredMain ? pack.mainSheet : pack?.sheet;
  if (!sheet) {
    void ensureDeferredMainSheet(pack, res);
    return null;
  }
  return {
    sheet,
    frame: pack.meta.animations?.[state]?.frames?.[frameIndex],
    originX: 0,
    originY: 0,
    packed: false,
  };
}

async function loadAnimPack(res) {
  const key = String(res);
  if (metaCache.has(key)) return metaCache.get(key);

  const promise = (async () => {
    try {
      const resp = await fetch(animUrl(key));
      if (!resp.ok) return null;
      const meta = await resp.json();
      const [tunnelStateSheet, compactRuntime] = await Promise.all([
        loadTunnelStateSheet(key),
        loadCompactRuntimeStateSheets(key),
      ]);
      const stateSheets = {
        ...(compactRuntime?.stateSheets ?? {}),
        ...(tunnelStateSheet ? { underMoving: tunnelStateSheet } : {}),
      };
      const firstStateSheet = Object.values(stateSheets)[0]?.sheet ?? null;
      const sheet = firstStateSheet ?? await loadImage(sheetUrl(key));
      if (!sheet) return null;
      const hasStateSheets = Object.keys(stateSheets).length > 0;
      const pack = hasStateSheets
        ? {
          meta,
          sheet,
          stateSheets,
          compactRuntimeMeta: compactRuntime?.runtime ?? null,
          compactStatePromises: {},
          deferredMain: true,
          mainSheet: null,
          mainSheetPromise: null,
        }
        : { meta, sheet, deferredMain: false, mainSheet: sheet };
      resolvedPacks.set(key, pack);
      return pack;
    } catch {
      return null;
    }
  })();

  metaCache.set(key, promise);
  return promise;
}

function packHasFrames(pack) {
  return Object.values(pack?.meta?.animations ?? {}).some(
    (anim) => anim?.frames?.length > 0,
  );
}

function registerPack(key, pack, readyMap) {
  if (!pack || !packHasFrames(pack)) return false;
  resolvedPacks.set(key, pack);
  readyMap?.set(key, pack);
  return true;
}

function resolveHpAnimKeys(pack, prefix) {
  const metaKeys = prefix === 'default'
    ? pack.meta.hpAnims
    : pack.meta.attackHpAnims;
  const keys = metaKeys
    ?? Object.keys(pack.meta.animations ?? {}).filter((k) => k.startsWith(`${prefix}_`));
  return [...keys]
    .filter((k) => !k.startsWith('effect_'))
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
}

function resolveHpAnim(pack, unit, prefix) {
  const hpKeys = resolveHpAnimKeys(pack, prefix);
  if (!hpKeys.length) return null;

  const pct = (unit.hp / Math.max(1, unit.maxHp)) * 100;
  for (const key of hpKeys) {
    const threshold = Number(key.split('_')[1]);
    if (pct <= threshold && pack.meta.animations[key]) return key;
  }
  const full = hpKeys[hpKeys.length - 1];
  return pack.meta.animations[full] ? full : null;
}

export function isEffectivelyFlying(unit) {
  return unit.viewType === AERIAL_VIEW_TYPE
    && !unit._aerialLandingRequested
    && !unit._baseLandingRequested
    && !unit._aerialLanded
    && unit.hp / Math.max(1, unit.maxHp) > LAND_HP_RATIO;
}

export function shouldLoopUnitAnimation(state, anim) {
  return Boolean(anim?.loop || state === 'underMoving');
}

export function shouldHoldMushroomIdleFrame(unit, engine, state) {
  if (Number(unit?.cardId) !== 58 || state !== 'default' || !unit?.alive) return false;
  const units = Array.isArray(engine?.units) ? engine.units : [];
  const canTarget = typeof engine?.isValidEnemyTarget === 'function'
    ? (target) => engine.isValidEnemyTarget(unit, target)
    : (target) => target?.alive && target.team !== unit.team;
  return !units.some((target) => target !== unit && canTarget(target));
}

export function resolveStableAttackFrameX({
  stableLeft,
  scaleBounds,
  frameW,
  sourceWidth,
  scale,
  flipX = false,
  useFullFrame = false,
}) {
  if (useFullFrame) {
    const inset = flipX
      ? Math.max(0, frameW - 1 - scaleBounds.right)
      : Math.max(0, scaleBounds.left);
    return stableLeft - inset * scale;
  }
  const stableWidth = scaleBounds.right - scaleBounds.left + 1;
  return stableLeft + (stableWidth - sourceWidth) * scale / 2;
}

export function resolveFrameAnchorOffset(res, state, frame, flipX = false) {
  const offset = Number(frame?.anchorOffsetX) || 0;
  return flipX ? -offset : offset;
}

function syncAerialLandState(unit) {
  if (unit.viewType !== AERIAL_VIEW_TYPE) return;
  if (isEffectivelyFlying(unit)) {
    unit._aerialWasFlying = true;
  }
}

function resolveAerialAnimState(unit, pack) {
  if (unit.viewType !== AERIAL_VIEW_TYPE) return null;
  syncAerialLandState(unit);
  const anims = pack?.meta?.animations ?? {};

  if (isEffectivelyFlying(unit)) {
    unit._aerialWasFlying = true;
    unit._aerialLanded = false;
    return 'flying';
  }

  if (unit._aerialWasFlying && anims.toGround && !unit._aerialLanded) {
    return 'toGround';
  }
  // 已落地：重置飞行标记并回到地面动画（default/moving），避免还播放空中动画
  if (unit._aerialLanded) {
    unit._aerialWasFlying = false;
  }
  return null;
}

export function resolveUnitAnimState(unit, engine) {
  if (!unit.alive) return 'death';
  // 优先使用由引擎临时强制的动画状态(比如首触眩晕动画)
  if (unit._forcedAnimState && engine.time < (unit._forcedAnimUntil ?? 0)) {
    return unit._forcedAnimState;
  }
  // 眩晕(击晕)状态：烘焙包含 'stun' 动画时优先播放(问题7)
  if (unit.stunnedUntil && engine.time < unit.stunnedUntil) return 'stun';
  if (unit._burrowTargetCol != null) return 'underMoving';
  if (unit.attackingBase) return 'attacking';
  if (unit._attackAnimUntil && engine.time < unit._attackAnimUntil) return 'attacking';
  if (unit._jumpUntil && engine.time < unit._jumpUntil) return 'jump';
  if (unit.isMovable?.()) {
    const prev = unit._prevRenderX ?? unit.col;
    // 减速单位每帧位移很小，但仍应继续播放 moving，不能退回静态 default。
    if (Math.abs(unit.col - prev) > 0.00001) return 'moving';
  }
  if (isEffectivelyFlying(unit)) return 'flying';
  return 'default';
}

function pickAnimState(pack, unit, requested) {
  const anims = pack.meta.animations ?? {};

  if (requested === 'death') {
    if (unit._deathFrozen) return null;
    if (anims.death) return 'death';
    return anims.default ? 'default' : null;
  }

  if (requested === 'attacking') {
    // 正常攻击用 attacking 动画；跳跃阶段由 resolveUnitAnimState 走 'jump' 分支
    const hpAtk = resolveHpAnim(pack, unit, 'attack');
    if (hpAtk) return hpAtk;
    if (anims.attacking) return 'attacking';
    const hpIdle = resolveHpAnim(pack, unit, 'default');
    if (hpIdle) return hpIdle;
    if (anims.default) return 'default';
    return null;
  }

  if (requested === 'flying') {
    if (anims.flying) return 'flying';
    if (anims.default) return 'default';
    const hpAnim = resolveHpAnim(pack, unit, 'default');
    if (hpAnim) return hpAnim;
    return null;
  }

  if (requested === 'default') {
    const hpAnim = resolveHpAnim(pack, unit, 'default');
    if (hpAnim) return hpAnim;
    if (anims.default) return 'default';
    if (anims.flying && unit.isFlying?.()) return 'flying';
    return null;
  }

  if (anims[requested]?.frames?.length) return requested;

  const hpAnim = resolveHpAnim(pack, unit, 'default');
  if (hpAnim) return hpAnim;
  if (anims.default) return 'default';
  if (anims.flying && unit.isFlying?.()) return 'flying';
  return null;
}

const PER_FRAME_DRAW_STATES = new Set(['flying', 'toGround', 'jump']);
const GROUND_UNIFORM_STATES = new Set(['default', 'moving']);

function padBounds(bounds, pad, frameW, frameH) {
  if (!bounds) return null;
  return {
    ...bounds,
    left: Math.max(0, bounds.left - pad),
    top: Math.max(0, bounds.top - pad),
    right: Math.min((frameW ?? 999) - 1, bounds.right + pad),
    bottom: Math.min((frameH ?? 999) - 1, bounds.bottom + pad),
  };
}

function getDrawBounds(pack, state, frameIndex, { fullFrame = false } = {}) {
  const anim = pack.meta.animations[state];
  const fr = anim?.frames?.[frameIndex];
  const fw = pack.meta.frameW;
  const fh = pack.meta.frameH;
  if (fullFrame && fr) {
    return { left: 0, top: 0, right: fr.w - 1, bottom: fr.h - 1 };
  }
  if (pack.meta.uniformBounds && GROUND_UNIFORM_STATES.has(state)) {
    return pack.meta.uniformBounds;
  }
  const usePerFrame = pack.meta.usePerFrameBounds
    || !GROUND_UNIFORM_STATES.has(state)
    || (pack.meta.flying && PER_FRAME_DRAW_STATES.has(state));
  if (usePerFrame) {
    const raw = fr?.bounds ?? pack.meta.uniformBounds ?? null;
    const pad = PER_FRAME_DRAW_STATES.has(state) ? 22 : 8;
    return padBounds(raw, pad, fw, fh) ?? raw;
  }
  if (pack.meta.uniformBounds) return pack.meta.uniformBounds;
  return fr?.bounds ?? null;
}
function resolveFootFrac(pack, state) {
  const dfy = pack.meta.drawFootY;
  if (dfy) {
    return dfy[state] ?? dfy.default ?? dfy.flying ?? null;
  }
  const ub = pack.meta.uniformBounds;
  if (ub) return (ub.bottom + 1) / pack.meta.frameH;
  return 0.88;
}

export class UnitAnimPlayer {
  constructor() {
    this.ready = new Map();
    this.clocks = new Map();
    this.lastDrawTimes = new Map();
  }

  async preload(resSet) {
    const skip = await loadSkipAnimRes();
    await Promise.all(
      [...resSet].map(async (res) => {
        const key = String(res);
        if (skip.has(key)) return;
        const pack = await loadAnimPack(res);
        registerPack(key, pack, this.ready);
      }),
    );
  }

  hasAnim(res) {
    const key = String(res);
    return this.ready.has(key) || resolvedPacks.has(key);
  }

  /** 指定单位是否烘焙了某个动画状态(如 secondAttackStatus / jump) */
  hasAnimState(res, state) {
    const key = String(res);
    const pack = this.ready.get(key) ?? resolvedPacks.get(key);
    return Boolean(pack?.meta?.animations?.[state]?.frames?.length);
  }

  /** 获取指定动画时长(秒)，无则返回 fallback */
  animDurationOf(res, state, fallback = 0.45) {
    const key = String(res);
    const pack = this.ready.get(key) ?? resolvedPacks.get(key);
    const anim = pack?.meta?.animations?.[state];
    return animationDuration(anim, fallback, state);
  }

  resolveAttackDuration(unit, duration) {
    if (duration != null) return duration;
    const pack = this.ready.get(String(unit.res)) ?? resolvedPacks.get(String(unit.res));
    const atkState = pack
      ? (pickAnimState(pack, unit, 'attacking') ?? 'attacking')
      : 'attacking';
    const anim = pack?.meta.animations?.[atkState];
    // fallback 用 3.5s（≈80帧@24fps 完整时长上限）：preload 异步未完成时，
    // 若 fallback 太短(0.45/1.5s)，攻击动画(如蘑菇仙人画法阵在帧34+)会被截断、
    // 且 skillFx 时长(attackDuration-bubbleDelay)随之缩短导致特效显示不完全。
    return animationDuration(anim, 3.5, atkState);
  }

  resolveAnimationDuration(unit, state, fallback = 1.5) {
    const pack = this.ready.get(String(unit.res)) ?? resolvedPacks.get(String(unit.res));
    const anim = pack?.meta?.animations?.[state];
    return animationDuration(anim, fallback, state);
  }

  resolveAnimationFrameDelay(unit, state, frame, fallback = 0) {
    const pack = this.ready.get(String(unit.res)) ?? resolvedPacks.get(String(unit.res));
    const anim = pack?.meta?.animations?.[state];
    if (anim?.frames?.length) {
      const safeFrame = Math.max(0, Math.min(anim.frames.length - 1, Number(frame) || 0));
      return safeFrame / effectiveFrameRate(anim, state);
    }
    return fallback;
  }

  resolveAnimationReleaseDelay(unit, state, fallbackRatio = 0.42) {
    const pack = this.ready.get(String(unit.res)) ?? resolvedPacks.get(String(unit.res));
    const anim = pack?.meta?.animations?.[state];
    const duration = this.resolveAnimationDuration(unit, state);
    if (anim?.releaseFrame != null && anim.frameRate) {
      return Math.max(0, Math.min(duration, anim.releaseFrame / effectiveFrameRate(anim, state)));
    }
    return Math.max(0.08, Math.min(duration * 0.75, duration * fallbackRatio));
  }

  resolveAttackReleaseDelay(unit) {
    const pack = this.ready.get(String(unit.res)) ?? resolvedPacks.get(String(unit.res));
    const atkState = pack
      ? (pickAnimState(pack, unit, 'attacking') ?? 'attacking')
      : 'attacking';
    const anim = pack?.meta.animations?.[atkState];
    const duration = this.resolveAttackDuration(unit);
    if (anim?.releaseFrame != null && anim.frameRate) {
      return Math.max(0, Math.min(duration, anim.releaseFrame / effectiveFrameRate(anim, atkState)));
    }
    const ratio = anim?.releaseRatio ?? pack?.meta?.attackReleaseRatio ?? 0.42;
    return Math.max(0.08, Math.min(duration * 0.7, duration * ratio));
  }

  pickDrawState(pack, unit, engine) {
    const aerial = resolveAerialAnimState(unit, pack);
    const requested = aerial ?? resolveUnitAnimState(unit, engine);
    if (requested === 'toGround') {
      const anim = pack.meta.animations.toGround;
      if (anim?.frames?.length) {
        const clockKey = `${unit.uid}:toGround`;
        const clock = this.clocks.get(clockKey) ?? 0;
        const frameDur = 1 / effectiveFrameRate(anim, 'toGround');
        if (!anim.loop && clock >= getEffectiveAnimFrames(anim) * frameDur) {
          unit._aerialLanded = true;
          const ground = pickAnimState(pack, unit, resolveUnitAnimState(unit, engine));
          return { requested: 'default', state: ground ?? 'default' };
        }
        return { requested: 'toGround', state: 'toGround' };
      }
      unit._aerialLanded = true;
    }
    if (requested !== 'attacking') {
      return { requested, state: pickAnimState(pack, unit, requested) };
    }

    const atkState = pickAnimState(pack, unit, 'attacking');
    if (!atkState) {
      return { requested, state: pickAnimState(pack, unit, 'default') };
    }

    const anim = pack.meta.animations[atkState];
    if (!anim?.frames?.length) {
      return { requested, state: pickAnimState(pack, unit, 'default') };
    }

    const attackClock = this.clocks.get(`${unit.uid}:${atkState}`) ?? 0;
    const frameDur = 1 / effectiveFrameRate(anim, atkState);
    const animDone = !anim.loop && attackClock >= getEffectiveAnimFrames(anim) * frameDur;
    if (animDone) {
      const idle = pickAnimState(pack, unit, 'default');
      return { requested, state: idle ?? atkState };
    }
    return { requested, state: atkState };
  }

  triggerAttack(unit, engine, duration) {
    // 防抖：同一攻击动画已在播放时不重置（防止高频触发导致动画反复从头"跳一半"）
    if (unit._attackAnimUntil && engine.time < unit._attackAnimUntil) return;
    const attackDuration = this.resolveAttackDuration(unit, duration);
    unit._attackAnimStartedAt = engine.time;
    unit._attackAnimUntil = engine.time + attackDuration;
    if (unit.isMovable?.()) {
      unit._attackLockCol = unit.col;
      unit._attackLockUntil = unit._attackAnimUntil;
    }
    const key = String(unit.res);
    let pack = this.ready.get(key);
    if (!pack) {
      this.ensureLoaded([key]);
      pack = this.ready.get(key);
    }
    if (!pack) return;
    const atkState = pickAnimState(pack, unit, 'attacking') ?? 'attacking';
    this.clocks.set(`${unit.uid}:${atkState}`, 0);
  }

  triggerState(unit, engine, state, duration) {
    const stateDuration = duration ?? this.resolveAnimationDuration(unit, state);
    unit._forcedAnimState = state;
    unit._forcedAnimUntil = engine.time + stateDuration;
    this.clocks.set(`${unit.uid}:${state}`, 0);
    return stateDuration;
  }

  resetClock(unit) {
    const prefix = `${unit.uid}:`;
    for (const key of this.clocks.keys()) {
      if (key.startsWith(prefix)) this.clocks.delete(key);
    }
    this.lastDrawTimes.delete(unit.uid);
  }

  markDeath(unit, engine) {
    if (unit._suicideRemoved) return;
    const frozenDeath = !!(unit.frozenUntil && engine.time < unit.frozenUntil);
    unit._deathFrozen = frozenDeath;
    if (frozenDeath) {
      unit._deathUntil = engine.time + FROZEN_DEATH_DURATION;
      this.resetClock(unit);
      return;
    }
    const key = String(unit.res);
    this.ensureLoaded([key]);
    const pack = this.ready.get(key) ?? resolvedPacks.get(key);
    const hasDeath = pack?.meta?.animations?.death?.frames?.length;
    const dur = resolveDeathDuration(pack);
    unit._deathAnimStartedAt = engine.time;
    unit._deathUntil = engine.time + dur;
    if (hasDeath) this.clocks.set(`${unit.uid}:death`, 0);
  }

  ensureLoaded(resSet) {
    const skip = skipAnimRes;
    const missing = [...resSet].filter((res) => {
      const key = String(res);
      if (skip?.has(key)) return false;
      if (this.ready.has(key) || resolvedPacks.has(key)) {
        if (!this.ready.has(key)) this.ready.set(key, resolvedPacks.get(key));
        return false;
      }
      return true;
    });
    if (missing.length) void this.preload(new Set(missing));
  }

  async awaitReady(res, timeoutMs = 2500) {
    const key = String(res);
    if (skipAnimRes?.has(key)) return false;
    if (this.ready.has(key) || resolvedPacks.has(key)) {
      if (!this.ready.has(key)) this.ready.set(key, resolvedPacks.get(key));
      return true;
    }
    const load = this.preload(new Set([key]));
    await Promise.race([
      load,
      new Promise((resolve) => { setTimeout(resolve, timeoutMs); }),
    ]);
    return this.ready.has(key);
  }

  resolveFrameSource(pack, state, frameIndex, res) {
    return frameSource(pack, state, frameIndex, res);
  }

  ensureMainSheet(pack, res) {
    return ensureDeferredMainSheet(pack, res);
  }

  /** 拖拽预览：绘制卡牌单位待机动画(无 BattleUnit 实例) */
  drawPreview(ctx, res, boxX, boxY, boxW, boxH, timeSec = 0) {
    const key = String(res);
    if (skipAnimRes?.has(key)) return false;
    let pack = this.ready.get(key) ?? resolvedPacks.get(key);
    if (!pack) {
      this.ensureLoaded([key]);
      pack = this.ready.get(key) ?? resolvedPacks.get(key);
      if (!pack) return false;
    }

    const fakeUnit = {
      uid: 'drag-preview',
      res: key,
      hp: 100,
      maxHp: 100,
      viewType: 0,
      alive: true,
      col: 0,
      _prevRenderX: 0,
      attackingBase: false,
      _attackAnimUntil: 0,
      isMovable: () => false,
      isFlying: () => false,
    };

    const state = pickAnimState(pack, fakeUnit, 'default') ?? 'default';
    const anim = pack.meta.animations[state];
    if (!anim?.frames?.length) return false;

    const frameDur = 1 / effectiveFrameRate(anim, state);
    const fi = Math.floor(timeSec / frameDur) % anim.frames.length;
    const fr = anim.frames[fi];
    const source = frameSource(pack, state, fi, key);
    if (!source?.frame) return false;
    const drawBounds = getDrawBounds(pack, state, fi, {
      fullFrame: !!pack.meta.flying && !source.packed,
    });
    if (!drawBounds) return false;

    const srcX = source.frame.x + drawBounds.left - source.originX;
    const srcY = source.frame.y + drawBounds.top - source.originY;
    const srcW = drawBounds.right - drawBounds.left + 1;
    const srcH = drawBounds.bottom - drawBounds.top + 1;
    const scaleW = drawBounds.right - drawBounds.left + 1;
    const scaleH = drawBounds.bottom - drawBounds.top + 1;
    const boost = pack.meta.scaleBoost ?? 1.12;
    const scale = Math.min(boxW / scaleW, boxH / scaleH) * 0.98 * boost;
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = boxX + (boxW - dw) / 2 + (Number(fr.anchorOffsetX) || 0) * scale;
    const dy = boxY + (boxH - dh) / 2;

    ctx.clearRect(boxX, boxY, boxW, boxH);
    ctx.drawImage(source.sheet, srcX, srcY, srcW, srcH, dx, dy, dw, dh);
    return true;
  }

  draw(ctx, unit, engine, boxX, boxY, boxW, boxH, {
    flipX = false, footY = null, advanceClock = true,
  } = {}) {
    const key = String(unit.res);
    if (skipAnimRes?.has(key)) return false;
    let pack = this.ready.get(key) ?? resolvedPacks.get(key);
    if (!pack) {
      this.ensureLoaded([key]);
      const pending = metaCache.get(key);
      if (pending?.then) {
        void pending.then((p) => registerPack(key, p, this.ready));
      } else {
        void loadAnimPack(key).then((p) => registerPack(key, p, this.ready));
      }
      return false;
    }
    if (!this.ready.has(key)) this.ready.set(key, pack);

    if (unit._spawnFadeDur && unit._spawnFadeStart == null) {
      unit._spawnFadeStart = engine.time;
    }

    const { requested, state } = this.pickDrawState(pack, unit, engine);
    if (!state) return false;

    const anim = pack.meta.animations[state];
    if (!anim?.frames?.length) return false;

    const clockKey = `${unit.uid}:${state}`;
    let clock = this.clocks.get(clockKey) ?? 0;
    let frameDelta = 0;
    if (advanceClock) {
      const now = Number(engine.time) || 0;
      const previous = this.lastDrawTimes.get(unit.uid);
      frameDelta = previous == null ? 0 : Math.max(0, now - previous);
      this.lastDrawTimes.set(unit.uid, now);
      if (requested === 'death' && unit._deathAnimStartedAt != null && unit._deathUntil) {
        const visibleDuration = Math.max(0.001, unit._deathUntil - unit._deathAnimStartedAt);
        const sourceDuration = animationDuration(anim, DEATH_ANIM_DURATION, 'death');
        frameDelta *= sourceDuration / visibleDuration;
      }
      clock += frameDelta;
      this.clocks.set(clockKey, clock);
    }

    if (advanceClock && requested === 'attacking') {
      const atkState = pickAnimState(pack, unit, 'attacking');
      if (atkState && atkState !== state) {
        const atkClockKey = `${unit.uid}:${atkState}`;
        let atkClock = this.clocks.get(atkClockKey) ?? 0;
        atkClock += frameDelta;
        this.clocks.set(atkClockKey, atkClock);
      }
    }

    const frameDur = 1 / effectiveFrameRate(anim, state);
    const effFrames = getEffectiveAnimFrames(anim);
    let fi = shouldLoopUnitAnimation(state, anim)
      ? (Math.floor(clock / frameDur) % effFrames)
      : Math.min(effFrames - 1, Math.max(0, Math.floor(clock / frameDur)));
    if (shouldHoldMushroomIdleFrame(unit, engine, state)) fi = 0;

    const fr = anim.frames[fi];
    const source = frameSource(pack, state, fi, key);
    if (!source?.frame) return false;
    const flying = isEffectivelyFlying(unit);
    const isAerialPack = !!pack.meta.flying;
    const useFullFrame = !source.packed && (
      isAerialPack
      || (state === 'attacking' && FULL_FRAME_ATTACK_RES.has(resNum(unit)))
    );
    // 攻击状态中心锚定(下方 dx 处理)：逐帧边界保留攻击动作，单位中心不漂移
    const attackAnchor = state === 'attacking';
    // 攻击动画固定绘制窗口(uniformBounds)：攻击时单位完全不动，动作靠帧内像素变化
    // (猫妖祭祀/近战突进弹回问题：之前逐帧 bounds 造成出手帧位移)
    const drawBounds = attackAnchor && pack.meta.uniformBounds && !useFullFrame
      ? pack.meta.uniformBounds
      : getDrawBounds(pack, state, fi, { fullFrame: useFullFrame });
    if (!drawBounds) return false;

    const fw = pack.meta.frameW;
    const fh = pack.meta.frameH;
    // 裁切框只决定从图集中取哪些像素，不允许参与角色缩放。
    // 所有状态始终使用动画包的固定显示边界，避免攻击前后体积变化。
    const scaleBounds = pack.meta.uniformBounds ?? {
      left: 0, top: 0, right: fw - 1, bottom: fh - 1,
    };

    const srcX = source.frame.x + drawBounds.left - source.originX;
    const srcY = source.frame.y + drawBounds.top - source.originY;
    const srcW = drawBounds.right - drawBounds.left + 1;
    const srcH = drawBounds.bottom - drawBounds.top + 1;

    const scaleW = scaleBounds.right - scaleBounds.left + 1;
    const scaleH = scaleBounds.bottom - scaleBounds.top + 1;
    const boost = pack.meta.scaleBoost ?? 1.12;
    const margin = flying ? 0.94 : 0.98;
    const scale = Math.min(boxW / scaleW, boxH / scaleH) * margin * boost;
    const dw = srcW * scale;
    const dh = srcH * scale;
    const stableLeft = boxX + (boxW - scaleW * scale) / 2;
    const stableTop = boxY + (boxH - scaleH * scale) / 2;
    // 攻击状态中心锚定：动作帧左右延伸保留(攻击可见)，但单位中心不漂移(不晃动)
    let dx;
    if (attackAnchor) {
      dx = resolveStableAttackFrameX({
        stableLeft,
        scaleBounds,
        frameW: fw,
        sourceWidth: srcW,
        scale,
        flipX,
        useFullFrame,
      });
    } else {
      dx = stableLeft + (drawBounds.left - scaleBounds.left) * scale;
    }
    const footAnchored = FOOT_ANCHOR_RES.has(resNum(unit));
    const offsetY = drawOffsetYForUnit(unit, boxH, { footAnchored, flying });
    const footPad = pack.meta.footOpaqueInset ?? 0;
    // 攻击状态 y 也锚定：动作帧上下起伏不再让底座整体位移(花生/小麦等底座弹回)
    let dy;
    if (attackAnchor) {
      dy = stableTop + offsetY;
    } else {
      dy = stableTop + (drawBounds.top - scaleBounds.top) * scale + offsetY;
    }
    if (footY != null && (isAerialPack || !flying)) {
      const footFrac = resolveFootFrac(pack, state) ?? 0.9;
      // drawFootY 是相对完整帧的脚点，不能乘裁切后的高度。
      dy = footY - footFrac * fh * scale + drawBounds.top * scale
        + offsetY + footPad * scale;
    }

    let alpha = 1;
    if (unit._spawnFadeStart != null && unit._spawnFadeDur) {
      alpha = Math.min(1, Math.max(0, (engine.time - unit._spawnFadeStart) / unit._spawnFadeDur));
      if (alpha <= 0) return false;
    }

    // 完整帧可能超出画布顶部/左缘(lane0/col0 的蘑菇法杖/法阵)：
    // 攻击完整帧按人物脚锚定时 dy 会为负(法杖伸到画布外被裁)。clamp 进画布保证完整显示。
    if (!Number.isFinite(dx)) dx = boxX;
    if (!Number.isFinite(dy)) dy = boxY;
    if (dy < 0) dy = 0;
    if (dx < 0) dx = 0;
    const anchorOffsetX = resolveFrameAnchorOffset(unit.res, state, fr, flipX);
    const shiftedDx = dx + anchorOffsetX * scale;

    ctx.save();
    ctx.globalAlpha *= alpha;
    if (flipX) {
      ctx.translate(shiftedDx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(source.sheet, srcX, srcY, srcW, srcH, 0, 0, dw, dh);
    } else {
      ctx.drawImage(source.sheet, srcX, srcY, srcW, srcH, shiftedDx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }
}

export const unitAnimPlayer = new UnitAnimPlayer();
if (typeof window !== 'undefined') window.__unitAnimPlayerForDiagnostics = unitAnimPlayer;
void loadSkipAnimRes();
