import {
  fullScreenHardCutTail,
  getCraterOverlay,
  getFullScreenCoverScale,
  getSkillFrameKeys,
  getSkillTailHoldFrames,
  resolveSkillResourceId,
  shouldInterpolateFrames,
  shouldMirrorFullScreenFx,
} from './SkillAnimationConfig.js';

const SKILL_ANIM_CACHE_BUST = '20260801-animation-sync';
// 技能骨骼需要看清完整过程；仅改变播放速度，不改变技能结算数值。
const SKILL_PLAYBACK_RATE = 0.72;

/**
 * 伪插帧：把浮点帧位置换算成「底层画面 + 上层画面 + 淡入权重」。
 *
 * 做法是交叉淡入（下面那层画满，上面那层按权重淡入），这样两张画面重叠的地方
 * 亮度是 t*A+(1-t)*B，不会像「两层各画一半」那样出现中段变暗。
 *
 * 淡入只占每张画面时长的最后 `window` 比例（默认 35%）：前面保持清晰，
 * 末尾短促地溶接到下一张，既补顺了跳帧，又不会长时间两张叠在一起变成重影。
 *
 * keys = 该素材每张画面的起始帧号（升序）；cyclic = 循环段允许最后一张淡回第一张。
 */
export function resolveFrameBlend(keys, position, { cyclic = false, frameCount = 0, window = 0.35 } = {}) {
  const list = Array.isArray(keys) ? keys : null;
  if (!list || list.length < 2) return null;
  const pos = Math.max(0, Number(position) || 0);
  const dissolve = Math.max(0.02, Math.min(1, Number(window) || 0.35));
  for (let i = 0; i < list.length; i += 1) {
    const start = list[i];
    const end = i + 1 < list.length ? list[i + 1] : (frameCount > 0 ? frameCount : list[i] + 1);
    if (pos < start || pos >= end) continue;
    const span = Math.max(1, end - start);
    const fraction = Math.max(0, Math.min(1, (pos - start) / span));
    const blend = Math.max(0, Math.min(1, (fraction - (1 - dissolve)) / dissolve));
    const next = i + 1 < list.length ? list[i + 1] : (cyclic ? list[0] : null);
    return { first: start, second: next, blend };
  }
  const last = list[list.length - 1];
  return cyclic ? { first: last, second: list[0], blend: 0 } : { first: last, second: null, blend: 0 };
}

export function resolveSkillFrameIndex(meta, elapsed, loop = false) {
  const position = resolveSkillFramePosition(meta, elapsed, loop);
  const frames = meta?.frames ?? [];
  if (position < 0 || !frames.length) return -1;
  return Math.min(frames.length - 1, Math.max(0, Math.floor(position)));
}

/** 与上同源的浮点版本：保留小数部分，供「伪插帧」交叉淡入使用。 */
export function resolveSkillFramePosition(meta, elapsed, loop = false) {
  const frames = meta?.frames ?? [];
  if (!frames.length) return -1;
  const duration = Math.max(0.001, Number(meta.duration) || frames.length / (meta.frameRate || 12));
  const playbackElapsed = Math.max(0, Number(elapsed) || 0) * SKILL_PLAYBACK_RATE;
  const animationTime = loop ? playbackElapsed % duration : playbackElapsed;
  return Math.max(0, animationTime * (meta.frameRate || 12));
}

/**
 * 2026-09-10：在技能特效的存活时间（duration）内把源动画恰好播 repeat 遍。
 * 陨石雨(517)要求「同一段时间里播两遍」：以前靠 loop 取模 + 动画自身时长对齐，
 * 一旦 meta.duration 与时长表有偏差，第二遍就播不完整；这里直接按 progress 切段，
 * 保证 0~duration 内恰好走完 repeat 个整周期，且不改变特效总时长。
 *
 * tailHold：非最后一轮跳过的尾帧数。陨石雨的尾段是陨石坑（占 24 帧），
 * 只能出现在最后一轮，否则第一遍就会看到坑、循环回第一帧又消失。
 */
