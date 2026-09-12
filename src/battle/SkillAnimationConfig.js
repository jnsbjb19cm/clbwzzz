import { getGameSetting } from '../core/GameSettingsStore20260910.js';

export const SKILL_RESOURCE_ID = Object.freeze({
  527: 506,
  538: 502,
});

export const SKILL_ANIMATION_DURATION = Object.freeze({
  500: 1.23,
  501: 2.76,
  502: 0.85,
  503: 0.85,
  506: 1.04,
  507: 0.85,
  514: 0.85,
  517: 0.85,
  523: 1.25,
  529: 0.85,
  530: 0.85,
  531: 0.85,
  532: 0.85,
  533: 0.85,
  534: 1.11,
  535: 1.79,
  536: 0.85,
  537: 1.65,
  539: 0.85,
  542: 0.85,
  543: 0.85,
  544: 0.85,
  550: 0.85,
  552: 0.85,
  557: 0.85,
});

export function resolveSkillResourceId(skillId) {
  const id = Number(skillId) || 500;
  return SKILL_RESOURCE_ID[id] ?? id;
}

export const SKILL_PLAYBACK_RATE = 0.72;

export function getSkillAnimationDuration(skillId, fallback = 0.9) {
  const sourceDuration = SKILL_ANIMATION_DURATION[resolveSkillResourceId(skillId)] ?? fallback;
  return sourceDuration / SKILL_PLAYBACK_RATE;
}

/**
 * Full visual lifetime for one cast. Meteor Rain intentionally plays the
 * original 517 sequence twice; Firebird has its own single-pass animation.
 */
export function getSkillVisualDuration(skillId, fallback = 0.9) {
  const id = Number(skillId);
  const onePass = getSkillAnimationDuration(id, fallback);
  if (id === 517) return Math.max(1.2, onePass * 2);
  return onePass;
}

/**
 * 全屏技能（陨石雨 517、暴风雪 503、致命诅咒 539 等）的方向表现。
 *
 * 2026-09-10 定稿：**所有全屏技能都瞬间整屏铺满**（曾经的「从左/右扫入」会有进度条/加载条观感，
 * 已彻底取消）。水平镜像保留，但 517 素材左右几乎完全对称（整表左右 alpha 比 0.995），
 * 镜像对它没有可见效果，方向感只能靠技能本身的美术。
 *
 * 想临时调镜像归属：控制台执行
 *   __clbwzFullScreenMirrorEnemy = false  // 改成镜像己方
 *   __clbwzFullScreenMirrorEnemy = true   // 镜像敌方（当前默认）
 */
export const FULLSCREEN_MIRROR_ENEMY = true;

/** 尾段「播完直接消失」的全屏技能（陨石雨的陨石坑不能跟着淡出）。 */
export const SKILL_HARD_CUT_TAIL = Object.freeze([517]);

/**
 * 幻火鸟(537) 没有自己的素材（没有 537.png），按需求用**陨石雨的陨石坑**表现：
 * 只取 517 的陨石坑尾段帧（27~50），不带陨石，并沿用陨石雨原来的坑淡出。
 */
export const SKILL_CRATER_OVERLAY = Object.freeze({
  537: { sourceSkillId: 517, frameStart: 27, frameEnd: 50 },
});

export function fullScreenMirrorEnemy() {
  const override = globalThis.__clbwzFullScreenMirrorEnemy;
  return typeof override === 'boolean' ? override : FULLSCREEN_MIRROR_ENEMY;
}

/** pvpDirection: 1 = 己方施放，-1 = 敌方施放（由 PVP 权威事件打标）。 */
export function shouldMirrorFullScreenFx(fx) {
  const direction = Number(fx?.pvpDirection);
  if (!Number.isFinite(direction) || direction === 0) {
    return fx?.fromEnemySide === true;
  }
  return fullScreenMirrorEnemy() ? direction < 0 : direction > 0;
}

/** 该技能的全屏尾段是否要「播完直接消失」（不淡出）。 */
export function fullScreenHardCutTail(skillId) {
  return SKILL_HARD_CUT_TAIL.includes(Number(skillId));
}

/** 幻火鸟这类「借别的技能尾段当本体」的技能配置，没有就返回 null。 */
export function getCraterOverlay(skillId) {
  const found = SKILL_CRATER_OVERLAY[Number(skillId)];
  return found ? { ...found } : null;
}

/**
 * 重复播放类技能：非最后一轮要跳过的尾帧数。
 *
 * 陨石雨(517) 素材共 51 帧：0~22 帧流星下落、23~26 帧砸下、27~50 帧是陨石坑尾段（24 帧）。
 * 要求「第一段不加载陨石坑，第二段坠落陨石才加载陨石坑」：
 * 非最后一轮只用前 27 帧，最后一轮才播完整尾段。
 */
