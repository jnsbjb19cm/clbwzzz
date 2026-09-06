import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import {
  UNIT_CORRECTION_RATE_20260905 as UNIT_CORRECTION_RATE,
  UNIT_EXTRAPOLATE_SEC_20260905 as UNIT_EXTRAPOLATE_SEC,
  UNIT_SNAP_DISTANCE_20260905 as UNIT_SNAP_DISTANCE,
  UNIT_MAX_CORRECTION_SPEED_20260906 as UNIT_MAX_CORRECTION_SPEED,
} from './PvpAuthorityMotionMath20260905.js';

const PATCH_FLAG = Symbol.for('clbwz.pvpAuthoritySmoothMotion20260905');
const MAX_SAMPLES_PER_UNIT = 6;
const MIN_INTERPOLATION_DELAY_SEC = 0.07;
const MAX_INTERPOLATION_DELAY_SEC = 0.14;
const DEFAULT_SNAPSHOT_INTERVAL_SEC = 0.05;
const SNAPSHOT_DELAY_MULTIPLIER = 1.5;
const MAX_EXTRAPOLATE_SEC = Math.min(0.08, UNIT_EXTRAPOLATE_SEC);
const MAX_UNIT_SPEED_COLS_PER_SEC = Math.min(3, UNIT_MAX_CORRECTION_SPEED);
const MAX_LANE_SPEED_PER_SEC = 1;
const LANE_DISCONTINUITY = 0.5;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function authorityUid(unit) {
  return Number(unit?.__authorityUid ?? unit?.uid);
}

function getSamples(unit) {
  if (!Array.isArray(unit.__pvpInterpSamples20260906)) {
    unit.__pvpInterpSamples20260906 = [];
  }
  return unit.__pvpInterpSamples20260906;
}

function resetSamples(unit, serverTime, col, lane, wallTime) {
  const sample = {
    t: finite(serverTime),
    col: clamp(finite(col), 0, 11),
    lane: clamp(finite(lane), 0, 4),
  };
  unit.__pvpInterpSamples20260906 = [sample];
  unit.__pvpSmoothReceivedAt20260905 = wallTime;
  unit.__pvpSmoothHasSample20260905 = true;
  unit.__pvpSmoothForceSnap20260905 = true;
  unit.__pvpSmoothTargetCol20260905 = sample.col;
  unit.__pvpSmoothTargetLane20260905 = sample.lane;
  unit.__pvpSmoothDisplayCol20260906 = sample.col;
  unit.__pvpSmoothDisplayLane20260906 = sample.lane;
  unit.renderX = sample.col;
  unit.renderY = sample.lane;
}

function appendSample(unit, serverTime, col, lane, wallTime) {
  const samples = getSamples(unit);
  const next = {
    t: finite(serverTime),
    col: clamp(finite(col), 0, 11),
    lane: clamp(finite(lane), 0, 4),
  };
  const previous = samples.at(-1);

  if (!previous) {
    resetSamples(unit, next.t, next.col, next.lane, wallTime);
    return;
  }

  const explicitDiscontinuity = Boolean(unit.__pvpSmoothExplicitDiscontinuity20260906);
  const laneJump = Math.abs(next.lane - previous.lane) > LANE_DISCONTINUITY;
  if (explicitDiscontinuity || laneJump) {
    resetSamples(unit, next.t, next.col, next.lane, wallTime);
    unit.__pvpSmoothExplicitDiscontinuity20260906 = false;
    return;
  }

  if (next.t < previous.t - 1e-6) return;

  if (Math.abs(next.t - previous.t) <= 1e-6) {
    samples[samples.length - 1] = next;
  } else {
    samples.push(next);
    if (samples.length > MAX_SAMPLES_PER_UNIT) {
      samples.splice(0, samples.length - MAX_SAMPLES_PER_UNIT);
    }
  }

  unit.__pvpSmoothReceivedAt20260905 = wallTime;
  unit.__pvpSmoothHasSample20260905 = true;
  unit.__pvpSmoothForceSnap20260905 = false;
  unit.__pvpSmoothTargetCol20260905 = next.col;
  unit.__pvpSmoothTargetLane20260905 = next.lane;
}

