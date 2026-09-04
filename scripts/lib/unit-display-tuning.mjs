/**
 * 单位战场/烘焙显示调校
 */

/** 烘焙 JSON meta.scaleBoost */
export function scaleBoostForRes(res, viewTypeMap) {
  const vt = viewTypeMap?.get?.(res);
  if (res === 55 || res === 56) return 1.35;
  if (res === 57) return 1.48;
  if (res === 27) return 1.32;
  if (res === 5) return 1.1;
  if (res === 6) return 0.92;
  if (res === 35) return 1.55;
  if (res === 3) return 0.85;
  if (res === 1 || res === 17) return 0.88;
  if (res === 18 || res === 20 || res === 54) return 0.9;
  if (res === 7 || res === 30) return 1.08;
  if (res === 58) return 1.38;
  if (res === 63) return 1.22;
  if (res === 100) return 1.28;
  if (res === 101) return 0.95;
  if (res === 114) return 1.28;
  if (res === 15 || res === 52) return 0.88;
  if (res === 53) return 1.0;
  if (res === 62) return 0.9;
  if (res === 4) return 0.9;
  if (res === 25) return 1.02;
  if (res === 28) return 0.95;
  if (res === 2 || res === 21) return 1.08;
  if (res === 19 || res === 32) return 1.12;
  if ([22, 36].includes(res)) return 0.9;
  if (res === 12) return 1.08;
  if (res === 45) return 1.12;
  if (res === 40) return 1.06;
  if ([24, 26, 39, 51].includes(res)) return 0.9;
  if (vt === 6) return 1.02;
  return 1.12;
}

/** 战场绘制倍率(相对 UNIT_DRAW_SCALE) */
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
  19: 1.12,
  20: 0.72,
  21: 1.14,
  27: 1.22,
  22: 0.88,
  24: 0.86,
  26: 0.9,
  30: 1.08,
  32: 1.12,
  35: 1.35,
  36: 0.88,
  39: 0.9,
  40: 1.0,
  45: 1.08,
  51: 0.9,
  52: 0.82,
  53: 0.92,
  54: 0.88,
  55: 1.0,
  25: 1.14,
  28: 0.7,
  57: 1.08,
  58: 1.12,
  62: 0.86,
  100: 1.1,
  101: 0.88,
  114: 1.12,
};

export const RES_DRAW_OFFSET_Y = {
  7: 0.1,
  35: 0,
  55: -0.06,
  57: -0.03,
  40: -0.08,
  12: -0.12,
  45: -0.12,
  114: 0,
};

export const BACK_COL_DRAW_OFFSET_Y = 0;

export function groundPortraitAnchorForRes(res) {
  if (res === 7 || res === 30) return 1.0;
  if ([55, 56, 57, 114].includes(res)) return 0.92;
  return 0.9;
}

export function flyingAltitudeForRes(res) {
  if (res === 40) return 0.58;
  if (res === 12 || res === 45) return 0.38;
  return 0.28;
}

export function flyingBoxBoostForRes(res) {
  if (res === 40) return 1.18;
  if (res === 12 || res === 45) return 1.38;
  return 1.12;
}

export function drawOffsetYForUnit(unit, boxH) {
  const resOff = RES_DRAW_OFFSET_Y[unit.res] ?? 0;
  const flying = unit.viewType === 6 && unit.hp / Math.max(1, unit.maxHp) > 0.5;
  const flyOff = flying ? -0.08 : 0.02;
  return boxH * (resOff + flyOff);
}

/** 飞行单位(viewType=6) 各动画姿态差异大，禁止 merge；见 bake-soldier-animations.mjs */
export const MERGE_BOUNDS_RES = new Set([2, 4, 7, 18, 19, 20, 21, 25, 27, 30, 32, 38, 114]);
export const PER_FRAME_BOUNDS_RES = new Set([20]);

export function canvasSizeForRes(res, viewTypeMap) {
  if ([55, 56, 57].includes(res)) return 300;
  if (res === 57) return 320;
  if (res === 35) return 280;
  if (res === 7 || res === 30) return 260;
  const viewType = viewTypeMap?.get?.(res);
  if (viewType === 6) return 300;
  return 220;
}

export function anchorYForRes(res, viewTypeMap) {
  const viewType = viewTypeMap?.get?.(res);
  if (res === 35) return 0.9;
  if (res === 114) return 0.9;
  if (res === 36) return 0.88;
  if (viewType === 6) return 0.75;
  if (viewType === 5) return 0.88;
  return 0.84;
}
