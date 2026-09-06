import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import {
  UNIT_CORRECTION_RATE_20260905 as UNIT_CORRECTION_RATE,
  UNIT_EXTRAPOLATE_SEC_20260905 as UNIT_EXTRAPOLATE_SEC,
  UNIT_SNAP_DISTANCE_20260905 as UNIT_SNAP_DISTANCE,
  UNIT_MAX_CORRECTION_SPEED_20260906 as UNIT_MAX_CORRECTION_SPEED,
  predictAuthorityAxis20260905,
} from './PvpAuthorityMotionMath20260905.js';

const PATCH_FLAG = Symbol.for('clbwz.pvpAuthoritySmoothMotion20260905');
const MAX_UNIT_SPEED_COLS_PER_SEC = 8;
const MAX_LANE_SPEED_PER_SEC = 8;

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

function stateLocksMovement(unit, state, engineTime) {
  const value = String(state ?? '');
  if (unit?.alive === false) return true;
  if (value === 'death' || value === 'stun' || value === 'frozen' || value === 'toGround') return true;
  if (value === 'attacking' || value === 'secondAttackStatus') return true;
  if (unit?.attackingBase) return true;
  if (finite(unit?.stunnedUntil) > engineTime) return true;
  if (finite(unit?.frozenUntil) > engineTime) return true;
  if (unit?._aerialLandingRequested) return true;
  return false;
}

function seedUnit(unit, now) {
  if (!unit) return;
  unit.__pvpSmoothTargetCol20260905 = finite(unit.__authorityTargetCol, unit.col);
  unit.__pvpSmoothTargetLane20260905 = finite(unit.__authorityTargetLane, unit.lane);
  unit.__pvpSmoothVelocityCol20260905 = 0;
  unit.__pvpSmoothVelocityLane20260905 = 0;
  unit.__pvpSmoothReceivedAt20260905 = now;
  unit.__pvpSmoothHasSample20260905 = true;
  unit.__pvpSmoothForceSnap20260905 = false;
  unit.__pvpSmoothDisplayCol20260906 = finite(unit.col);
  unit.__pvpSmoothDisplayLane20260906 = finite(unit.lane);
}

/**
 * PvpAuthoritySyncFinal 会先把服务端目标写到 __authorityTarget*；旧逻辑在误差 >2.5 格时
 * 还会直接覆盖 unit.col。这个监听器安装在 authority sync 之后，因此可把既有单位恢复到
 * 上一帧展示坐标，再由 draw() 渐进追向新目标。新部署单位仍直接在真实出生点出现。
 */
function captureSnapshotMotion(view, snapshot) {
  if (!view?.engine || !Array.isArray(snapshot?.units)) return;

  const now = performance.now();
  const nextSnapshotTime = finite(snapshot.t, finite(view.__pvpSmoothSnapshotTime20260905));
  const previousSnapshotTime = finite(view.__pvpSmoothSnapshotTime20260905, nextSnapshotTime);
  const snapshotDt = clamp(nextSnapshotTime - previousSnapshotTime || 0.05, 1 / 120, 0.25);
  view.__pvpSmoothSnapshotTime20260905 = nextSnapshotTime;

  const byUid = new Map((view.engine.units ?? []).map((unit) => [authorityUid(unit), unit]));
  for (const data of snapshot.units) {
    const unit = byUid.get(Number(data?.uid));
    if (!unit) continue;

    const hadSample = Boolean(unit.__pvpSmoothHasSample20260905);
    const displayCol = finite(unit.__pvpSmoothDisplayCol20260906, unit.col);
    const displayLane = finite(unit.__pvpSmoothDisplayLane20260906, unit.lane);
    const targetCol = finite(unit.__authorityTargetCol, unit.col);
    const targetLane = finite(unit.__authorityTargetLane, unit.lane);
    const previousCol = finite(unit.__pvpSmoothTargetCol20260905, targetCol);
    const previousLane = finite(unit.__pvpSmoothTargetLane20260905, targetLane);
    const deltaCol = targetCol - previousCol;
    const deltaLane = targetLane - previousLane;
    const state = data?.animState || data?.state || '';
    const locked = stateLocksMovement(unit, state, finite(view.engine.time));

    // 横向大误差通常来自拥挤时的快照延迟，不再视为“传送”。只有真实跨路/显式 warp 才硬切。
    const discontinuity = Math.abs(deltaLane) > 0.75
      || data?.teleport === true
      || data?.warp === true;

    unit.__pvpSmoothVelocityCol20260905 = (!hadSample || locked || discontinuity)
      ? 0
      : clamp(deltaCol / snapshotDt, -MAX_UNIT_SPEED_COLS_PER_SEC, MAX_UNIT_SPEED_COLS_PER_SEC);
    unit.__pvpSmoothVelocityLane20260905 = (!hadSample || locked || discontinuity)
      ? 0
      : clamp(deltaLane / snapshotDt, -MAX_LANE_SPEED_PER_SEC, MAX_LANE_SPEED_PER_SEC);
    unit.__pvpSmoothTargetCol20260905 = targetCol;
    unit.__pvpSmoothTargetLane20260905 = targetLane;
    unit.__pvpSmoothReceivedAt20260905 = now;
    unit.__pvpSmoothHasSample20260905 = true;
    unit.__pvpSmoothForceSnap20260905 = discontinuity;
    unit.__pvpSmoothState20260905 = state;

    if (hadSample && !discontinuity) {
      // 抵消 PvpAuthoritySyncFinal 的大误差硬纠正；逻辑目标仍保存在 __authorityTarget*。
      unit.col = displayCol;
      unit.lane = displayLane;
      unit.renderX = displayCol;
      unit.renderY = displayLane;
      unit.__pvpSmoothDisplayCol20260906 = displayCol;
      unit.__pvpSmoothDisplayLane20260906 = displayLane;
    } else {
      // 首次出现/真正跨路时从权威位置建立展示基准，不制造“从旧不存在位置滑入”的假象。
      unit.__pvpSmoothDisplayCol20260906 = finite(unit.col, targetCol);
      unit.__pvpSmoothDisplayLane20260906 = finite(unit.lane, targetLane);
    }
  }
}

