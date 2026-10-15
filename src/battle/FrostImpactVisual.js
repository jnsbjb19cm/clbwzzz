import { getSharedImage, loadSharedImage } from '../core/SharedImageAssets20261013.js';

// The original frost sphere is a static sprite, not a travelling Bullet77 pack.
export function drawFrostImpact(renderer, ctx, fx, x, y, cellWidth) {
  const url = '/sprites/bullets/77.png';
  const image = renderer.bulletCache.get('77') ?? getSharedImage(url);
  if (!image) { void loadSharedImage(url); return false; }
  const progress = Math.min(1, Math.max(0, Number(fx.t) || 0) / 0.8);
  const size = cellWidth * (1.05 + Math.min(1, progress * 4) * 0.25);
  const height = size * image.naturalHeight / Math.max(1, image.naturalWidth);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, progress * 10) * Math.min(1, (1 - progress) * 3);
  ctx.drawImage(image, x - size / 2, y - height / 2, size, height);
  ctx.restore();
  return true;
}
