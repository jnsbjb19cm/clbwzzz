import { skillAnimPlayer } from './SkillAnimPlayer.js';
import { resolveSkillResourceId, getSkillAnimationDuration, ICE_WHEEL_TRAIL_SECONDS } from './SkillAnimationConfig.js';
import { drawIceWheel } from './OriginalAtlasEffects.js';

// Spikes/bursts fill a lane with complete repeated clusters. Moving spells sweep
// across it at their native aspect ratio, rather than cropping a giant image.
const CLUSTER_SKILLS = new Set([523, 536]);
export function drawRowSkillVisual(ctx, effect, {left, top, width, height}, elapsed, duration, alpha) {
  const id = Number(effect.skillId);
  if (id === 535) return drawIceWheel(ctx, effect, {left,top,width,height}, elapsed,
    getSkillAnimationDuration(535), ICE_WHEEL_TRAIL_SECONDS);
  const resource = resolveSkillResourceId(id);
  const pack = skillAnimPlayer.packs.get(resource);
  if (!pack) { void skillAnimPlayer.request(resource); return false; }
  const {meta} = pack;
  const bounds = meta.drawBounds;
  const sourceW = bounds ? bounds.right - bounds.left + 1 : meta.frameW;
  const sourceH = bounds ? bounds.bottom - bounds.top + 1 : meta.frameH;
  const nativeWidth = height * sourceW / Math.max(1, sourceH);
  ctx.save();
  if (effect.pvpDirection < 0) { ctx.translate(2 * left + width, 0); ctx.scale(-1, 1); }
  if (CLUSTER_SKILLS.has(id)) {
    const count = Math.max(1, Math.ceil(width / Math.max(1, nativeWidth)));
    const tileWidth = width / count;
    for (let index = 0; index < count; index++) {
      skillAnimPlayer.drawCover(ctx,id,left+index*tileWidth,top,tileWidth,height,elapsed,alpha,effect.loop===true,{fit:'contain'});
    }
  } else {
    const drawWidth = Math.min(width, nativeWidth);
    const progress = Math.max(0, Math.min(1, elapsed / Math.max(.001,duration)));
    skillAnimPlayer.drawCover(ctx,id,left+(width-drawWidth)*progress,top,drawWidth,height,elapsed,alpha,effect.loop===true,{fit:'contain'});
  }
  ctx.restore();
  return true;
}
