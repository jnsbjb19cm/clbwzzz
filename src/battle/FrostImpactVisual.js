import { getSharedImage, loadSharedImage } from '../core/SharedImageAssets20261013.js';
import { frostFrameAt } from './OriginalSequenceAnimations.js';

// Original eight-pose sequence at the target. No travelling projectile is added.
export function drawFrostImpact(renderer, ctx, fx, x, y, cellWidth) {
  const progress = Math.min(1, Math.max(0, Number(fx.t) || 0) / Math.max(.001, Number(fx.life) || .8));
  if (progress >= 1) return false;
  const atlas = getSharedImage('/atlas/soldier.png');
  if (atlas) {
    const frame = frostFrameAt(progress);
    const scale = cellWidth * 1.3 / 103;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, progress * 12) * Math.min(1, (1 - progress) * 12);
    ctx.drawImage(atlas,frame.x,frame.y,frame.width,frame.height,
      x + (frame.offsetX - frame.width / 2) * scale,
      y + (frame.offsetY - frame.height / 2) * scale,
      frame.width * scale,frame.height * scale);
    ctx.restore();
    return true;
  }
  void loadSharedImage('/atlas/soldier.png');
  // Keep the existing fallback only while the shared atlas is loading.
  const url = '/sprites/bullets/77.png';
  const image = renderer.bulletCache.get('77') ?? getSharedImage(url);
  if (!image) { void loadSharedImage(url); return false; }
  const size = cellWidth * (1.05 + Math.min(1, progress * 4) * 0.25);
  const height = size * image.naturalHeight / Math.max(1, image.naturalWidth);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, progress * 10) * Math.min(1, (1 - progress) * 3);
  ctx.drawImage(image, x - size / 2, y - height / 2, size, height);
  ctx.restore();
  return true;
}
