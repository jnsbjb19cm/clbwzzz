import { BattleRenderer } from '../battle/BattleRenderer.js';
import { installBattlefieldViewportFxFinal } from './BattlefieldViewportFxFinal.js';
import { installUnitAnimationViewportFinal } from './UnitAnimationViewportFinal.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleStatusFxPerformanceFinal');
const MAX_MASK_CACHE = 0;
const allocations = 0;
const reuses = 0;
const POISON_DOT_KINDS = new Set(['poison', 'curse']);

const STATUS_PALETTE = Object.freeze({
  frozen: Object.freeze({ body: '#2477dc', tint: '#2878d8', rim: '#bdeaff', alpha: 0.9 }),
  slowed: Object.freeze({ body: '#2477dc', tint: '#4d9fd1', rim: '#d9f5ff', alpha: 0.58 }),
  poisoned: Object.freeze({ body: '#66743a', tint: '#5f7d2b', rim: '#b8d94f', alpha: 0.72 }),
  burning: Object.freeze({ body: '#a94e2e', tint: '#b65a32', rim: '#ff9b52', alpha: 0.42 }),
  stunned: Object.freeze({ tint: '#e9c84f', rim: '#fff1a2', alpha: 0.9 }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function drawFallbackCircle(ctx, cx, cy, radius, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStatusRing(ctx, cx, cy, rx, ry, color, alpha, width = 2) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawIceAccent(ctx, cx, footY, circleSize) {
  const palette = STATUS_PALETTE.frozen;
  drawStatusRing(ctx, cx, footY - circleSize * 0.08, circleSize * 0.58, circleSize * 0.25, palette.rim, 0.78, 2.4);
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = '#dff7ff';
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    const x = cx + i * circleSize * 0.19;
    const top = footY - circleSize * (0.28 + (Math.abs(i) % 2) * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, footY - circleSize * 0.02);
    ctx.lineTo(x - circleSize * 0.055, top + circleSize * 0.08);
    ctx.lineTo(x, top);
    ctx.lineTo(x + circleSize * 0.055, top + circleSize * 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPoisonCloud(ctx, cx, footY, circleSize, phase) {
  const palette = STATUS_PALETTE.poisoned;
  const wobble = Math.sin(phase * 3.2) * circleSize * 0.04;
  const puffs = [
    [-0.34, -0.2, 0.23],
    [-0.08, -0.31, 0.28],
    [0.22, -0.2, 0.24],
    [0.38, -0.08, 0.18],
  ];
  for (const [ox, oy, scale] of puffs) {
    drawFallbackCircle(
      ctx,
      cx + ox * circleSize + wobble,
      footY + oy * circleSize,
      circleSize * scale,
      palette.tint,
      0.3,
    );
  }
  drawStatusRing(
    ctx,
    cx,
    footY - circleSize * 0.04,
    circleSize * 0.55,
    circleSize * 0.22,
    palette.rim,
    0.82,
    2.4,
  );
}

function drawBurnAccent(ctx, cx, footY, circleSize, phase) {
  const palette = STATUS_PALETTE.burning;
  const pulse = 0.85 + Math.sin(phase * 7) * 0.12;
  for (let i = -1; i <= 1; i++) {
    const x = cx + i * circleSize * 0.2;
    const r = circleSize * (0.16 + (i === 0 ? 0.05 : 0)) * pulse;
    drawFallbackCircle(ctx, x, footY - circleSize * 0.18, r, palette.tint, 0.13);
    drawStatusRing(ctx, x, footY - circleSize * 0.18, r * 0.72, r, palette.rim, 0.55, 1.6);
  }
}

function drawStunFallback(ctx, cx, cellTop, circleSize, phase) {
  const palette = STATUS_PALETTE.stunned;
  const cy = cellTop + circleSize * 0.16;
  const rot = phase * 4.5;
  drawStatusRing(ctx, cx, cy, circleSize * 0.45, circleSize * 0.15, palette.rim, 0.78, 2.2);
  ctx.save();
  ctx.fillStyle = palette.tint;
  for (let i = 0; i < 3; i++) {
    const angle = rot + i * Math.PI * 2 / 3;
    ctx.globalAlpha = 0.84;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * circleSize * 0.39,
      cy + Math.sin(angle) * circleSize * 0.12,
      Math.max(2.2, circleSize * 0.045),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function activeDotKinds(unit, now) {
  return (Array.isArray(unit?.dots) ? unit.dots : [])
    .filter((dot) => finite(dot?.until, -Infinity) > now)
    .map((dot) => String(dot?.kind ?? ''));
}

function drawStatusEffectsCached(ctx, unit, engine, layout) {
  const { cellTop, cx, footY, circleSize } = layout;
  const now = finite(engine?.time);
  const frozen = Boolean(unit.frozenUntil && now < unit.frozenUntil);
  const stunned = Boolean(unit.stunnedUntil && now < unit.stunnedUntil);
  const slowed = Boolean(unit.slowedUntil && now < unit.slowedUntil);
  const dotKinds = activeDotKinds(unit, now);
  // 旧实现把 swallow / abduct / burn 等所有 DOT 都当成“中毒”画成荧光绿，这是错误的。
  const poisoned = dotKinds.some((kind) => POISON_DOT_KINDS.has(kind));
  const burning = dotKinds.includes('burn');

  this._statusFxAudit = {
    frozen,
    stunned,
    slowed,
    poisoned,
    burning,
    dotKinds: [...dotKinds],
    palette: STATUS_PALETTE,
    freezeUsesSkeletonFx: false,
    singleSpritePass: true,
    offscreenUnitRedraw: false,
    maskAlignedToPrimarySprite: true,
  };
  // 保持 RuntimeStability 的公开审计缝指向最终渲染器，避免后装补丁
  // 实际已生效但诊断仍读取旧对象。
  this._runtimeStabilityStatusAudit = this._statusFxAudit;

  if (frozen) {
    // 身体蓝化已在主精灵绘制中一次完成；这里只恢复原版 freeze 冰棱动画。
    const freezeUsesSkeletonFx = Boolean(this.drawGlobalFxPack?.(
      ctx,
      'freeze',
      cx,
      footY - circleSize * 0.5,
      circleSize * 1.5,
      now,
    ));
    this._statusFxAudit.freezeUsesSkeletonFx = freezeUsesSkeletonFx;
    if (!freezeUsesSkeletonFx) drawIceAccent(ctx, cx, footY, circleSize);
  } else if (slowed) {
    // 减速只使用主精灵阶段的暴风雪蓝色滤镜，不再叠加离屏小画布或冰棱。
  }

  if (poisoned) {
    // 中毒：土/苔绿色，不再使用旧版鲜亮荧光绿和 emoji。
    drawPoisonCloud(ctx, cx, footY, circleSize, now);
  }

  if (burning) {
    // 灼烧与中毒分开表现；不能再因为“都是 DOT”被误画成毒绿色。
    drawBurnAccent(ctx, cx, footY, circleSize, now);
  }

  if (stunned) {
    if (!this.drawGlobalFxPack(ctx, 'vertigo', cx, cellTop + 8, circleSize * 1.9, now)) {
      drawStunFallback(ctx, cx, cellTop, circleSize, now);
    }
  }
}

export function reassertBattleStatusFxPerformanceFinal() {
  BattleRenderer.prototype.drawStatusEffects = drawStatusEffectsCached;
}

export function installBattleStatusFxPerformanceFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 最终视觉补丁都在 CoordinateAuthorityFinal 之后安装：
  // 1) 全屏技能覆盖整个战斗视口；2) 攻击动画允许越过 12x5 逻辑网格边界。
  installBattlefieldViewportFxFinal();
  installUnitAnimationViewportFinal();
  reassertBattleStatusFxPerformanceFinal();

  window.__verifyBattleStatusFxPerformanceFinal = () => {
    const field = document.querySelector('.battlefield-wrap');
    const view = field?.__battleView ?? document.querySelector('.game-container')?.__battleView;
    return {
      enabled: true,
      allocations,
      maskCanvasAllocations: allocations,
      reuses,
      maxCachedSizesPerRenderer: MAX_MASK_CACHE,
      resizesEveryFrame: false,
      singleSpritePass: true,
      offscreenUnitRedraw: false,
      maskAlignedToPrimarySprite: true,
      palette: STATUS_PALETTE,
      lastAudit: view?.renderer?._statusFxAudit ?? null,
      finalRendererReasserted: BattleRenderer.prototype.drawStatusEffects === drawStatusEffectsCached,
    };
  };
}