function seedUnit(unit, serverTime, wallTime) {
  if (!unit) return;
  const targetCol = finite(unit.__authorityTargetCol, unit.col);
  const targetLane = finite(unit.__authorityTargetLane, unit.lane);
  resetSamples(unit, serverTime, targetCol, targetLane, wallTime);
  unit.__pvpSmoothForceSnap20260905 = false;
}

function interpolationDelayFor(view) {
  const snapshotDt = clamp(
    finite(view.__pvpSmoothSnapshotDt20260906, DEFAULT_SNAPSHOT_INTERVAL_SEC),
    1 / 120,
    0.2,
  );
  return clamp(
    snapshotDt * SNAPSHOT_DELAY_MULTIPLIER,
    MIN_INTERPOLATION_DELAY_SEC,
    MAX_INTERPOLATION_DELAY_SEC,
  );
}

/**
 * 服务器仍然是唯一权威；客户端只缓存最近几帧“展示坐标”。
 * 渲染时间故意落后约 1.5 个快照间隔，从而始终在两个已收到快照之间插值。
 * 这样不会把网络纠错写回 unit.col / unit.lane，也不会在高单位数时让整场卡牌被拉扯。
 */
function captureSnapshotMotion(view, snapshot) {
  if (!view?.engine || !Array.isArray(snapshot?.units)) return;

  const wallTime = performance.now();
  const nextSnapshotTime = finite(snapshot.t, finite(view.__pvpSmoothSnapshotTime20260905));
  const previousSnapshotTime = finite(view.__pvpSmoothSnapshotTime20260905, nextSnapshotTime);
  const rawDt = nextSnapshotTime - previousSnapshotTime;
  if (rawDt > 1e-6 && rawDt < 0.25) {
    const previousDt = finite(view.__pvpSmoothSnapshotDt20260906, rawDt);
    view.__pvpSmoothSnapshotDt20260906 = previousDt * 0.72 + rawDt * 0.28;
  }
  view.__pvpSmoothSnapshotTime20260905 = nextSnapshotTime;
  view.__pvpSmoothSnapshotWallTime20260906 = wallTime;

  const byUid = new Map((view.engine.units ?? []).map((unit) => [authorityUid(unit), unit]));
  for (const data of snapshot.units) {
    const unit = byUid.get(Number(data?.uid));
    if (!unit) continue;

    const targetCol = finite(unit.__authorityTargetCol, unit.col);
    const targetLane = finite(unit.__authorityTargetLane, unit.lane);
    unit.__pvpSmoothExplicitDiscontinuity20260906 = data?.teleport === true || data?.warp === true;

    if (!unit.__pvpSmoothHasSample20260905) {
      resetSamples(unit, nextSnapshotTime, targetCol, targetLane, wallTime);
      unit.__pvpSmoothForceSnap20260905 = false;
    } else {
      appendSample(unit, nextSnapshotTime, targetCol, targetLane, wallTime);
    }
  }
}

