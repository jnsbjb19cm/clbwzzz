import skillAtlas from '../data/atlas/dyload_skill1.json' with { type: 'json' };
import soldierAtlas from '../data/atlas/dyload_soldier.json' with { type: 'json' };
import { loadSharedImage } from '../core/SharedImageAssets20261013.js';

// Skill544 attacking: 门2 for frames 0..3, 门1 for 4..8, 门3 for 9..13.
// Read the original sprites; the old baked 544 PNG repeats one pose five times.
export const SONG_SEQUENCE = [2, 1, 3].map((number, index) => ({
  ...skillAtlas.sprites.find(s => s.name === `skillFile544-门${number} - 544.png`),
  ticks: [4, 5, 5][index],
  offsetX: index === 2 ? 1.25 : 0,
  offsetY: index === 2 ? 1 : 0,
}));

export async function requestOriginalSongPack() {
  const sheet = await loadSharedImage('/atlas/skill1.png');
  if (!sheet) return null;
  return { sheet, originalSequence: true, meta: {
    skillId: 544, frameW: 65, frameH: 123, duration: .85, frameRate: 14 / .85,
    frames: SONG_SEQUENCE.flatMap(sprite => Array.from({length:sprite.ticks}, () => sprite)),
  }};
}

export function drawOriginalSequenceFrame(ctx, pack, frameIndex, {x,y,width,height}, alpha, cover = false) {
  const frame = pack.meta.frames[frameIndex];
  if (!frame) return false;
  const scale = (cover ? Math.max : Math.min)(width / pack.meta.frameW, height / pack.meta.frameH);
  const left = x + (width - pack.meta.frameW * scale) / 2;
  const top = y + (height - pack.meta.frameH * scale) / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (cover) { ctx.beginPath(); ctx.rect(x,y,width,height); ctx.clip(); }
  // Atlas frameX/Y describe transparent trim; restore it rather than stretching
  // each trimmed pose independently (which causes jitter and clips the last pose).
  ctx.drawImage(pack.sheet,frame.x,frame.y,frame.width,frame.height,
    left + ((frame.offsetX || 0) - (frame.frameX || 0)) * scale,
    top + ((frame.offsetY || 0) - (frame.frameY || 0)) * scale,
    frame.width * scale,frame.height * scale);
  ctx.restore();
  return true;
}

// Bullet77 yidong has eight distinct displays; it is shown at the target, not
// emitted as a travelling projectile. First pose holds 4 ticks, others 1 each.
export const FROST_SEQUENCE = [1,3,5,7,9,11,13,15].map((number,index) => ({
  ...soldierAtlas.sprites.find(s => s.name === `bulletFile77-${number}--77.png`),
  ticks: index === 0 ? 4 : 1,
  offsetX: [0,0,0,0,-2,-1,1,2][index],
  offsetY: [0,0,0,0,-1,-4,1,-5][index],
}));
export function frostFrameAt(progress) {
  let tick = Math.min(10, Math.max(0, Math.floor(progress * 11)));
  for (const frame of FROST_SEQUENCE) { if (tick < frame.ticks) return frame; tick -= frame.ticks; }
  return FROST_SEQUENCE.at(-1);
}