export function resolveRepeatFrameIndex(meta, elapsed, duration, repeat, tailHold = 0) {
  const position = resolveRepeatFramePosition(meta, elapsed, duration, repeat, tailHold);
  const frames = meta?.frames ?? [];
  if (position < 0 || !frames.length) return -1;
  return Math.min(frames.length - 1, Math.max(0, Math.floor(position)));
}

/** 与上同源的浮点版本（保留小数，供伪插帧使用）。 */
export function resolveRepeatFramePosition(meta, elapsed, duration, repeat, tailHold = 0) {
  const frames = meta?.frames ?? [];
  if (!frames.length) return -1;
  const total = Math.max(0.001, Number(duration) || 0);
  const times = Math.max(1, Math.floor(Number(repeat) || 1));
  const time = Math.max(0, Number(elapsed) || 0);
  const usable = Math.max(1, Math.min(frames.length, frames.length - Math.max(0, Math.floor(Number(tailHold) || 0))));

  // 2026-09-10：各轮时长按「各自要播的帧数」比例分配，两段推进速度才一致。
  // 之前每轮平均分（各占一半时长）：第一段 23 帧、第二段 51 帧，帧率差 2 倍，看着两段快慢不均。
  const earlyWeight = usable * (times - 1);
  const totalWeight = Math.max(1, earlyWeight + frames.length);
  const earlySeconds = total * (earlyWeight / totalWeight);

  // 最后一轮：播完整段（含陨石坑），按帧数铺满本轮时长。
  if (time >= earlySeconds) {
    const fraction = Math.min(0.999999, (time - earlySeconds) / Math.max(0.001, total - earlySeconds));
    return fraction * frames.length;
  }

  // 非最后一轮：只播可用帧（不含撞击/陨石坑），一轮一次坠落，总时长不变。
  const roundSeconds = earlySeconds / Math.max(1, times - 1);
  const local = roundSeconds > 0 ? time % roundSeconds : time;
  const fraction = Math.min(0.999999, local / Math.max(0.001, roundSeconds));
  return fraction * usable;
}

/** 需要在一段特效时间里重复播放多遍的技能。 */
export const SKILL_REPEAT_COUNT = Object.freeze({
  517: 2, // 陨石雨
});

export function getSkillRepeatCount(skillId) {
  return Math.max(1, Math.floor(SKILL_REPEAT_COUNT[Number(skillId)] || 1));
}

/**
 * 重复播放时「最后一轮」的起始时间：前面几轮按帧数比例分到的时长。
 * 绘制侧要靠它判断当前是不是最后一轮（决定能不能出现撞击/陨石坑）。
 */