function samplePresentation(unit, renderTime) {
  const samples = getSamples(unit);
  if (!samples.length) {
    return {
      col: finite(unit.renderX, finite(unit.__authorityTargetCol, unit.col)),
      lane: finite(unit.renderY, finite(unit.__authorityTargetLane, unit.lane)),
    };
  }

  if (samples.length === 1 || renderTime <= samples[0].t) {
    return { col: samples[0].col, lane: samples[0].lane };
  }

  for (let index = 1; index < samples.length; index += 1) {
    const right = samples[index];
    if (renderTime > right.t) continue;
    const left = samples[index - 1];
    const span = Math.max(1e-6, right.t - left.t);
    const alpha = clamp((renderTime - left.t) / span, 0, 1);
    return {
      col: left.col + (right.col - left.col) * alpha,
      lane: left.lane + (right.lane - left.lane) * alpha,
    };
  }

  const latest = samples.at(-1);
  const previous = samples.at(-2);
  if (!previous) return { col: latest.col, lane: latest.lane };

  const span = Math.max(1e-6, latest.t - previous.t);
  const extrapolate = clamp(renderTime - latest.t, 0, MAX_EXTRAPOLATE_SEC);
  const vx = clamp(
    (latest.col - previous.col) / span,
    -MAX_UNIT_SPEED_COLS_PER_SEC,
    MAX_UNIT_SPEED_COLS_PER_SEC,
  );
  const vy = clamp(
    (latest.lane - previous.lane) / span,
    -MAX_LANE_SPEED_PER_SEC,
    MAX_LANE_SPEED_PER_SEC,
  );

  return {
    col: clamp(latest.col + vx * extrapolate, 0, 11),
    lane: clamp(latest.lane + vy * extrapolate, 0, 4),
  };
}

function bindView(view) {
  if (!view?.pvp || !view.renderer) return;

  view.__pvpSmoothSnapshotUnsub20260905?.();
  view.__pvpSmoothFinishedUnsub20260905?.();
  view.__pvpSmoothSnapshotUnsub20260905 = null;
  view.__pvpSmoothFinishedUnsub20260905 = null;

  view.renderer.__pvpSmoothAuthorityView20260905 = view;
  view.__pvpSnapshotInterpolationActive20260906 = true;

  const wallTime = performance.now();
  const serverTime = finite(view.__pvpLatestSnapshot?.t, finite(view.engine?.time));
  for (const unit of view.engine?.units ?? []) seedUnit(unit, serverTime, wallTime);
  if (view.__pvpLatestSnapshot) captureSnapshotMotion(view, view.__pvpLatestSnapshot);

  if (view.pvpSocket?.on) {
    view.__pvpSmoothSnapshotUnsub20260905 = view.pvpSocket.on(
      'pvp:authority:snapshot',
      (snapshot) => captureSnapshotMotion(view, snapshot),
    );
    view.__pvpSmoothFinishedUnsub20260905 = view.pvpSocket.on(
      'pvp:authority:finished',
      (snapshot) => captureSnapshotMotion(view, snapshot),
    );
  }
}

function cleanupView(view) {
  view?.__pvpSmoothSnapshotUnsub20260905?.();
  view?.__pvpSmoothFinishedUnsub20260905?.();
  if (view) {
    view.__pvpSmoothSnapshotUnsub20260905 = null;
    view.__pvpSmoothFinishedUnsub20260905 = null;
    view.__pvpSmoothSnapshotTime20260905 = null;
    view.__pvpSmoothSnapshotDt20260906 = null;
    view.__pvpSmoothSnapshotWallTime20260906 = null;
    view.__pvpSnapshotInterpolationActive20260906 = false;
    if (view.renderer?.__pvpSmoothAuthorityView20260905 === view) {
      view.renderer.__pvpSmoothAuthorityView20260905 = null;
    }
  }
}

function advancePresentation(renderer, engine) {
  const view = renderer?.__pvpSmoothAuthorityView20260905;
  if (!view?.__pvpAuthorityActive || view.engine !== engine) return;

  const renderTime = finite(engine?.time) - interpolationDelayFor(view);
  for (const unit of engine?.units ?? []) {
    if (!unit?.__pvpSmoothHasSample20260905) {
      seedUnit(unit, finite(engine?.time), performance.now());
    }

    const previousX = finite(unit.__pvpSmoothDisplayCol20260906, finite(unit.renderX, unit.col));
    const sampled = samplePresentation(unit, renderTime);

    unit._prevRenderX = previousX;
    unit.renderX = sampled.col;
    unit.renderY = sampled.lane;
    unit.__pvpSmoothDisplayCol20260906 = sampled.col;
    unit.__pvpSmoothDisplayLane20260906 = sampled.lane;
    unit.__pvpSmoothForceSnap20260905 = false;
  }
}