export const SKILL_TAIL_HOLD_FRAMES = Object.freeze({
  517: 28,
});

export function getSkillTailHoldFrames(skillId) {
  const frames = Math.floor(Number(SKILL_TAIL_HOLD_FRAMES[Number(skillId)]) || 0);
  return frames > 0 ? frames : 0;
}

/**
 * 2026-09-10：全屏技能特效**不再铺满整个画布**，统一缩到战场范围里。
 *
 * 基准值来自设置页「全屏技能特效大小」（GameSettingsStore.fullscreenFxScale），
 * 默认 0.72 = 四周各留 14%、整体小 28%。想临时试数值（立即生效）：
 *   __clbwzFullScreenCoverScale = 0.5   // 再小一点（覆盖设置与下面这张表）
 *   delete __clbwzFullScreenCoverScale  // 回到设置值
 */
export const FULLSCREEN_COVER_SCALE = 0.72;

/**
 * 个别技能的相对比例（乘在基准值上）。陨石雨(517) 用户反馈仍偏大，再小一档：
 * 0.8333 × 0.72 ≈ 0.6。幻火鸟(537) 借的是 517 的素材，会跟随同一缩放。
 *
 * 用相对比例而不是绝对值，是为了让设置页的滑条仍然能整体缩放（否则单独写死的技能不会跟着动）。
 */
export const SKILL_FX_COVER_RATIO = Object.freeze({
  517: 0.8333,
});

function clampCoverScale(value) {
  return Math.max(0.15, Math.min(1, value));
}

/** 基准缩放：调试用全局量 > 设置页 > 代码默认。 */
export function getBaseCoverScale() {
  const runtime = Number(globalThis.__clbwzFullScreenCoverScale);
  if (Number.isFinite(runtime) && runtime > 0) return clampCoverScale(runtime);
  const configured = Number(getGameSetting('fullscreenFxScale'));
  if (Number.isFinite(configured) && configured > 0) return clampCoverScale(configured);
  return clampCoverScale(FULLSCREEN_COVER_SCALE);
}

export function getFullScreenCoverScale(skillId) {
  const ratio = Number(SKILL_FX_COVER_RATIO[Number(skillId)]);
  const factor = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return clampCoverScale(getBaseCoverScale() * factor);
}

/**
 * 伪插帧（帧间交叉淡入）。
 *
 * 素材是一张雪碧图，同一张画面会重复 4~5 帧，所以按帧号推进时画面是「一格一格」跳的。
 * 这里给出每个技能**每张画面的起始帧号**（实测得出），播放时在相邻两张画面之间做交叉淡入，
 * 得到连续的「伪插帧」观感（代价是过渡期间要多画一张全屏图）。
 *
 * 517 实测：51 帧里只有 12 张不同画面，分界帧号 = 0,5,9,14,18,23,27,32,36,40,45,49。
 */
export const SKILL_FRAME_KEYS = Object.freeze({
  517: Object.freeze([0, 5, 9, 14, 18, 23, 27, 32, 36, 40, 45, 49]),
});

/** 需要伪插帧的技能。 */
export const SKILL_FRAME_INTERPOLATE = Object.freeze([517]);

export function getSkillFrameKeys(skillId) {
  const keys = SKILL_FRAME_KEYS[Number(skillId)];
  return Array.isArray(keys) ? keys : null;
}

export function shouldInterpolateFrames(skillId) {
  return SKILL_FRAME_INTERPOLATE.includes(Number(skillId));
}

/**
 * Gameplay resolution timing is independent from visual playback timing.
 * - 527 雷鳴之箭: requested 2-second cast delay.
 * - 518 圣盾术 / 547 铁壳功: true instant effects.
 * Other skills retain the established animation-linked timing.
 */
/**
 * 命中瞬间在动画里的进度（0~1）。默认 0.42（历史值）。
 *
 * 2026-09-12：**番茄炸弹 500 实测不一样** —— skill_anim/500 共 61 帧，
 * 第 0~27 帧是番茄下落，**第 28~31 帧才是落地起爆**（像素统计：填充量 257 → 1576），
 * 也就是命中瞬间在 **~50%** 而不是 42%。之前按 42% 结算，伤害数字比爆炸画面早出约 0.14 秒
 * （用户报告："番茄炸弹的伤害出的时机不对"）。
 */
export const SKILL_IMPACT_RATIO = Object.freeze({
  500: 0.50,
});

export function getSkillResolutionDelay(skillId, fallback = 0.9) {
  const id = Number(skillId);
  if (id === 527) return 2;
  if (id === 518 || id === 547) return 0;
  if (id === 517 || id === 537) return getSkillVisualDuration(id, fallback);
  return getSkillAnimationDuration(id, fallback) * (SKILL_IMPACT_RATIO[id] ?? 0.42);
}
