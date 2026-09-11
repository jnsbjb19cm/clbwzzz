import { normalizeCraftQuality } from '../core/constants.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleQualityHaloFix20260908');
// Reference pedestal is a wide, thin perspective ellipse. Dimensions are fixed
// so giant/small unit artwork cannot change the quality pedestal itself.
const HALO_RX = 38;
const HALO_RY = 11.5;

const QUALITY_PALETTES = Object.freeze({
  // 劣质：灰
  1: ['#626970', '#9ca4aa', '#e2e5e7', '#777e85'],
  // 普通：白
  2: ['#aeb8c1', '#f5f8fb', '#ffffff', '#d7e0e7'],
  // 精良：绿
  3: ['#16894f', '#42cb72', '#eaffef', '#27b968'],
  // 优秀：青绿 → 青蓝 → 冰蓝高光 → 亮蓝
  4: ['#17ad9d', '#30d1de', '#e9ffff', '#238ff3'],
  // 完美：浅紫 → 亮紫 → 洋红 → 粉紫高光
  5: ['#9b66df', '#bf61ef', '#ffe7ff', '#e846bd'],
});

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(String(hex).replace('#', ''), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeRingGradient(ctx, cx, palette, alpha = 1) {
  const gradient = ctx.createLinearGradient(cx - HALO_RX, 0, cx + HALO_RX, 0);
  gradient.addColorStop(0, hexToRgba(palette[0], 0.9 * alpha));
  gradient.addColorStop(0.34, hexToRgba(palette[1], 0.98 * alpha));
  gradient.addColorStop(0.58, hexToRgba(palette[2], 1 * alpha));
  gradient.addColorStop(0.74, hexToRgba(palette[3], 0.98 * alpha));
  gradient.addColorStop(1, hexToRgba(palette[3], 0.84 * alpha));
  return gradient;
}

function ellipseArc(ctx, cx, cy, rx, ry, start, end) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, start, end);
}

