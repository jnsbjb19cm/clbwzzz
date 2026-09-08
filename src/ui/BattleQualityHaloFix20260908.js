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

function drawConvergingVortex(ctx, cx, cy, palette, quality) {
  const strong = quality >= 4;
  const perfect = quality === 5;
  const armColor = hexToRgba(palette[strong ? 2 : 1], strong ? 0.82 : 0.62);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.strokeStyle = armColor;
  ctx.shadowColor = hexToRgba(palette[1], 0.82);
  ctx.shadowBlur = perfect ? 7 : 5;
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

export function installBattleQualityHaloFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  const proto = BattleRenderer.prototype;
  function drawReferenceQualityPedestal20260908(ctx, unit, layout) {
    if (!ctx || !layout || layout.isDying) return;
    const quality = normalizeCraftQuality(unit?.craftQuality ?? 1);
    const palette = QUALITY_PALETTES[quality] ?? QUALITY_PALETTES[2];
    const cx = Number(layout.cx) || 0;
    const cy = (Number(layout.footY) || 0) + 1;
    const isPerfect = quality === 5;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1) Feathered outer aura around the ring.
    ctx.shadowColor = hexToRgba(palette[1], 0.88);
    ctx.shadowBlur = isPerfect ? 13 : 10;
    ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 0.36);
    ctx.lineWidth = isPerfect ? 10 : 8;
    ellipseArc(ctx, cx, cy, HALO_RX + 1.5, HALO_RY + 0.8, 0, Math.PI * 2);
    ctx.stroke();

    // 2) Thin rear rim. Character art is rendered after this halo pass, so the
    // rear part naturally disappears behind the feet/body like the reference.
    ctx.shadowBlur = 5;
    ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 0.82);
    ctx.lineWidth = isPerfect ? 4.8 : 3.8;
    ellipseArc(ctx, cx, cy - 0.8, HALO_RX, HALO_RY, Math.PI, Math.PI * 2);
    ctx.stroke();

    // 3) The missing reference detail: energy streams curl toward one centre point.
    drawConvergingVortex(ctx, cx, cy, palette, quality);

    // 4) Thick bright front edge: the visible energy-donut depth.
    ctx.shadowColor = hexToRgba(palette[3], 0.94);
    ctx.shadowBlur = isPerfect ? 10 : 8;
    ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 1);
    ctx.lineWidth = isPerfect ? 9.2 : 7.2;
    ellipseArc(ctx, cx, cy, HALO_RX, HALO_RY, 0, Math.PI);
    ctx.stroke();

    // 5) Narrow inner/front highlight.
    ctx.shadowBlur = 3;
    ctx.strokeStyle = hexToRgba(palette[2], quality >= 4 ? 0.92 : 0.66);
    ctx.lineWidth = quality >= 4 ? 2.4 : 1.8;
    ellipseArc(ctx, cx + 3, cy - 0.6, HALO_RX - 7, HALO_RY - 3.6, 0.12 * Math.PI, 0.72 * Math.PI);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba(palette[1], 0.72);
    ctx.lineWidth = isPerfect ? 5.6 : 3.6;
    ctx.shadowBlur = isPerfect ? 7 : 4;
    ellipseArc(ctx, cx, cy, HALO_RX + 0.4, HALO_RY + 0.2, 0.78 * Math.PI, 1.17 * Math.PI);
    ctx.stroke();
    ellipseArc(ctx, cx, cy, HALO_RX + 0.4, HALO_RY + 0.2, -0.17 * Math.PI, 0.18 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  drawReferenceQualityPedestal20260908.__qualityHaloFixed20260908 = true;
  proto.drawUnitHalo = drawReferenceQualityPedestal20260908;
}