export function resolveRepeatEarlySeconds(meta, duration, repeat, tailHold = 0) {
  const frames = meta?.frames ?? [];
  const total = Math.max(0.001, Number(duration) || 0);
  const times = Math.max(1, Math.floor(Number(repeat) || 1));
  if (times <= 1 || !frames.length) return 0;
  const usable = Math.max(1, Math.min(frames.length, frames.length - Math.max(0, Math.floor(Number(tailHold) || 0))));
  const weight = usable * (times - 1);
  return total * (weight / Math.max(1, weight + frames.length));
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

  /**
   * frameFor(meta, elapsed) —— 三种取帧方式：
   *   1) 同一个 duration 内重复播放 repeat 遍（非最后一轮裁掉尾段 tailHold）
   *   2) 只取素材的一段帧区间（frameStart~frameEnd），用于「借别的技能尾段当本体」（幻火鸟用陨石坑）
   *   3) 常规单遍播放
   * frameIndex 是显式覆盖（伪插帧时用来分别画两张画面）。
   */
  static framePositionFor(meta, elapsed, { duration = 0, repeat = 1, loop = false, tailHold = 0, frameStart = null, frameEnd = null, frameIndex = null } = {}) {
    const frames = meta?.frames ?? [];
    if (frameIndex != null && frames.length) {
      return Math.max(0, Math.min(frames.length - 1, Number(frameIndex) || 0));
    }
    const times = Math.max(1, Math.floor(Number(repeat) || 1));
    if (times > 1 && Number(duration) > 0) {
      return resolveRepeatFramePosition(meta, elapsed, duration, times, tailHold);
    }
    if (frameStart != null && frames.length) {
      const total = Math.max(0.001, Number(duration) || 0.001);
      const fraction = Math.max(0, Math.min(0.999999, (Number(elapsed) || 0) / total));
      const first = Math.max(0, Math.min(frames.length - 1, Math.floor(Number(frameStart) || 0)));
      const rawLast = Number.isFinite(Number(frameEnd)) ? Number(frameEnd) : frames.length - 1;
      const last = Math.max(first, Math.min(frames.length - 1, Math.floor(rawLast)));
      return Math.min(last, first + fraction * (last - first + 1));
    }
    return resolveSkillFramePosition(meta, elapsed, loop);
  }

  /** 整数帧号版本（原有调用方使用）。 */
  static frameIndexFor(meta, elapsed, options = {}) {
    const frames = meta?.frames ?? [];
    const position = SkillAnimPlayer.framePositionFor(meta, elapsed, options);
    if (position < 0 || !frames.length) return -1;
    return Math.min(frames.length - 1, Math.max(0, Math.floor(position)));
  }

  /** 素材 meta（伪插帧需要知道 frameRate / frames）。 */
  metaFor(skillId) {
    return this.packs.get(resolveSkillResourceId(skillId))?.meta ?? null;
  }

  draw(ctx, skillId, cx, cy, size, elapsed, alpha = 1, loop = false, options = null) {
    const id = resolveSkillResourceId(skillId);
    const pack = this.packs.get(id);
    if (!pack) {
      void this.request(id);
      return false;
    }
    const { meta, sheet } = pack;
    const frames = meta.frames ?? [];
    if (!frames.length) return false;
    const frameIndex = SkillAnimPlayer.frameIndexFor(meta, elapsed, { ...options, loop });
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

  drawCover(ctx, skillId, x, y, width, height, elapsed, alpha = 1, loop = false, options = null) {
    const id = resolveSkillResourceId(skillId);
    const pack = this.packs.get(id);
    if (!pack) {
      void this.request(id);
      return false;
    }
    const { meta, sheet } = pack;
    const frames = meta.frames ?? [];
    if (!frames.length) return false;
    const frameIndex = SkillAnimPlayer.frameIndexFor(meta, elapsed, { ...options, loop });
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

/**
 * 2026-09-10：全屏技能（陨石雨 / 暴风雪 / 致命诅咒等）的统一绘制入口。
 *
 * 之前全屏逻辑散落在多个 drawSkillFx 覆写里，改哪份都不一定生效
 * （线上真正跑的是 BattlefieldVisibleGridMapFinal，见那边注释）。这里收敛成一份：
 *   1) **瞬间整屏铺满**：任何全屏技能都不再从一侧扫入，避免出现进度条/加载条观感
 *   2) 可选水平镜像（陨石雨素材左右对称，镜像主要是给别的技能用的）
 *   3) 同一段 duration 内播放 repeat 遍，非最后一轮裁掉尾段
 *      → 陨石雨第一段不加载陨石坑，第二段坠落陨石才加载陨石坑
 *   4) 尾段硬切技能（陨石雨）播完直接消失；其余保留原有的坑淡出
 *   5) 幻火鸟(537) 没有自己的素材：按要求改用陨石雨的陨石坑（无陨石）+ 原坑淡出
 */
export function drawFullScreenSkillFx(ctx, effect, rect, elapsed, duration) {
  const skillId = Number(effect?.skillId);
  const total = Math.max(0.001, Number(duration) || 0.001);
  const time = Math.max(0, Number(elapsed) || 0);
  const remain = 1 - time / total;

  const fadeIn = time < 0.05 ? time / 0.05 : 1;
  // 陨石雨的陨石坑要「播完直接消失」：最后 1% 才收尾（约 1~2 帧）；其余技能沿用原来的淡出。
  const fadeOut = fullScreenHardCutTail(skillId)
    ? (remain <= 0.01 ? Math.max(0, remain / 0.01) : 1)
    : Math.min(1, remain * 4);
  const alpha = Math.max(0, Math.min(1, fadeIn)) * Math.max(0, Math.min(1, fadeOut)) * 0.92;

  const crater = getCraterOverlay(skillId);
  const drawSkillId = crater ? crater.sourceSkillId : skillId;
  const frameRange = crater ? { frameStart: crater.frameStart, frameEnd: crater.frameEnd } : null;

  // 2026-09-10：全屏特效缩到战场范围（默认 0.72 = 整体小 28%），不再铺满整个画布。
  // 幻火鸟借的是陨石雨的素材，直接跟随那份素材的缩放，避免两个技能一大一小（相乘会缩两次）。
  const coverScale = getFullScreenCoverScale(crater ? drawSkillId : skillId);
  const area = coverScale >= 1 ? rect : {
    left: rect.left + rect.width * (1 - coverScale) / 2,
    top: rect.top + rect.height * (1 - coverScale) / 2,
    width: rect.width * coverScale,
    height: rect.height * coverScale,
  };

  ctx.save();
  if (shouldMirrorFullScreenFx(effect)) {
    ctx.translate(2 * area.left + area.width, 0);
    ctx.scale(-1, 1);
  }
  const options = {
    duration: total,
    repeat: crater ? 1 : Math.max(1, Math.floor(Number(effect?.repeatCount) || 0) || getSkillRepeatCount(skillId)),
    tailHold: crater ? 0 : Math.max(0, Math.floor(Number(effect?.tailHoldFrames) || 0) || getSkillTailHoldFrames(skillId)),
    ...(frameRange ?? {}),
  };
  const loop = crater ? false : effect?.loop === true;

  // 伪插帧：素材同一张画面会重复 4~5 帧，按帧号播就是一格一格跳；
  // 这里在相邻两张画面之间交叉淡入（底层画满、上层按权重淡入），得到连续的运动。
  const meta = shouldInterpolateFrames(drawSkillId) ? skillAnimPlayer.metaFor(drawSkillId) : null;
  const keys = meta ? getSkillFrameKeys(drawSkillId) : null;
  if (meta && keys) {
    const frameCount = (meta.frames ?? []).length;
    const rangeStart = options.frameStart ?? 0;
    const rangeEnd = options.frameEnd != null ? options.frameEnd : frameCount - 1;
    // 非最后一轮只播到「可用帧」为止（陨石雨第一段不含撞击与陨石坑），插值也不能越过这条线。
    // 边界用 resolveRepeatEarlySeconds 算，跟着「按帧数比例分配时长」的规则走。
    const isFinalRound = crater || options.repeat <= 1 || time >= resolveRepeatEarlySeconds(meta, total, options.repeat, options.tailHold);
    const usableEnd = isFinalRound ? rangeEnd + 1 : Math.max(rangeStart + 1, Math.min(rangeEnd + 1, frameCount - options.tailHold));
    const activeKeys = keys.filter((key) => key >= rangeStart && key < usableEnd);
    const position = SkillAnimPlayer.framePositionFor(meta, time, options);
    const blend = resolveFrameBlend(activeKeys, position, {
      // 循环段（非最后一轮）允许最后一张画面淡回第一张，让「下一波」衔接不生硬。
      cyclic: !isFinalRound,
      frameCount: usableEnd,
    });
    if (blend && blend.second != null && blend.blend > 0) {
      const firstDrawn = skillAnimPlayer.drawCover(ctx, drawSkillId, area.left, area.top, area.width, area.height, time, alpha, loop, { ...options, frameIndex: blend.first });
      const secondDrawn = skillAnimPlayer.drawCover(ctx, drawSkillId, area.left, area.top, area.width, area.height, time, alpha * blend.blend, loop, { ...options, frameIndex: blend.second });
      ctx.restore();
      return firstDrawn || secondDrawn;
    }
    if (blend) {
      const single = skillAnimPlayer.drawCover(ctx, drawSkillId, area.left, area.top, area.width, area.height, time, alpha, loop, { ...options, frameIndex: blend.first });
      ctx.restore();
      return single;
    }
  }

  const drawn = skillAnimPlayer.drawCover(
    ctx,
    drawSkillId,
    area.left,
    area.top,
    area.width,
    area.height,
    time,
    alpha,
    loop,
    options,
  );
  ctx.restore();
  return drawn;
}
