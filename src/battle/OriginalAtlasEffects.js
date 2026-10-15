import soldierAtlas from '../data/atlas/dyload_soldier.json' with { type: 'json' };
import skillAtlas from '../data/atlas/dyload_skill1.json' with { type: 'json' };
import { getSharedImage, loadSharedImage } from '../core/SharedImageAssets20261013.js';

// MC109 / revive / 图层 10: six displays, two source frames each.
export const SUMMON_FRAMES = [1, 4, 7, 10, 13, 16].map(n =>
  soldierAtlas.sprites.find(s => s.name === `soldier109-image ${n}--109.png`));
const wheel = skillAtlas.sprites.find(s => s.name === 'skillFile535-Graphic--535-shape 2--535');
const ice = [5, 6, 8, 10].map(n =>
  skillAtlas.sprites.find(s => s.name === `skillFile535-Graphic--535-shape ${n}--535`));
export const preloadSummonAtlas = () => loadSharedImage('/atlas/soldier.png');
export const preloadIceWheelAtlas = () => loadSharedImage('/atlas/skill1.png');
export const getSummonAtlas = () => getSharedImage('/atlas/soldier.png');

function drawSprite(ctx, image, sprite, x, bottom, height) {
  const width = height * sprite.width / sprite.height;
  ctx.drawImage(image, sprite.x, sprite.y, sprite.width, sprite.height,
    x - width / 2, bottom - height, width, height);
}

export function drawSummonColumn(ctx, image, layout, progress, alpha) {
  const frame = SUMMON_FRAMES[Math.min(5, Math.floor(Math.max(0, progress) * 6))];
  const scale = (layout.cellW || 64) * 1.35 / 96;
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawSprite(ctx, image, frame, layout.cx, layout.footY + 3 * scale, frame.height * scale);
  ctx.restore();
}

export function drawIceWheel(ctx, effect, {left, top, width, height}, elapsed, travelDuration, trailSeconds) {
  const image = getSharedImage('/atlas/skill1.png');
  if (!image) { void preloadIceWheelAtlas(); return false; }
  const progress = Math.max(0, Math.min(1, elapsed / travelDuration));
  const size = height * 1.25;
  const radius = size / 2;
  const front = left + radius + Math.max(0, width - size) * progress;
  const bottom = top + height;
  const tailAge = Math.max(0, elapsed - travelDuration);
  const trailAlpha = Math.min(1, Math.max(0, (trailSeconds - tailAge) / .7));
  ctx.save();
  if (effect.pvpDirection < 0) { ctx.translate(2 * left + width, 0); ctx.scale(-1, 1); }
  // Fixed world positions: no ice ahead of the wheel and no sliding trail.
  const step = Math.max(12, height * .25);
  for (let x = left + step / 2, index = 0; x <= front && x < left + width; x += step, index++) {
    const birthProgress = Math.max(0, (x - left - radius) / Math.max(1, width - size));
    const grown = Math.min(1, Math.max(0, (elapsed - birthProgress * travelDuration) / .14));
    if (!grown) continue;
    ctx.save();
    ctx.globalAlpha *= trailAlpha * grown * .85;
    drawSprite(ctx, image, ice[index % ice.length], x, bottom, height * (.32 + (index % 3) * .065));
    ctx.restore();
  }
  if (elapsed < travelDuration) {
    ctx.save();
    ctx.globalAlpha *= Math.min(1, elapsed / .1, (travelDuration - elapsed) / .12);
    ctx.translate(front, bottom - radius);
    ctx.rotate(progress * Math.PI * 6);
    // The source wheel is a separate original sprite, not the cropped baked strip.
    drawSprite(ctx, image, wheel, 0, radius, size);
    ctx.restore();
  }
  ctx.restore();
  return true;
}
