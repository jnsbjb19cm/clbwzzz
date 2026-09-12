import { normalizeCraftQuality } from '../core/constants.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleQualityHaloFix20260908');
const DISPLAY_WIDTH = 112;
const CACHE_WIDTH = 448;
// Literal URLs let Vite include and fingerprint all five original PNGs.
const QUALITY_IMAGES = {
  1: new URL('../../resources/img/quality-poor.png', import.meta.url).href,
  2: new URL('../../resources/img/quality-common.png', import.meta.url).href,
  3: new URL('../../resources/img/quality-fine.png', import.meta.url).href,
  4: new URL('../../resources/img/quality-excellent.png', import.meta.url).href,
  5: new URL('../../resources/img/quality-perfect.png', import.meta.url).href,
};
const bakedPedestals = new Map();
let materialReady = null;

function loadQualityImage(quality, url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const ratio = image.naturalHeight / image.naturalWidth;
        if (!Number.isFinite(ratio) || ratio <= 0) { resolve(false); return; }
        // Scale once, preserving the full source frame, aspect ratio and alpha.
        // No tint, extra glow, star overlays, pixel remapping or regenerated art.
        const canvas = document.createElement('canvas');
        canvas.width = CACHE_WIDTH;
        canvas.height = Math.round(CACHE_WIDTH * ratio);
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        bakedPedestals.set(quality, {
          image: ctx ? canvas : image,
          width: DISPLAY_WIDTH,
          height: DISPLAY_WIDTH * ratio,
        });
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    // A missing asset must not crash battle or substitute the wrong quality.
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

export function preloadQualityDiscMaterial() {
  if (materialReady) return materialReady;
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  materialReady = Promise.all(Object.entries(QUALITY_IMAGES).map(([quality, url]) =>
    loadQualityImage(Number(quality), url))).then((loaded) => loaded.every(Boolean));
  return materialReady;
}

export function paintQualityDisc(ctx, cx, cy, quality) {
  const sprite = bakedPedestals.get(normalizeCraftQuality(quality));
  if (sprite) {
    ctx.drawImage(sprite.image, cx - sprite.width / 2, cy - sprite.height / 2,
      sprite.width, sprite.height);
  } else {
    // Shared promise: no repeated requests or per-frame texture construction.
    void preloadQualityDiscMaterial();
  }
}

export function installBattleQualityHaloFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  void preloadQualityDiscMaterial();

  function drawReferenceQualityPedestal20260908(ctx, unit, layout) {
    if (!ctx || !layout || layout.isDying) return;
    paintQualityDisc(ctx, Number(layout.cx) || 0, (Number(layout.footY) || 0) + 1,
      unit?.craftQuality ?? 1);
  }
  drawReferenceQualityPedestal20260908.__qualityHaloFixed20260908 = true;
  drawReferenceQualityPedestal20260908.__qualityHaloStyle = 'original-quality-images';
  drawReferenceQualityPedestal20260908.__usesOriginalQualityImages = true;
  drawReferenceQualityPedestal20260908.__hasInteriorShadow = false;
  BattleRenderer.prototype.drawUnitHalo = drawReferenceQualityPedestal20260908;
}
