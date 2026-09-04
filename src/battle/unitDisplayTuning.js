import { SpriteAtlas } from '../core/SpriteAtlas.js';

/** unit.res 来自卡牌为字符串，统一成数字再查表/Set */
export function resNum(resOrUnit) {
  const raw = typeof resOrUnit === 'object' && resOrUnit != null
    ? resOrUnit.res
    : resOrUnit;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

/** 战场绘制倍率(与 scripts/lib/unit-display-tuning.mjs 同步) */
export const RES_DRAW_SCALE = {
  1: 0.86,
  2: 1.14,
  3: 0.88,
  4: 0.88,
  5: 0.94,
  6: 0.62,
  7: 1.08,
  9: 0.94,
  12: 1.0,
  15: 0.82,
  17: 0.86,
  18: 0.88,
  19: 0.9,
  20: 0.72,
  21: 1.14,
  22: 0.88,
  23: 0.82,
  24: 0.86,
  25: 1.14,
  26: 0.9,
  27: 1.22,
  28: 0.7,
  30: 1.08,
  32: 0.9,
  35: 1.35,
  36: 0.88,
  38: 1.18,
  39: 0.9,
  40: 1.0,
  45: 1.08,
  51: 0.9,
  52: 0.82,
  53: 0.92,
  54: 0.88,
  55: 1.0,
  57: 1.08,
  58: 1.12,
  62: 0.86,
  100: 1.1,
  101: 0.88,
  114: 1.12,
  // PVP 中间两列中立冰山：一块完整落在一个格子内，避免覆盖相邻行列。
  1000: 0.62,
};

export const RES_DRAW_OFFSET_Y = {
  7: 0.1,
  35: 0,
  55: 0.02,
  57: -0.03,
  9: 0.02,
  40: -0.08,
  12: -0.12,
  45: -0.12,
  114: 0,
  1000: -0.02,
};

export const BACK_COL_DRAW_OFFSET_Y = 0;
export const TOP_LANE_DRAW_OFFSET_Y = 0;
export const FRONT_COL_DRAW_OFFSET_Y = 0;

/** 地面单位立绘锚点：脚钉线相对 portraitH 的比例(越大越贴地) */
export function groundPortraitAnchorForRes(res) {
  const n = Number(res);
  if (n === 7 || n === 30) return 1.0;
  if (n === 55 || n === 56 || n === 57 || n === 114) return 0.92;
  return 0.9;
}

/**
 * 飞行高度：相对行高的上移比例(越大越高空)
 * 40 水蜜桃需高空；12/45 忍者中等高度
 */
export function flyingAltitudeForRes(res) {
  const n = Number(res);
  if (n === 40) return 0.58;
  if (n === 12 || n === 45) return 0.38;
  return 0.28;
}

/** 飞行单位画框放大，避免翅膀/肢体被 bounds 裁切(与战争古树同理允许越界) */
export function flyingBoxBoostForRes(res) {
  const n = Number(res);
  if (n === 40) return 1.18;
  if (n === 12 || n === 45) return 1.38;
  return 1.12;
}

export const FOOT_ANCHOR_RES = new Set([7, 30, 35, 55, 56, 57, 114]);

export function isPlayerAttacking(unit, engine) {
  return !!(unit._attackAnimUntil && engine.time < unit._attackAnimUntil);
}

const AERIAL_VIEW_TYPE = 6;
const LAND_HP_RATIO = 0.5;

function isEffectivelyFlyingUnit(unit) {
  return unit.viewType === AERIAL_VIEW_TYPE
    && unit.hp / Math.max(1, unit.maxHp) > LAND_HP_RATIO;
}

/** 末列地面玩家单位延后绘制，避免被弹道/前排遮挡 */
export function isDeferredBackColPlayer(unit) {
  return isDeferredTopLayerUnit(unit) && unit.team === 'player' && unit.col >= 3.5;
}

/** 基地列 + 玩家末列：弹道后单独绘制，守基地己方优先置顶 */
export function isDeferredTopLayerUnit(unit) {
  if (!unit.alive) return false;
  if (unit.isMovable?.()) return true;
  if (isEffectivelyFlyingUnit(unit)) return false;
  if (unit.col <= 1.0) return true;
  if (unit.team === 'player' && unit.col >= 3.5) return true;
  return false;
}

export function drawOffsetYForUnit(unit, boxH, { footAnchored = false, flying = false } = {}) {
  const res = resNum(unit);
  const resOff = RES_DRAW_OFFSET_Y[res] ?? 0;
  if (footAnchored || FOOT_ANCHOR_RES.has(res)) {
    return boxH * resOff;
  }
  if (flying) {
    return boxH * (resOff - 0.08);
  }
  return boxH * (resOff + 0.02);
}

/** 卡牌立绘叠层(已禁用) */
export const CARD_FACE_OVERLAY = {};

export function shouldUseCardPortraitPrimary() {
  return false;
}

export function needsCardPortraitOverlay(unit) {
  if (unit.team !== 'player') return false;
  if (unit.col >= 3.5) return true;
  return unit.lane <= 1 && unit.col <= 1;
}

export function frontColPortraitShiftX() {
  return 0;
}

export function backColPortraitShiftX() {
  return 0;
}

export function shouldDrawCardFaceOverlay(unit, engine, { animReady = true } = {}) {
  if (unit.team !== 'player' || !unit.alive) return false;
  if (isPlayerAttacking(unit, engine)) return false;
  if (!animReady) return false;
  if (unit._spawnFadeStart != null && unit._spawnFadeDur
    && engine.time < unit._spawnFadeStart + unit._spawnFadeDur) {
    return false;
  }
  if (CARD_FACE_OVERLAY[resNum(unit)] == null) return false;
  if (unit.isMovable?.()) {
    const prev = unit._prevRenderX ?? unit.col;
    if (Math.abs(unit.col - prev) > 0.002) return false;
  }
  return true;
}

function drawOverlayRegion(ctx, cardImg, boxX, boxY, boxW, boxH, region, { flipX = false } = {}) {
  const rw = boxW * region.width;
  const rh = boxH * region.height;
  const rx = boxX + (boxW - rw) / 2;
  const ry = boxY + boxH * region.top;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  SpriteAtlas.drawContained(ctx, cardImg, rx, ry, rw, rh, { flipX });
  ctx.restore();
}

export function drawCardFaceOverlay(ctx, cardImg, unit, boxX, boxY, boxW, boxH, { flipX = false } = {}) {
  if (!cardImg) return;
  const cfg = CARD_FACE_OVERLAY[resNum(unit)];
  if (!cfg) return;
  drawOverlayRegion(ctx, cardImg, boxX, boxY, boxW, boxH, cfg, { flipX });
  if (cfg.mouth) {
    drawOverlayRegion(ctx, cardImg, boxX, boxY, boxW, boxH, cfg.mouth, { flipX });
  }
}