function drawConvergingVortex(ctx, cx, cy, palette, quality, blurScale = 1) {
  const strong = quality >= 4;
  const perfect = quality === 5;
  const armColor = hexToRgba(palette[strong ? 2 : 1], strong ? 0.82 : 0.62);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.strokeStyle = armColor;
  ctx.shadowColor = hexToRgba(palette[1], 0.82);
  ctx.shadowBlur = (perfect ? 7 : 5) * blurScale;
  ctx.lineWidth = perfect ? 2.6 : strong ? 2.2 : 1.7;

  // Four curved energy streams start on the ring and curl into one bright point.
  // They intentionally do not fill the centre: the reference looks like a vortex,
  // not a solid oval/shadow.
  const arms = [
    [-0.86, -0.18, -0.55, -0.62, -0.20, -0.30],
    [0.86, -0.15, 0.58, -0.58, 0.21, -0.29],
    [-0.78, 0.48, -0.48, 0.36, -0.18, 0.18],
    [0.78, 0.48, 0.47, 0.37, 0.18, 0.18],
  ];
  for (const [sx, sy, c1x, c1y, c2x, c2y] of arms) {
    ctx.beginPath();
    ctx.moveTo(cx + HALO_RX * sx, cy + HALO_RY * sy);
    ctx.bezierCurveTo(
      cx + HALO_RX * c1x,
      cy + HALO_RY * c1y,
      cx + HALO_RX * c2x,
      cy + HALO_RY * c2y,
      cx,
      cy + 0.5,
    );
    ctx.stroke();
  }

  // A second, shorter curl makes the streams visibly rotate before converging.
  ctx.strokeStyle = hexToRgba(palette[3], perfect ? 0.74 : 0.58);
  ctx.lineWidth = perfect ? 1.9 : 1.45;
  ctx.beginPath();
  ctx.moveTo(cx - HALO_RX * 0.44, cy + HALO_RY * 0.08);
  ctx.bezierCurveTo(
    cx - HALO_RX * 0.22, cy - HALO_RY * 0.40,
    cx + HALO_RX * 0.18, cy - HALO_RY * 0.28,
    cx, cy + 0.5,
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + HALO_RX * 0.43, cy + HALO_RY * 0.12);
  ctx.bezierCurveTo(
    cx + HALO_RX * 0.22, cy + HALO_RY * 0.43,
    cx - HALO_RX * 0.16, cy + HALO_RY * 0.28,
    cx, cy + 0.5,
  );
  ctx.stroke();

  // Tiny convergence core only. The rest of the centre remains transparent.
  const core = ctx.createRadialGradient(cx, cy + 0.5, 0, cx, cy + 0.5, perfect ? 5 : 4);
  core.addColorStop(0, hexToRgba(palette[2], 0.96));
  core.addColorStop(0.35, hexToRgba(palette[1], 0.58));
  core.addColorStop(1, hexToRgba(palette[1], 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy + 0.5, perfect ? 5 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 2026-09-11 性能：品质底座的美术完全静态（与时间/单位无关，只随品质变化），
 * 但旧实现是「每个单位每帧」现画 3 个线性渐变 + 18 个 colorStop + 6 次带
 * shadowBlur 的椭圆描边 + 6 条贝塞尔光流。45 个单位时光栅化开销可达 40ms+/帧。
 * 现在按品质烘焙成一张贴图（同一段绘制代码，只画一次），逐帧只 drawImage。
 *
 * 注意：shadowBlur 按规范不随 CTM 缩放，所以按 BAKE_SCALE 放大画布时，
 * 阴影半径要同步乘 BAKE_SCALE，才能烘焙出与原来一致的外观。
 */
const BAKE_SCALE = 2;
const BAKE_W = Math.ceil((HALO_RX * 2 + 36) * BAKE_SCALE);
const BAKE_H = Math.ceil((HALO_RY * 2 + 36) * BAKE_SCALE);
const bakedPedestals = new Map();

/** 以逻辑坐标 (cx, cy) 为圆心绘制品质底座；blurScale 用于高清烘焙时补偿 shadowBlur。 */
function paintQualityPedestal(ctx, cx, cy, quality, blurScale = 1) {
  const palette = QUALITY_PALETTES[quality] ?? QUALITY_PALETTES[2];
  const isPerfect = quality === 5;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1) Feathered outer aura around the ring.
  ctx.shadowColor = hexToRgba(palette[1], 0.88);
  ctx.shadowBlur = (isPerfect ? 13 : 10) * blurScale;
  ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 0.36);
  ctx.lineWidth = isPerfect ? 10 : 8;
  ellipseArc(ctx, cx, cy, HALO_RX + 1.5, HALO_RY + 0.8, 0, Math.PI * 2);
  ctx.stroke();

  // 2) Thin rear rim. Character art is rendered after this halo pass, so the
  // rear part naturally disappears behind the feet/body like the reference.
  ctx.shadowBlur = 5 * blurScale;
  ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 0.82);
  ctx.lineWidth = isPerfect ? 4.8 : 3.8;
  ellipseArc(ctx, cx, cy - 0.8, HALO_RX, HALO_RY, Math.PI, Math.PI * 2);
  ctx.stroke();

  // 3) The missing reference detail: energy streams curl toward one centre point.
  drawConvergingVortex(ctx, cx, cy, palette, quality, blurScale);

  // 4) Thick bright front edge: the visible energy-donut depth.
  ctx.shadowColor = hexToRgba(palette[3], 0.94);
  ctx.shadowBlur = (isPerfect ? 10 : 8) * blurScale;
  ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 1);
  ctx.lineWidth = isPerfect ? 9.2 : 7.2;
  ellipseArc(ctx, cx, cy, HALO_RX, HALO_RY, 0, Math.PI);
  ctx.stroke();

  // 5) Narrow inner/front highlight.
  ctx.shadowBlur = 3 * blurScale;
  ctx.strokeStyle = hexToRgba(palette[2], quality >= 4 ? 0.92 : 0.66);
  ctx.lineWidth = quality >= 4 ? 2.4 : 1.8;
  ellipseArc(ctx, cx + 3, cy - 0.6, HALO_RX - 7, HALO_RY - 3.6, 0.12 * Math.PI, 0.72 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(palette[1], 0.72);
  ctx.lineWidth = isPerfect ? 5.6 : 3.6;
  ctx.shadowBlur = (isPerfect ? 7 : 4) * blurScale;
  ellipseArc(ctx, cx, cy, HALO_RX + 0.4, HALO_RY + 0.2, 0.78 * Math.PI, 1.17 * Math.PI);
  ctx.stroke();
  ellipseArc(ctx, cx, cy, HALO_RX + 0.4, HALO_RY + 0.2, -0.17 * Math.PI, 0.18 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

function bakeQualityPedestal(quality) {
  if (bakedPedestals.has(quality)) return bakedPedestals.get(quality);
  let sprite = null;
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas');
      canvas.width = BAKE_W;
      canvas.height = BAKE_H;
      const c = canvas.getContext('2d');
      if (c) {
        // 以画布中心为逻辑原点，按 BAKE_SCALE 放大绘制同一段美术
        c.setTransform(BAKE_SCALE, 0, 0, BAKE_SCALE, BAKE_W / 2, BAKE_H / 2);
        paintQualityPedestal(c, 0, 0, quality, BAKE_SCALE);
        sprite = { canvas, width: BAKE_W / BAKE_SCALE, height: BAKE_H / BAKE_SCALE };
      }
    }
  } catch {
    sprite = null;
  }
  bakedPedestals.set(quality, sprite);
  return sprite;
}

export function installBattleQualityHaloFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  const proto = BattleRenderer.prototype;
  // 预烘焙 5 个品质的贴图（一次性，几毫秒），避免战斗中出现首次使用的卡顿。
  for (const quality of Object.keys(QUALITY_PALETTES)) bakeQualityPedestal(Number(quality));

  function drawReferenceQualityPedestal20260908(ctx, unit, layout) {
    if (!ctx || !layout || layout.isDying) return;
    const quality = normalizeCraftQuality(unit?.craftQuality ?? 1);
    const cx = Number(layout.cx) || 0;
    const cy = (Number(layout.footY) || 0) + 1;
    const sprite = bakeQualityPedestal(quality);
    if (sprite) {
      // 逐帧只画一张贴图：几何与烘焙时完全一致，外观不变，省掉全部渐变/阴影光栅化。
      ctx.drawImage(
        sprite.canvas,
        cx - sprite.width / 2,
        cy - sprite.height / 2,
        sprite.width,
        sprite.height,
      );
      return;
    }
    paintQualityPedestal(ctx, cx, cy, quality, 1);
  }

  drawReferenceQualityPedestal20260908.__qualityHaloFixed20260908 = true;
  proto.drawUnitHalo = drawReferenceQualityPedestal20260908;
}