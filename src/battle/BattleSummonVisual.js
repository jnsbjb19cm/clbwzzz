const CIRCLE_URL = new URL('../../resources/background/法阵.png', import.meta.url).href;
export const SUMMON_TIMING = Object.freeze({ circleIn: 0.3, cardIn: 0.22, circleOut: 0.45 });
const DURATION = SUMMON_TIMING.circleIn + SUMMON_TIMING.cardIn + SUMMON_TIMING.circleOut;
let circleImage;

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
  if (!circleImage && typeof Image !== 'undefined') {
    circleImage = new Image();
    circleImage.src = CIRCLE_URL;
  }
  return circleImage?.complete && circleImage.naturalWidth ? circleImage : null;
}

// Presentation only: never delay deployment, attacks, or server snapshots.
// The local visual clock also works when authoritative snapshots hold engine.time.
export function drawSummonVisuals(renderer, ctx, engine, now = performance.now() / 1000) {
  const image = requestCircle();
  let state = renderer._summonVisuals;
  if (!state || state.engine !== engine) {
    state = renderer._summonVisuals = { engine, seen: new Set((engine.units ?? []).map(u => u.uid)), active: new Map() };
  }
  const hidden = new Set();
  for (const unit of engine.units ?? []) {
    if (!state.seen.has(unit.uid)) {
      state.seen.add(unit.uid);
      if (unit.alive && !unit.pvpNeutral && !unit.bossCommanderOnly) {
        state.active.set(unit.uid, { born: now });
      }
    }
    const effect = state.active.get(unit.uid);
    if (!effect) continue;
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
    if (image && layout && phase.circleAlpha > 0) {
      const width = (layout.cellW || 64) * 1.55;
      const height = width * image.naturalHeight / image.naturalWidth;
      ctx.save();
      ctx.globalAlpha *= phase.circleAlpha;
      ctx.drawImage(image, layout.cx - width / 2, layout.footY - height / 2, width, height);
      ctx.restore();
    }
  }
  // Prune disappeared units without retaining old snapshot objects.
  const liveIds = new Set((engine.units ?? []).map(u => u.uid));
  for (const uid of state.active.keys()) if (!liveIds.has(uid)) state.active.delete(uid);
  state.seen = liveIds;
  if (!hidden.size) return engine;
  return Object.assign(Object.create(engine), { units: engine.units.filter(u => !hidden.has(u.uid)) });
}
