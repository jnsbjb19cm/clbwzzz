import { normalizeCraftQuality, resolveCraftQuality } from '../core/constants.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleQualityHaloFix20260908');
const WIDTH = 448;
const HEIGHT = 272;
const DISPLAY_WIDTH = 112;
const DISPLAY_HEIGHT = 68;
const bakedPedestals = new Map();
let relief = null;
let materialReady = null;
let hasCloudMaterial = false;

// Original generated grayscale artwork, not the user's reference image.
// Math-only relief remains available while the local material loads or fails.
// Both paths share exact quality colors and a single cached draw per unit.
const noiseGrid = new Float32Array(256 * 256);
let noiseState = 0x6d2b79f5;
for (let i = 0; i < noiseGrid.length; i += 1) {
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  noiseGrid[i] = (noiseState >>> 0) / 4294967295;
}
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };

function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = noiseGrid[((iy & 255) << 8) | (ix & 255)];
  const b = noiseGrid[((iy & 255) << 8) | ((ix + 1) & 255)];
  const c = noiseGrid[(((iy + 1) & 255) << 8) | (ix & 255)];
  const d = noiseGrid[(((iy + 1) & 255) << 8) | ((ix + 1) & 255)];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function cloud(x, y) {
  return noise(x, y) * 0.55 + noise(x * 2.07 + 31, y * 2.07 + 17) * 0.29
    + noise(x * 4.13 + 73, y * 4.13 + 59) * 0.16;
}

function buildRelief() {
  if (relief) return relief;
  const data = new Float32Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const nx = (x + 0.5 - WIDTH / 2) / 185;
      const ny = (y + 0.5 - HEIGHT / 2) / 90;
      const radius = Math.hypot(nx, ny);
      if (radius > 1.12) continue;
      const angle = Math.atan2(ny, nx);
      // Cloud relief is partly advected and partly diffuse. Pure polar noise
      // produces smooth combed streaks; the unswirled volume breaks those up.
      const twist = angle + 2.9 * radius;
      const u = Math.cos(twist) * radius;
      const v = Math.sin(twist) * radius;
      const fog = cloud(u * 9 + 80, v * 9 + 110);
      const volume = cloud(nx * 12 + 120, ny * 12 + 20);
      const detail = cloud(u * 46 + 40, v * 46 + 30);
      const mist = fog * 0.78 + volume * 0.22;
      const turbulence = (mist - 0.5) * 0.36 + (detail - 0.5) * 0.16;
      const winding = angle + 6.5 * Math.pow(radius, 0.84) + turbulence;
      // Unequal spacing, changing width and opacity: no three-fold pinwheel.
      const ridgeA = Math.pow((1 + Math.cos(winding - 0.15)) / 2, 16);
      const ridgeB = Math.pow((1 + Math.cos(winding - 1.58 - 0.3 * radius)) / 2, 25);
      const ridgeC = Math.pow((1 + Math.cos(winding - 3.47 + 0.4 * radius)) / 2, 12);
      const ridgeD = Math.pow((1 + Math.cos(winding - 5.03)) / 2, 29);
      const arms = ridgeA * 0.8 + ridgeB * 0.44 + ridgeC * 0.73 + ridgeD * 0.40;
      const veil = Math.pow((1 + Math.cos(winding - 0.5)) / 2, 4) * 0.32
        + Math.pow((1 + Math.cos(winding - 3.8)) / 2, 3) * 0.24;
      const filament = Math.pow((1 + Math.cos(6 * winding + radius * 7 + detail * 1.5)) / 2, 14);
      const core = 0.52 * Math.exp(-Math.pow(radius / 0.16, 2));
      const inner = Math.exp(-Math.pow(radius / 0.70, 2));
      const rim = Math.exp(-Math.pow((radius - 0.94 - (mist - 0.5) * 0.015) / 0.047, 2));
      const outerCut = smooth((1.065 + (volume - 0.5) * 0.035 - radius) / 0.13);
      const armFade = 1 - smooth((radius - 0.72) / 0.23);
      const spiralLight = clamp(
        inner * 0.18
        + arms * armFade * (0.51 + mist * 0.42)
        + veil * inner * 0.24
        + filament * (0.055 + detail * 0.13) * (1 - smooth((radius - 0.88) / 0.12))
        + Math.max(0, mist - 0.33) * 0.17 * (1 - smooth((radius - 0.91) / 0.15))
      );
      // Optical-style layering keeps the nucleus round; additive clipping
      // otherwise cuts the intersecting arms into an opaque polygon.
      const white = 1 - (1 - core) * (1 - spiralLight * 0.30);
      const shade = clamp(0.59 + mist * 0.44 + rim * 0.24);
      const opacity = outerCut * (0.90 + mist * 0.10);
      const index = (y * WIDTH + x) * 3;
      data[index] = shade;
      data[index + 1] = white;
      data[index + 2] = opacity;
    }
  }
  relief = data;
  return relief;
}

