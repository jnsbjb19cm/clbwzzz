import { drawSummonColumn, getSummonAtlas, preloadSummonAtlas } from './OriginalAtlasEffects.js';

// 10-12 原始卡牌脚下召唤法阵：保留素材及原始绘制逻辑，不替换 10-15 的蓝色特效。
const CIRCLE_URL = new URL('../../resources/background/法阵.png', import.meta.url).href;
let circleImage;
let circleLoading;
function preloadOriginalSummonCircle() {
  if (circleLoading) return circleLoading;
  if (typeof Image === 'undefined') return Promise.resolve(null);
  circleLoading = new Promise(resolve => {
    const image = new Image();
    circleImage = image;
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = CIRCLE_URL;
    if (image.complete) resolve(image.naturalWidth ? image : null);
  });
  return circleLoading;
}
export const SUMMON_TIMING = Object.freeze({ circleIn: 0.3, cardIn: 0.22, circleOut: 0.45 });
const DURATION = SUMMON_TIMING.circleIn + SUMMON_TIMING.cardIn + SUMMON_TIMING.circleOut;
// 并行预加载原始脚下法阵 PNG 与蓝色 summon 图集。
export function preloadSummonVisual() { return Promise.all([preloadOriginalSummonCircle(), preloadSummonAtlas()]); }

export function summonVisualPhase(age) {
  const { circleIn, cardIn, circleOut } = SUMMON_TIMING;
  return {
    circleAlpha: age < 0 || age >= DURATION ? 0
      : age < circleIn ? age / circleIn
        : age < circleIn + cardIn ? 1 : (DURATION - age) / circleOut,
    cardAlpha: Math.max(0, Math.min(1, (age - circleIn) / cardIn)),
    finished: age >= DURATION,
  };
}

function requestCircle() {
  if (!circleImage) void preloadOriginalSummonCircle();
  return circleImage?.complete && circleImage.naturalWidth ? circleImage : null;
}
function requestColumn() {
  const image = getSummonAtlas();
  if (!image) void preloadSummonAtlas();
  return image;
}

// Presentation only: never delay deployment, attacks, or server snapshots.
// The local visual clock also works when authoritative snapshots hold engine.time.
export function drawSummonVisuals(renderer, ctx, engine, now = performance.now() / 1000) {
  const circleImage = requestCircle();
  const columnImage = requestColumn();
  let state = renderer._summonVisuals;
  if (!state || state.engine !== engine) {
    // On a fresh battle the first rendered units are summons too. Reconnects
    // to an old battle must not replay the whole existing army's arrival.
    const existing = Number(engine.time) > 0.5 ? (engine.units ?? []).map(u => u.uid) : [];
    state = renderer._summonVisuals = { engine, seen: new Set(existing), active: new Map() };
  }
  const hidden = new Set();
  for (const unit of engine.units ?? []) {
    if (!state.seen.has(unit.uid)) {
      state.seen.add(unit.uid);
      if (unit.alive && !unit.pvpNeutral && !unit.bossCommanderOnly) {
        state.active.set(unit.uid, { born: null, detectedAt: now });
      }
    }
    const effect = state.active.get(unit.uid);
    if (!effect) continue;
    // Do not consume a short effect while its texture is still downloading.
    // Keep the card visible in the meantime; never delay combat for artwork.
    if (effect.born == null) {
      // 等两种素材都就绪后同步播；最多等 2 秒，超时只播已加载的，始终不阻塞战斗。
      if (!circleImage || !columnImage) {
        if (now - effect.detectedAt <= 2) continue;
        if (!circleImage && !columnImage) {
          state.active.delete(unit.uid);
          continue;
        }
      }
      effect.born = now;
    }
    const age = now - effect.born;
    const phase = summonVisualPhase(age);
    if (!unit.alive || phase.finished) {
      state.active.delete(unit.uid);
      unit._spawnFadeDur = 0;
      continue;
    }
    if (phase.cardAlpha <= 0) hidden.add(unit.uid);
    unit._spawnFadeDur = SUMMON_TIMING.cardIn;
    unit._spawnFadeStart = Number(engine.time || 0) - (age - SUMMON_TIMING.circleIn);
    const layout = renderer.computeUnitLayout(engine, unit);
    if (layout && phase.circleAlpha > 0) {
      // 原封不动恢复 10-12 版 PNG 的宽高、脚底锚点和透明度。
      if (circleImage) {
        const image = circleImage;
      const width = (layout.cellW || 64) * 1.55;
      const height = width * image.naturalHeight / image.naturalWidth;
      ctx.save();
      ctx.globalAlpha *= phase.circleAlpha;
      ctx.drawImage(image, layout.cx - width / 2, layout.footY - height / 2, width, height);
      ctx.restore();
      }
      // 蓝色原版 summon 立柱仍同步保留。
      if (columnImage) drawSummonColumn(ctx, columnImage, layout, age / DURATION, phase.circleAlpha);
    }
  }
  // Prune disappeared units without retaining old snapshot objects.
  const liveIds = new Set((engine.units ?? []).map(u => u.uid));
  for (const uid of state.active.keys()) if (!liveIds.has(uid)) state.active.delete(uid);
  state.seen = liveIds;
  if (!hidden.size) return engine;
  return Object.assign(Object.create(engine), { units: engine.units.filter(u => !hidden.has(u.uid)) });
}
