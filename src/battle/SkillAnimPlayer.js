import { resolveSkillResourceId } from './SkillAnimationConfig.js';

const SKILL_ANIM_CACHE_BUST = '20260801-animation-sync';
// 技能骨骼需要看清完整过程；仅改变播放速度，不改变技能结算数值。
const SKILL_PLAYBACK_RATE = 0.72;

export function resolveSkillFrameIndex(meta, elapsed, loop = false) {
  const frames = meta?.frames ?? [];
  if (!frames.length) return -1;
  const duration = Math.max(0.001, Number(meta.duration) || frames.length / (meta.frameRate || 12));
  const playbackElapsed = Math.max(0, Number(elapsed) || 0) * SKILL_PLAYBACK_RATE;
  const animationTime = loop ? playbackElapsed % duration : playbackElapsed;
  return Math.min(
    frames.length - 1,
    Math.max(0, Math.floor(animationTime * (meta.frameRate || 12))),
  );
}

class SkillAnimPlayer {
  constructor() {
    this.packs = new Map();
    this.loading = new Map();
    this.coverFrames = new Map();
  }

  request(skillId) {
    const id = resolveSkillResourceId(skillId);
    if (this.packs.has(id)) return Promise.resolve(this.packs.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const pending = Promise.all([
      fetch(`/sprites/skill_anim/${id}.json?v=${SKILL_ANIM_CACHE_BUST}`)
        .then((response) => response.ok ? response.json().catch(() => null) : null)
        .catch(() => null),
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = `/sprites/skill_anim/${id}.png?v=${SKILL_ANIM_CACHE_BUST}`;
      }),
    ]).then(([meta, sheet]) => {
      const pack = meta && sheet ? { meta, sheet } : null;
      if (pack) this.packs.set(id, pack);
      this.loading.delete(id);
      return pack;
    });
    this.loading.set(id, pending);
    return pending;
  }

  preload(skillIds) {
    return Promise.all([...new Set(skillIds.map(resolveSkillResourceId))].map((id) => this.request(id)));
  }

  draw(ctx, skillId, cx, cy, size, elapsed, alpha = 1, loop = false) {
    const id = resolveSkillResourceId(skillId);
    const pack = this.packs.get(id);
    if (!pack) {
      void this.request(id);
      return false;
    }
    const { meta, sheet } = pack;
    const frames = meta.frames ?? [];
    if (!frames.length) return false;
    const frameIndex = resolveSkillFrameIndex(meta, elapsed, loop);
    const frame = frames[frameIndex];
    const bounds = meta.drawBounds ?? {
      left: 0,
      top: 0,
      right: (meta.frameW ?? frame.w) - 1,
      bottom: (meta.frameH ?? frame.h) - 1,
    };
    const sourceW = bounds.right - bounds.left + 1;
    const sourceH = bounds.bottom - bounds.top + 1;
    const scale = size / Math.max(sourceW, sourceH, 1);
    const drawW = sourceW * scale;
    const drawH = sourceH * scale;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(
      sheet,
      frame.x + bounds.left,
      frame.y + bounds.top,
      sourceW,
      sourceH,
      cx - drawW / 2,
      cy - drawH / 2,
      drawW,
      drawH,
    );
    ctx.restore();
    return true;
  }

  drawCover(ctx, skillId, x, y, width, height, elapsed, alpha = 1, loop = false) {
    const id = resolveSkillResourceId(skillId);
    const pack = this.packs.get(id);
    if (!pack) {
      void this.request(id);
      return false;
    }
    const { meta, sheet } = pack;
    const frames = meta.frames ?? [];
    if (!frames.length) return false;
    const frameIndex = resolveSkillFrameIndex(meta, elapsed, loop);
    const frame = frames[frameIndex];
    const bounds = meta.drawBounds ?? {
      left: 0,
      top: 0,
      right: (meta.frameW ?? frame.w) - 1,
      bottom: (meta.frameH ?? frame.h) - 1,
    };
    const sourceW = bounds.right - bounds.left + 1;
    const sourceH = bounds.bottom - bounds.top + 1;
    const cacheWidth = Math.max(1, Math.ceil(width));
    const cacheHeight = Math.max(1, Math.ceil(height));
    const cacheKey = `${id}:${cacheWidth}x${cacheHeight}`;
    let cached = this.coverFrames.get(cacheKey);
    if (typeof OffscreenCanvas !== 'undefined') {
      if (!cached) {
        const canvas = new OffscreenCanvas(cacheWidth, cacheHeight);
        cached = { canvas, context: canvas.getContext('2d'), frameIndex: -1 };
        this.coverFrames.set(cacheKey, cached);
        while (this.coverFrames.size > 8) this.coverFrames.delete(this.coverFrames.keys().next().value);
      }
      if (cached.context && cached.frameIndex !== frameIndex) {
        const coverScale = Math.max(cacheWidth / Math.max(1, sourceW), cacheHeight / Math.max(1, sourceH));
        const coverW = sourceW * coverScale;
        const coverH = sourceH * coverScale;
        cached.context.clearRect(0, 0, cacheWidth, cacheHeight);
        cached.context.drawImage(
          sheet,
          frame.x + bounds.left,
          frame.y + bounds.top,
          sourceW,
          sourceH,
          (cacheWidth - coverW) / 2,
          (cacheHeight - coverH) / 2,
          coverW,
          coverH,
        );
        cached.frameIndex = frameIndex;
      }
      if (cached.context) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.drawImage(cached.canvas, x, y, width, height);
        ctx.restore();
        return true;
      }
    }
    const scale = Math.max(width / Math.max(1, sourceW), height / Math.max(1, sourceH));
    const drawW = sourceW * scale;
    const drawH = sourceH * scale;
    const drawX = x + (width - drawW) / 2;
    const drawY = y + (height - drawH) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(
      sheet,
      frame.x + bounds.left,
      frame.y + bounds.top,
      sourceW,
      sourceH,
      drawX,
      drawY,
      drawW,
      drawH,
    );
    ctx.restore();
    return true;
  }
}

export const skillAnimPlayer = new SkillAnimPlayer();
