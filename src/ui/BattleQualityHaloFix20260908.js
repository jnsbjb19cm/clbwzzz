import { normalizeCraftQuality, resolveCraftQuality } from '../core/constants.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleQualityHaloFix20260908');
const BAKE_SCALE = 2;
const BAKE_W = 112 * BAKE_SCALE;
const BAKE_H = 68 * BAKE_SCALE;
const bakedPedestals = new Map();

function qualityRgb(quality) {
  const value = Number.parseInt(resolveCraftQuality(quality).color.slice(1), 16);
  const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const min = Math.min(...rgb);
  const max = Math.max(...rgb);
  // Keep each project's quality hue while lifting its luminous material.
  return max === min ? rgb : rgb.map((v) => Math.round(53 + (v - min) / (max - min) * 187));
}

function rgba(rgb, alpha, white = 0) {
  return `rgba(${rgb.map((v) => Math.round(v + (255 - v) * white)).join(',')},${alpha})`;
}

function wash(ctx, x, y, rx, ry, stops) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [position, color] of stops) gradient.addColorStop(position, color);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// A tapered ribbon hugs the rim, with a soft shoulder around a broad highlight.
// The elliptical plane is shared with the base so highlights sit on the surface.
function rimRibbon(ctx, color, start, end, radius, width, opacity, white) {
  ctx.save();
  ctx.scale(1, 0.44);
  ctx.lineCap = 'round';
  for (const [spread, alpha] of [[1.8, 0.07], [1.3, 0.15], [1, 0.50]]) {
    for (let step = 0; step < 60; step += 1) {
      const t = step / 60;
      const next = (step + 1) / 60;
      const a = start + (end - start) * t;
      const b = start + (end - start) * next;
      const taper = Math.pow(Math.sin(Math.PI * (0.04 + t * 0.92)), 0.7);
      const ra = radius + Math.sin(t * Math.PI) * 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * ra, Math.sin(a) * ra);
      ctx.lineTo(Math.cos(b) * ra, Math.sin(b) * ra);
      ctx.lineWidth = width * spread * (0.35 + taper * 0.65);
      ctx.strokeStyle = rgba(color, opacity * alpha * taper, white);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function paintQualityDisc(ctx, cx, cy, quality) {
  const color = qualityRgb(quality);
  const clear = rgba(color, 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'source-over';

  // Low, restrained bloom. The empty centre preserves the scene underneath
  // rather than recreating the reference's black character shadow.
  wash(ctx, 0, 2, 48, 25, [
    [0, clear], [0.52, clear], [0.7, rgba(color, 0.12)],
    [0.82, rgba(color, 0.19)], [1, clear],
  ]);

  // Thick rounded annulus: raised inner face and saturated outer wall.
  wash(ctx, 0, 0, 42, 20, [
    [0, clear], [0.51, clear], [0.57, rgba(color, 0.15, 0.12)],
    [0.65, rgba(color, 0.87, 0.24)], [0.76, rgba(color, 0.96, 0.10)],
    [0.87, rgba(color, 0.84)], [0.96, rgba(color, 0.24)], [1, clear],
  ]);

  // Front-side volume sits slightly below the upper surface.
  rimRibbon(ctx, color, 0.02 * Math.PI, 0.99 * Math.PI, 36, 9, 0.83, 0.12);

  // Reference lighting: a broad milky front crescent, broken rear highlights,
  // and two bright shoulders. No complete white outline or central spiral.
  rimRibbon(ctx, color, 0.09 * Math.PI, 0.88 * Math.PI, 29.5, 8.5, 0.97, 0.98);
  rimRibbon(ctx, color, 1.04 * Math.PI, 1.35 * Math.PI, 31.5, 7.0, 0.76, 0.64);
  rimRibbon(ctx, color, 1.53 * Math.PI, 1.90 * Math.PI, 32, 6.5, 0.63, 0.55);
  rimRibbon(ctx, color, 0.30 * Math.PI, 0.76 * Math.PI, 27.5, 2.0, 0.85, 1);

  // Irregular, broad reflection patches on the rim avoid a uniform neon tube.
  wash(ctx, -31, 1, 8, 5.4, [
    [0, rgba(color, 0.58, 0.85)], [0.46, rgba(color, 0.28, 0.65)], [1, clear],
  ]);
  wash(ctx, 29, 4, 8.5, 5.8, [
    [0, rgba(color, 0.42, 0.78)], [0.45, rgba(color, 0.21, 0.54)], [1, clear],
  ]);
  wash(ctx, -4, 14, 18, 4.8, [
    [0, rgba(color, 0.45, 0.88)], [0.42, rgba(color, 0.26, 0.69)], [1, clear],
  ]);

  // Subtle flow follows the front rim; it never crosses the transparent centre.
  rimRibbon(ctx, color, 0.12 * Math.PI, 0.43 * Math.PI, 34.6, 1.1, 0.42, 0.66);
  rimRibbon(ctx, color, 0.59 * Math.PI, 0.88 * Math.PI, 34.8, 1.0, 0.37, 0.69);
  ctx.restore();
}

function bakeQualityPedestal(quality) {
  if (bakedPedestals.has(quality)) return bakedPedestals.get(quality);
  let sprite = null;
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = BAKE_W;
    canvas.height = BAKE_H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(BAKE_SCALE, 0, 0, BAKE_SCALE, BAKE_W / 2, BAKE_H / 2);
      paintQualityDisc(ctx, 0, 0, quality);
      sprite = { canvas, width: BAKE_W / BAKE_SCALE, height: BAKE_H / BAKE_SCALE };
    }
  }
  if (sprite) bakedPedestals.set(quality, sprite);
  return sprite;
}

export function installBattleQualityHaloFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  for (let quality = 1; quality <= 5; quality += 1) bakeQualityPedestal(quality);

  function drawReferenceQualityPedestal20260908(ctx, unit, layout) {
    if (!ctx || !layout || layout.isDying) return;
    const quality = normalizeCraftQuality(unit?.craftQuality ?? 1);
    const cx = Number(layout.cx) || 0;
    const cy = (Number(layout.footY) || 0) + 1;
    const sprite = bakeQualityPedestal(quality);
    if (sprite) {
      ctx.drawImage(sprite.canvas, cx - sprite.width / 2, cy - sprite.height / 2,
        sprite.width, sprite.height);
    } else {
      paintQualityDisc(ctx, cx, cy, quality);
    }
  }

  drawReferenceQualityPedestal20260908.__qualityHaloFixed20260908 = true;
  drawReferenceQualityPedestal20260908.__qualityHaloStyle = 'reference-luminous-rim';
  drawReferenceQualityPedestal20260908.__usesProjectQualityColors = true;
  drawReferenceQualityPedestal20260908.__hasInteriorShadow = false;
  BattleRenderer.prototype.drawUnitHalo = drawReferenceQualityPedestal20260908;
}