/**
 * BattleRenderer 的旧布局只读取 unit.col / unit.lane。
 * 这里仅在“计算这一张单位的布局”期间临时提供 renderX/renderY，随后立即恢复逻辑坐标。
 * 因此视觉插值与攻击、碰撞、基地判定彻底解耦。
 */
function installPresentationCoordinateBridge() {
  if (BattleRenderer.prototype.__pvpPresentationCoordinateBridge20260906) return;
  BattleRenderer.prototype.__pvpPresentationCoordinateBridge20260906 = true;

  const previousComputeUnitLayout = BattleRenderer.prototype.computeUnitLayout;
  BattleRenderer.prototype.computeUnitLayout = function computeUnitLayoutWithPresentationCoordinates20260906(
    engine,
    unit,
  ) {
    const view = this.__pvpSmoothAuthorityView20260905;
    if (!view?.__pvpSnapshotInterpolationActive20260906 || !unit) {
      return previousComputeUnitLayout.call(this, engine, unit);
    }

    const logicalCol = unit.col;
    const logicalLane = unit.lane;
    const displayCol = finite(unit.renderX, logicalCol);
    const displayLane = finite(unit.renderY, logicalLane);

    unit.col = displayCol;
    unit.lane = displayLane;
    try {
      return previousComputeUnitLayout.call(this, engine, unit);
    } finally {
      unit.col = logicalCol;
      unit.lane = logicalLane;
    }
  };
}

export function installPvpAuthoritySmoothMotion20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installPresentationCoordinateBridge();

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithSmoothAuthorityMotion20260905(...args) {
    const result = await previousRenderBattle.apply(this, args);
    if (this.pvp) bindView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroySmoothAuthorityMotion20260905(...args) {
    cleanupView(this);
    return previousDestroy.apply(this, args);
  };

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawSmoothAuthorityMotion20260905(engine) {
    advancePresentation(this, engine);
    return previousDraw.call(this, engine);
  };

  if (typeof window !== 'undefined') {
    window.__verifyPvpAuthoritySmoothMotion20260905 = () => ({
      enabled: true,
      strategy: 'snapshot interpolation buffer; presentation coordinates never write back to authority state',
      minInterpolationDelaySec: MIN_INTERPOLATION_DELAY_SEC,
      maxInterpolationDelaySec: MAX_INTERPOLATION_DELAY_SEC,
      interpolationDelayMultiplier: SNAPSHOT_DELAY_MULTIPLIER,
      maxSamplesPerUnit: MAX_SAMPLES_PER_UNIT,
      unitExtrapolateSec: MAX_EXTRAPOLATE_SEC,
      correctionRateCompatibility: UNIT_CORRECTION_RATE,
      snapDistanceCompatibility: UNIT_SNAP_DISTANCE,
      maxCorrectionSpeedCompatibility: UNIT_MAX_CORRECTION_SPEED,
      maxUnitSpeedColsPerSec: MAX_UNIT_SPEED_COLS_PER_SEC,
      networkErrorPolicy: 'interpolate buffered snapshots; only explicit warp/lane discontinuity resets the buffer',
    });
  }
}

export const PVP_AUTHORITY_SMOOTH_MOTION_20260905 = Object.freeze({
  strategy: 'snapshot-interpolation',
  minInterpolationDelaySec: MIN_INTERPOLATION_DELAY_SEC,
  maxInterpolationDelaySec: MAX_INTERPOLATION_DELAY_SEC,
  interpolationDelayMultiplier: SNAPSHOT_DELAY_MULTIPLIER,
  maxSamplesPerUnit: MAX_SAMPLES_PER_UNIT,
  unitExtrapolateSec: MAX_EXTRAPOLATE_SEC,
  correctionRate: UNIT_CORRECTION_RATE,
  snapDistance: UNIT_SNAP_DISTANCE,
  maxCorrectionSpeed: UNIT_MAX_CORRECTION_SPEED,
  maxUnitSpeedColsPerSec: MAX_UNIT_SPEED_COLS_PER_SEC,
});
