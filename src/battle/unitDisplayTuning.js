import { SpriteAtlas } from '../core/SpriteAtlas.js';

/** unit.res 来自卡牌为字符串，统一成数字再查表/Set */
export function resNum(resOrUnit) {
  const raw = typeof resOrUnit === 'object' && resOrUnit != null
    ? resOrUnit.res
    : resOrUnit;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

/**
 * 战场绘制倍率（每个 res 一个系数，1 = 原图大小）。
 *
 * 2026-10-10（用户反馈：「西瓜太郎 / 稻草人 / 嗜血稻草人 / 蒲公英精灵 / 飞行水蜜桃 /
 * 幻·飞行忍者 / 极·寒冰椰子 这些模型有些异常小了，模型要大一些」）：
 * 把这几张卡的系数整体调高约 20~25%。另外飞行单位的上移量是**按立绘高度算的**
 * （见 BattleRenderer 里 portraitY = laneFootY - portraitH * (0.82 + flyLift*0.42)），
 * 所以放大之后飞行水蜜桃 / 幻·飞行忍者会同时自动抬得更高。
 */
export const RES_DRAW_SCALE = {
  1: 0.86,
  2: 1.14,
  3: 0.88,
  4: 0.88,
  5: 0.94,
  6: 0.62,
  7: 1.45,
  9: 0.94,
  12: 1.0,
  15: 0.82,
  17: 0.86,
  18: 0.88,
  19: 1.40,
  20: 0.72,
  21: 1.14,
  22: 0.88,
  23: 0.82,
  24: 0.86,
  25: 1.14,
  26: 0.9,
  27: 1.22,
  28: 0.7,
  30: 1.45,
  32: 1.40,
  35: 1.35,
  36: 1.25,
  38: 1.18,
  39: 0.9,
  40: 1.18,
  45: 1.28,
  51: 0.9,
  52: 0.82,
  53: 0.92,
  54: 1.70,
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

/**
 * 2026-10-10（用户反馈）：「蘑菇仙人的坐标向后（也就是自家基地左一些），极·寒冰椰子也是」。
 * 单位是「向后 = 朝自家基地」：玩家单位向左、敌方单位向右（见 drawOffsetXForUnit）。
 * 数值是**框宽的比例**（0.08 ≈ 往后挪半个格子的 16%），只动视觉，不动逻辑坐标。
 */
/**
 * 2026-10-10（用户反馈）：「蘑菇仙人的坐标向后（自家基地左一些），极·寒冰椰子也是」+
 *   「嗜血稻草人和稻草人的位置也要向左位移，尽量到达中间」。
 * 数值是**框宽的比例**，负 = 屏幕向左（用户描述的都是「向左」），正 = 向右。
 * 只改绘制位置，不动逻辑坐标，不影响命中/攻击距离。
 */
export const RES_DRAW_OFFSET_X = {
  58: -0.10,  // 蘑菇仙人：向后（自家基地方向）
  54: -0.10,  // 极·寒冰椰子：同上
  19: -0.05,  // 稻草人：向左靠中间
  32: -0.05,  // 嗜血稻草人：向左靠中间
};

/** 原图坐标的水平微调；镜像时一起反转，保持脚点落在底座上。 */
export function drawOffsetXForUnit(unit, boxW) {
  const frac = RES_DRAW_OFFSET_X[resNum(unit)] ?? 0;
  if (!frac) return 0;
  const mirrored = (unit.team === 'enemy') !== Boolean(unit._burrowFacingReversed);
  return (mirrored ? -frac : frac) * boxW;
}

// 2026-10-11 用户：西瓜太郎浮空了，向下挪一点（dy = stableTop + offsetY，正值向下）
export const RES_DRAW_OFFSET_Y = {
  // 2026-10-11 用户：「西瓜太郎攻击基地时错误地向下位移一大块」
  // 我上次把 7/30 的 offsetY 从 -0.02 改到 0.06（为了让它别浮空），
  // 但攻击姿态用的是同一个 dy = stableTop + offsetY → 攻击时也被推下去一大块 ✗
  // 所以**还原**为 -0.02（7/30 同素材，保持一致）。
  // 2026-10-11 用户：「西瓜太郎/真·西瓜太郎仍然浮空，位置还要向下」
  // 上一次我把它从 -0.02 直接改到 0.06，结果**攻击姿态也被推下去**（攻击基地时错位 ✗）。
  // 这次拆开：待机用下面的值（向下），攻击姿态用 RES_DRAW_OFFSET_Y_ATTACK（不额外位移）。
  7: 0.06,
  30: 0.06,
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

/**
 * 2026-09-12（用户要求）：这几张卡要明显"离地"——飞行忍者12 / 幻·飞行忍者45 / 分身60 /
 * 飞行水蜜桃40 / 外星哨兵38。数值是**在原有偏移之上再抬**的高度比例（越大越浮）。
 */
const HOVER_LIFT_BY_RES = Object.freeze({
  12: 0.06,   // 飞行忍者      → 总偏移 -0.26
  45: 0.06,   // 幻·飞行忍者   → 总偏移 -0.26
  60: 0.18,   // 幻·飞行忍者(分身) → 总偏移 -0.26
  40: 0.14,   // 飞行水蜜桃    → 总偏移 -0.30
  38: 0.20,   // 外星哨兵      → 总偏移 -0.18
});

/**
 * 攻击姿态的专用偏移（默认 0 = 不额外位移）。
 * 2026-10-11 用户：「西瓜太郎/真·西瓜太郎仍然浮空，位置还要向下」——
 * 而上次直接改 RES_DRAW_OFFSET_Y 会把"贴地修正"也带进攻击动作（攻击基地时错位 ✗）。
 * 所以拆成两张表：待机用 RES_DRAW_OFFSET_Y（向下贴地），攻击用本表（不动）。
 */
export const RES_DRAW_OFFSET_Y_ATTACK = Object.freeze({
  7: 0,
  30: 0,
});

export function drawOffsetYForUnit(unit, boxH, { footAnchored = false, flying = false, attacking = false } = {}) {
  const res = resNum(unit);
  // 攻击姿态走专用表（默认 0）：避免把"待机贴地修正"带进攻击动作 ✗
  const resOff = attacking
    ? (RES_DRAW_OFFSET_Y_ATTACK[res] ?? 0)
    : (RES_DRAW_OFFSET_Y[res] ?? 0);
  let base;
  if (footAnchored || FOOT_ANCHOR_RES.has(res)) {
    base = resOff;
  } else if (flying) {
    base = resOff - 0.08;
  } else {
    base = resOff + 0.02;
  }
  // 离地卡再抬一段（其余单位 hover=0，行为与改动前完全一致）
  return boxH * (base - (HOVER_LIFT_BY_RES[res] ?? 0));
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


/**
 * 2026-10-10（用户反馈「你倍率一样大，基础大小不一样大」）：
 * 两张卡的**精灵基础尺寸/内容比例**不同，倍率相同也会看起来不一样大，
 * 这种只能按观感调。控制台里直接调，不用改代码重发：
 *   __unitScale20261010()          // 打印当前所有倍率
 *   __unitScale20261010(30, 1.9)  // 把真·西瓜太郎(30) 调到 1.9
 */
export function setResDrawScale(res, value) {
  const n = Number(res);
  const v = Number(value);
  if (!Number.isFinite(n) || !Number.isFinite(v) || v <= 0) return null;
  RES_DRAW_SCALE[n] = v;
  return v;
}

if (typeof window !== 'undefined') {
  window.__unitScale20261010 = (res, value) => {
    if (res === undefined) return { ...RES_DRAW_SCALE };
    const applied = setResDrawScale(res, value);
    return { res: Number(res), value: applied ?? RES_DRAW_SCALE[Number(res)] };
  };
}
/**
 * 2026-10-10（用户指定）：「品质圆盘就是 resources/img/quality-common.png 这类 quality_xxx 图片」，
 * 并且「星星位于品质底盘的 2/3 圆圈处，血条要在品质圆盘切线的位置」—— 按**真图**对齐。
 *
 * 真图由 BattleQualityHaloFix20260908 的 paintQualityDisc() 绘制：
 *   · quality-{poor,common,fine,excellent,perfect}.png 实测都是 1448x1086（比例 0.75）
 *   · DISPLAY_WIDTH = 112 → 画出来是 112 x 84
 *   · 绘制方式：以 (cx, footY + 1) 为**中心**居中绘制
 * 图片有透明留白，切线与星星必须按下方记录的可见圆盘边界计算，不能直接使用图片外框。
 *
 * 说明：这里**不再**用 circleSize 去近似（那是我早期按几何猜的，跟真图对不上），
 * circleSize 参数保留兼容；craftQuality 用于匹配对应原图的可见边界。
 */
export const QUALITY_DISC_WIDTH = 112 * 0.85; // 品质图缩小 15%；星星与相切血条同步使用这份几何。
export const QUALITY_DISC_ASPECT = 0.75;    // 五张 quality-*.png 实测 1448x1086

// Visible alpha bounds (alpha >= 32) of the five original 1448x1086 textures.
// Transparent padding is not part of the oval and must not move the HP bar.
const QUALITY_DISC_VISIBLE_BOUNDS = {
  1: [.0939, .9275, .2357, .8066],
  2: [.0981, .9268, .2320, .8029],
  3: [.0994, .9088, .2284, .7772],
  4: [.0988, .9254, .2256, .7956],
  5: [.1008, .9157, .2265, .7864],
};

export function qualityPedestalGeometry(cx, footY, _circleSize, craftQuality = 1) {
  const width = QUALITY_DISC_WIDTH;
  const height = width * QUALITY_DISC_ASPECT;
  const [left, right, top, bottom] = QUALITY_DISC_VISIBLE_BOUNDS[craftQuality] ?? QUALITY_DISC_VISIBLE_BOUNDS[1];
  const imageCenterY = (Number(footY) || 0) + 1;
  const centerY = imageCenterY + height * ((top + bottom) / 2 - .5);
  const ry = height * (bottom - top) / 2;
  return {
    cx: cx + width * ((left + right) / 2 - .5),
    centerY,
    rx: width * (right - left) / 2,
    ry,
    tangentY: centerY + ry,
    twoThirdsY: centerY + ry * .67,
  };
}
