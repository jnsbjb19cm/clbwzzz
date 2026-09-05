import { normalizeCraftQuality, resolveCraftQuality } from '../core/constants.js';

function parseHexColor(hex) {
  const value = String(hex ?? '#8aa0a0').replace('#', '');
  const full = value.length === 3
    ? value.split('').map((ch) => ch + ch).join('')
    : value.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * 战场品质底座纯绘制函数。
 * 这里先保持现有行为不变；独立模块只为了让 Node 回归测试不必加载整条战斗 UI 调度链。
 */
export function drawCraftQualityPedestal(ctx, unit, layout) {
  if (!layout || layout.isDying) return;
  const quality = normalizeCraftQuality(unit?.craftQuality);
  const color = resolveCraftQuality(quality).color;
  const { r, g, b } = parseHexColor(color);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now / 1000 + (Number(unit?.uid) || 0) * 0.071;
  const width = Math.max(34, layout.circleSize * (0.98 + quality * 0.025));
  const height = width * 0.34;
  const x = layout.cx;
  const y = layout.footY - layout.circleSize * 0.105;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + height * 0.08, width * 0.53, height * 0.55, 0, 0, Math.PI * 2);
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = 'rgb(10,16,21)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(x, y, width * 0.49, height * 0.48, 0, 0, Math.PI * 2);
  ctx.globalAlpha = 0.24 + quality * 0.035;
  ctx.fillStyle = `rgb(${Math.round(r * 0.42)},${Math.round(g * 0.42)},${Math.round(b * 0.42)})`;
  ctx.fill();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = quality >= 5 ? 2.5 : quality >= 4 ? 2.1 : 1.6;
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(0, y);
  ctx.scale(1, 0.36);
  ctx.translate(0, -y);
  const allowAnimatedPack = !this._lowQuality && Number(this._visibleUnitCount ?? 0) < 60;
  const originalPackRendered = allowAnimatedPack && this.drawGlobalFxPack?.(
    ctx,
    'qualityLightCircle',
    x,
    y,
    width * 1.36,
    elapsed,
  ) === true;
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(x, y, width * 0.34, height * 0.31, 0, 0, Math.PI * 2);
  ctx.globalAlpha = originalPackRendered ? 0.2 : 0.5;
  ctx.strokeStyle = quality === 1 ? 'rgb(150,150,150)' : 'rgb(245,252,255)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  this._unitHaloAudit ??= [];
  if (this._unitHaloAudit.length > 160) this._unitHaloAudit.length = 0;
  this._unitHaloAudit.push({
    uid: unit?.uid,
    quality,
    width,
    height,
    cellCircleSize: layout.circleSize,
    centerX: x,
    centerY: y,
    footY: layout.footY,
    pedestalLayers: 3,
    qualityPedestal: true,
    qualityShimmer: originalPackRendered,
    usesRadialGradient: false,
    usesOffscreenCanvas: false,
    animatedQualityLightCircle: originalPackRendered,
    highUnitCountThrottled: !allowAnimatedPack,
    sourcePack: 'qualityLightCircle',
  });
}