function paintStar(ctx, x, y, size, strength) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.4);
  glow.addColorStop(0, `rgba(255,255,255,${0.78 * strength})`);
  glow.addColorStop(0.22, `rgba(255,255,255,${0.30 * strength})`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, size * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.fillStyle = `rgba(255,255,255,${0.8 * strength})`;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(-size * 0.13, -size * 0.13);
  ctx.lineTo(0, -size * 0.7);
  ctx.lineTo(size * 0.13, -size * 0.13);
  ctx.lineTo(size, 0);
  ctx.lineTo(size * 0.13, size * 0.13);
  ctx.lineTo(0, size * 0.7);
  ctx.lineTo(-size * 0.13, size * 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function preloadQualityDiscMaterial() {
  if (materialReady) return materialReady;
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  materialReady = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(false); return; }
        ctx.drawImage(image, 12, 20, WIDTH - 24, HEIGHT - 40);
        const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        const surface = new Float32Array(WIDTH * HEIGHT * 3);
        for (let p = 0; p < WIDTH * HEIGHT; p += 1) {
          const luminance = (pixels[p * 4] + pixels[p * 4 + 1] + pixels[p * 4 + 2]) / 765;
          const radius = Math.hypot(((p % WIDTH) - WIDTH / 2) / 190,
            (Math.floor(p / WIDTH) - HEIGHT / 2) / 92);
          // Neutral relief controls illumination only; the five base RGB values
          // are applied by bakeQualityPedestal, never by an image hue filter.
          surface[p * 3] = 0.62 + luminance * 0.38;
          // Color carries the disk. A restrained milky highlight describes
          // the arms, with a small soft nucleus instead of a blown-out center.
          const arms = Math.pow(smooth((luminance - 0.32) / 0.66), 1.8)
            * (1 - 0.72 * smooth((radius - 0.81) / 0.17)) * 0.30;
          const core = 0.52 * Math.exp(-Math.pow(radius / 0.16, 2));
          surface[p * 3 + 1] = 1 - (1 - core) * (1 - arms);
          surface[p * 3 + 2] = pixels[p * 4 + 3] / 255;
        }
        relief = surface;
        hasCloudMaterial = true;
        bakedPedestals.clear();
        for (let quality = 1; quality <= 5; quality += 1) bakeQualityPedestal(quality);
        resolve(true);
      } catch {
        // Missing/undecodable assets must not remove the unit's quality marker.
        resolve(false);
      }
    };
    image.onerror = () => resolve(false);
    image.src = new URL('../assets/quality-vortex-material-20260912.png', import.meta.url).href;
  });
  return materialReady;
}

function bakeQualityPedestal(quality) {
  if (bakedPedestals.has(quality)) return bakedPedestals.get(quality);
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Exact base colors from CRAFT_QUALITY. Only luminance and white highlights
  // are layered on these values; no hue shifts or saturation remapping.
  const hex = resolveCraftQuality(quality).color;
  const value = Number.parseInt(hex.slice(1), 16);
  const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const surface = buildRelief();
  const pixels = ctx.createImageData(WIDTH, HEIGHT);
  for (let p = 0; p < WIDTH * HEIGHT; p += 1) {
    const shade = surface[p * 3];
    const white = surface[p * 3 + 1];
    for (let channel = 0; channel < 3; channel += 1) {
      const base = rgb[channel] * shade;
      pixels.data[p * 4 + channel] = Math.round(base + (255 - base) * white);
    }
    pixels.data[p * 4 + 3] = Math.round(surface[p * 3 + 2] * 255);
  }
  ctx.putImageData(pixels, 0, 0);

  // Small scattered points live on the spiral surface, not in the surrounding
  // transparent rectangle. Identical placements across all five qualities.
  for (let i = 0; !hasCloudMaterial && i < 36; i += 1) {
    const theta = i * 2.39996323;
    const radius = 0.60 + noiseGrid[i + 317] * 0.29;
    const x = WIDTH / 2 + Math.cos(theta) * radius * 185;
    const y = HEIGHT / 2 + Math.sin(theta) * radius * 90;
    const major = i % 7 === 0;
    paintStar(ctx, x, y, major ? 3 : 1.2 + noiseGrid[i + 517] * 1.6,
      major ? 0.25 : 0.07 + noiseGrid[i + 717] * 0.07);
  }
  const sprite = { canvas, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT };
  bakedPedestals.set(quality, sprite);
  return sprite;
}

export function paintQualityDisc(ctx, cx, cy, quality) {
  const sprite = bakeQualityPedestal(normalizeCraftQuality(quality));
  if (sprite) ctx.drawImage(sprite.canvas, cx - sprite.width / 2, cy - sprite.height / 2,
    sprite.width, sprite.height);
}

export function installBattleQualityHaloFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  for (let quality = 1; quality <= 5; quality += 1) bakeQualityPedestal(quality);
  void preloadQualityDiscMaterial();

  function drawReferenceQualityPedestal20260908(ctx, unit, layout) {
    if (!ctx || !layout || layout.isDying) return;
    paintQualityDisc(ctx, Number(layout.cx) || 0, (Number(layout.footY) || 0) + 1,
      unit?.craftQuality ?? 1);
  }
  drawReferenceQualityPedestal20260908.__qualityHaloFixed20260908 = true;
  drawReferenceQualityPedestal20260908.__qualityHaloStyle = 'original-cloud-vortex';
  drawReferenceQualityPedestal20260908.__usesProjectQualityColors = true;
  drawReferenceQualityPedestal20260908.__hasInteriorShadow = false;
  BattleRenderer.prototype.drawUnitHalo = drawReferenceQualityPedestal20260908;
}