function bindView(view) {
  if (!view?.pvp || !view.renderer) return;

  view.__pvpSmoothSnapshotUnsub20260905?.();
  view.__pvpSmoothFinishedUnsub20260905?.();
  view.__pvpSmoothSnapshotUnsub20260905 = null;
  view.__pvpSmoothFinishedUnsub20260905 = null;

  view.renderer.__pvpSmoothAuthorityView20260905 = view;
  const now = performance.now();
  for (const unit of view.engine?.units ?? []) seedUnit(unit, now);
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
    if (view.renderer?.__pvpSmoothAuthorityView20260905 === view) {
      view.renderer.__pvpSmoothAuthorityView20260905 = null;
    }
  }
}

function advancePresentation(renderer, engine) {
  const view = renderer?.__pvpSmoothAuthorityView20260905;
  if (!view?.__pvpAuthorityActive || view.engine !== engine) return;

  const now = performance.now();
  const previousDrawAt = finite(renderer.__pvpSmoothLastDrawAt20260905, now - 1000 / 60);
  const frameDt = clamp((now - previousDrawAt) / 1000, 1 / 240, 0.05);
  renderer.__pvpSmoothLastDrawAt20260905 = now;
  const engineTime = finite(engine?.time);

  for (const unit of engine?.units ?? []) {
    if (!unit?.__pvpSmoothHasSample20260905) continue;

    const age = clamp(
      (now - finite(unit.__pvpSmoothReceivedAt20260905, now)) / 1000,
      0,
      UNIT_EXTRAPOLATE_SEC,
    );
    const locked = stateLocksMovement(unit, unit.__pvpSmoothState20260905, engineTime);
    const forceSnap = Boolean(unit.__pvpSmoothForceSnap20260905);
    const displayCol = finite(unit.__pvpSmoothDisplayCol20260906, unit.col);
    const displayLane = finite(unit.__pvpSmoothDisplayLane20260906, unit.lane);

    const x = predictAuthorityAxis20260905({
      authoritative: finite(unit.__pvpSmoothTargetCol20260905, unit.__authorityTargetCol),
      velocity: unit.__pvpSmoothVelocityCol20260905,
      age,
      current: displayCol,
      frameDt,
      min: 0,
      max: 11,
      locked,
      forceSnap,
      maxCorrectionSpeed: UNIT_MAX_CORRECTION_SPEED,
    });
    const y = predictAuthorityAxis20260905({
      authoritative: finite(unit.__pvpSmoothTargetLane20260905, unit.__authorityTargetLane),
      velocity: unit.__pvpSmoothVelocityLane20260905,
      age,
      current: displayLane,
      frameDt,
      min: 0,
      max: 4,
      locked,
      forceSnap,
      snapDistance: 0.75,
      maxCorrectionSpeed: UNIT_MAX_CORRECTION_SPEED,
    });

    unit._prevRenderX = displayCol;
    unit.col = x.value;
    unit.lane = y.value;
    unit.renderX = unit.col;
    unit.renderY = unit.lane;
    unit.__pvpSmoothDisplayCol20260906 = unit.col;
    unit.__pvpSmoothDisplayLane20260906 = unit.lane;
    unit.__pvpSmoothForceSnap20260905 = false;
  }
}

export function installPvpAuthoritySmoothMotion20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

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
      unitExtrapolateSec: UNIT_EXTRAPOLATE_SEC,
      correctionRate: UNIT_CORRECTION_RATE,
      snapDistance: UNIT_SNAP_DISTANCE,
      maxCorrectionSpeed: UNIT_MAX_CORRECTION_SPEED,
      maxUnitSpeedColsPerSec: MAX_UNIT_SPEED_COLS_PER_SEC,
      networkErrorPolicy: 'smooth; only explicit warp/lane discontinuity snaps',
    });
  }
}

export const PVP_AUTHORITY_SMOOTH_MOTION_20260905 = Object.freeze({
  unitExtrapolateSec: UNIT_EXTRAPOLATE_SEC,
  correctionRate: UNIT_CORRECTION_RATE,
  snapDistance: UNIT_SNAP_DISTANCE,
  maxCorrectionSpeed: UNIT_MAX_CORRECTION_SPEED,
  maxUnitSpeedColsPerSec: MAX_UNIT_SPEED_COLS_PER_SEC,
});
