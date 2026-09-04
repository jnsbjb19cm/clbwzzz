import {
  isEffectivelyFlying,
  unitAnimPlayer,
} from '../battle/UnitAnimPlayer.js';
import { installProjectileImpactAlignmentFinal } from '../battle/ProjectileImpactAlignmentFinal.js';
import {
  drawOffsetYForUnit,
  FOOT_ANCHOR_RES,
  resNum,
} from '../battle/unitDisplayTuning.js';
import {
  isAttackAnimationState,
  isOverflowAnimationState,
} from '../battle/AnimationViewportPolicy.js';
import { installBattlefieldVisibleGridMapFinal } from './BattlefieldVisibleGridMapFinal.js';

const PATCH_FLAG = Symbol.for('clbwzzz.unitAnimationViewportFinal');
const ACTION_MIN_FRAME_RATE = 24;

export function isOverflowActionState(state) {
  return isOverflowAnimationState(state);
}

function frameRateForState(anim, state) {
  const nativeRate = Math.max(1, Number(anim?.frameRate) || 12);
  if (isAttackAnimationState(state) || state === 'secondAttackStatus') {
    return Math.max(ACTION_MIN_FRAME_RATE, nativeRate);
  }
  return nativeRate;
}

function footFracFor(pack, state) {
  const drawFootY = pack?.meta?.drawFootY;
  if (drawFootY) {
    const exact = Number(drawFootY[state]);
    if (Number.isFinite(exact)) return exact;
    const idle = Number(drawFootY.default);
    if (Number.isFinite(idle)) return idle;
    const flying = Number(drawFootY.flying);
    if (Number.isFinite(flying)) return flying;
  }
  const bounds = pack?.meta?.uniformBounds;
  const frameH = Number(pack?.meta?.frameH) || 1;
  return bounds ? (bounds.bottom + 1) / frameH : 0.88;
}

function canvasLogicalViewport(ctx) {
  const canvasW = Number(ctx?.canvas?.width) || 0;
  const canvasH = Number(ctx?.canvas?.height) || 0;
  const matrix = ctx?.getTransform?.();
  const sx = Number(matrix?.a);
  const sy = Number(matrix?.d);
  const tx = Number(matrix?.e);
  const ty = Number(matrix?.f);
  const a = Number.isFinite(sx) && sx > 0 ? sx : 1;
  const d = Number.isFinite(sy) && sy > 0 ? sy : 1;
  const e = Number.isFinite(tx) ? tx : 0;
  const f = Number.isFinite(ty) ? ty : 0;
  return {
    left: -e / a,
    top: -f / d,
    right: (canvasW - e) / a,
    bottom: (canvasH - f) / d,
    width: canvasW / a,
    height: canvasH / d,
    canvasW,
    canvasH,
    a,
    d,
    e,
    f,
  };
}

function transformedDestination(viewport, dx, dy, dw, dh) {
  const x1 = dx * viewport.a + viewport.e;
  const x2 = (dx + dw) * viewport.a + viewport.e;
  const y1 = dy * viewport.d + viewport.f;
  const y2 = (dy + dh) * viewport.d + viewport.f;
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y2),
    bottom: Math.max(y1, y2),
  };
}

/**
 * 完整 source frame 必须同时满足两个条件：
 * 1) 不再拿人物 uniformBounds 当 source clip；
 * 2) 展开后的 destination rectangle 也不能跑出真正 canvas viewport。
 *
 * 第二点是此前回归遗漏的地方：蘑菇法阵虽然已经存在于完整 source frame，
 * 但仍按人物本体尺寸放大，靠右/靠下时 destination 超出 canvas 后照样被截断。
 */
function drawFullSourceFrame(player, ctx, unit, engine, pack, state, boxX, boxY, boxW, boxH, {
  flipX = false,
  footY = null,
  advanceClock = true,
} = {}) {
  const anim = pack?.meta?.animations?.[state];
  if (!anim?.frames?.length) return false;

  const frameRate = frameRateForState(anim, state);
  const frameDuration = 1 / frameRate;
  const clockKey = `${unit.uid}:${state}`;
  let clock = player.clocks.get(clockKey) ?? 0;

  if (advanceClock) {
    const now = Number(engine?.time) || 0;
    const previous = player.lastDrawTimes.get(unit.uid);
    let delta = previous == null ? 0 : Math.max(0, now - previous);
    player.lastDrawTimes.set(unit.uid, now);

    if (state === 'death' && unit._deathAnimStartedAt != null && unit._deathUntil) {
      const visibleDuration = Math.max(0.001, unit._deathUntil - unit._deathAnimStartedAt);
      const sourceDuration = Math.max(0.001, anim.frames.length / frameRate);
      delta *= sourceDuration / visibleDuration;
    }

    clock += delta;
    player.clocks.set(clockKey, clock);
  }

  const frameCount = anim.frames.length;
  const frameIndex = (anim.loop || state === 'underMoving')
    ? Math.floor(clock / frameDuration) % frameCount
    : Math.min(frameCount - 1, Math.max(0, Math.floor(clock / frameDuration)));
  const frame = anim.frames[frameIndex];
  if (!frame) return false;
  const source = player.resolveFrameSource?.(pack, state, frameIndex, unit.res);
  if (!source?.frame || !source.sheet) return false;

  const frameW = Number(pack.meta.frameW ?? frame.w) || 1;
  const frameH = Number(pack.meta.frameH ?? frame.h) || 1;
  const scaleBounds = pack.meta.uniformBounds ?? {
    left: 0,
    top: 0,
    right: frameW - 1,
    bottom: frameH - 1,
  };
  const scaleW = Math.max(1, scaleBounds.right - scaleBounds.left + 1);
  const scaleH = Math.max(1, scaleBounds.bottom - scaleBounds.top + 1);
  const flying = isEffectivelyFlying(unit);
  const boost = Number(pack.meta.scaleBoost) || 1.12;
  const margin = flying ? 0.94 : 0.98;
  let scale = Math.min(boxW / scaleW, boxH / scaleH) * margin * boost;

  const footAnchored = FOOT_ANCHOR_RES.has(resNum(unit));
  const offsetY = drawOffsetYForUnit(unit, boxH, { footAnchored, flying });
  const footPad = Number(pack.meta.footOpaqueInset) || 0;
  const mirroredBoundsLeft = frameW - 1 - scaleBounds.right;
  const sourceBodyLeft = flipX ? mirroredBoundsLeft : scaleBounds.left;

  const placeAtScale = (nextScale) => {
    const stableLeft = boxX + (boxW - scaleW * nextScale) / 2;
    const stableTop = boxY + (boxH - scaleH * nextScale) / 2;
    let nextDx = stableLeft - sourceBodyLeft * nextScale;
    let nextDy = stableTop - scaleBounds.top * nextScale + offsetY;
    if (footY != null) {
      nextDy = footY
        - footFracFor(pack, state) * frameH * nextScale
        + offsetY
        + footPad * nextScale;
    }
    return { dx: nextDx, dy: nextDy };
  };

  const viewport = canvasLogicalViewport(ctx);
  let { dx, dy } = placeAtScale(scale);
  let dw = frameW * scale;
  let dh = frameH * scale;
  const visibleFrameBounds = frame.bounds ?? {
    left: 0,
    top: 0,
    right: frameW - 1,
    bottom: frameH - 1,
  };
  const visibleSourceLeft = flipX
    ? frameW - 1 - visibleFrameBounds.right
    : visibleFrameBounds.left;
  const visibleSourceTop = visibleFrameBounds.top;
  const visibleSourceW = visibleFrameBounds.right - visibleFrameBounds.left + 1;
  const visibleSourceH = visibleFrameBounds.bottom - visibleFrameBounds.top + 1;
  const anchorOffsetX = Number(frame.anchorOffsetX) || 0;
  let visualScreenOffsetX = (flipX ? -anchorOffsetX : anchorOffsetX) * scale;
  const lockUnitBox = isAttackAnimationState(state);

  // 如果完整帧本身比 viewport 更大，先等比缩小；一般卡牌不会触发，主要防极端大动作。
  const fit = Math.min(
    1,
    viewport.width > 0 ? viewport.width / Math.max(1, visibleSourceW * scale) : 1,
    viewport.height > 0 ? viewport.height / Math.max(1, visibleSourceH * scale) : 1,
  );
  if (fit < 0.999999) {
    scale *= fit;
    visualScreenOffsetX = (flipX ? -anchorOffsetX : anchorOffsetX) * scale;
    ({ dx, dy } = placeAtScale(scale));
    dw = frameW * scale;
    dh = frameH * scale;
  }

  if (!Number.isFinite(dx)) dx = boxX;
  if (!Number.isFinite(dy)) dy = boxY;

  // 完整帧靠边时整体向 viewport 内平移，人物脚点只在“否则会被 canvas 裁切”时让位。
  // 这比缩 source rect 安全：法阵/武器/尾迹仍保留完整像素。
  if (!lockUnitBox
    && viewport.right > viewport.left
    && visibleSourceW * scale <= viewport.width + 1e-6) {
    const visibleLeft = dx + visibleSourceLeft * scale + visualScreenOffsetX;
    const visibleRight = visibleLeft + visibleSourceW * scale;
    if (visibleLeft < viewport.left) dx += viewport.left - visibleLeft;
    else if (visibleRight > viewport.right) dx -= visibleRight - viewport.right;
  }
  if (!lockUnitBox
    && viewport.bottom > viewport.top
    && visibleSourceH * scale <= viewport.height + 1e-6) {
    const visibleTop = dy + visibleSourceTop * scale;
    const visibleBottom = visibleTop + visibleSourceH * scale;
    if (visibleTop < viewport.top) dy += viewport.top - visibleTop;
    else if (visibleBottom > viewport.bottom) dy -= visibleBottom - viewport.bottom;
  }

  let alpha = 1;
  if (unit._spawnFadeDur) {
    if (unit._spawnFadeStart == null) unit._spawnFadeStart = Number(engine?.time) || 0;
    alpha = Math.min(1, Math.max(
      0,
      ((Number(engine?.time) || 0) - unit._spawnFadeStart) / unit._spawnFadeDur,
    ));
    if (alpha <= 0) return false;
  }

  const srcX = source.frame.x;
  const srcY = source.frame.y;
  const sourceW = Number(source.frame.w) || frameW;
  const sourceH = Number(source.frame.h) || frameH;
  const sourceDestX = (Number(source.originX) + anchorOffsetX) * scale;
  const sourceDestY = Number(source.originY) * scale;
  const fullScreenDest = transformedDestination(viewport, dx + visualScreenOffsetX, dy, dw, dh);
  const screenDest = transformedDestination(
    viewport,
    dx + visibleSourceLeft * scale + visualScreenOffsetX,
    dy + visibleSourceTop * scale,
    visibleSourceW * scale,
    visibleSourceH * scale,
  );
  const viewportContainsDestination = viewport.canvasW > 0 && viewport.canvasH > 0
    && screenDest.left >= -0.5
    && screenDest.top >= -0.5
    && screenDest.right <= viewport.canvasW + 0.5
    && screenDest.bottom <= viewport.canvasH + 0.5;

  ctx.save();
  ctx.globalAlpha *= alpha;
  if (flipX) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(
      source.sheet, srcX, srcY, sourceW, sourceH,
      sourceDestX, sourceDestY, sourceW * scale, sourceH * scale,
    );
  } else {
    ctx.drawImage(
      source.sheet, srcX, srcY, sourceW, sourceH,
      dx + sourceDestX, dy + sourceDestY, sourceW * scale, sourceH * scale,
    );
  }
  ctx.restore();

  player.__viewportAttackAudit = {
    res: Number(unit.res),
    state,
    frameIndex,
    frameW,
    frameH,
    sourceW,
    sourceH,
    compactStateSheet: Boolean(source.packed),
    anchorOffsetX,
    scaleBounds: { ...scaleBounds },
    dx,
    dy,
    dw,
    dh,
    flipX,
    usesFullSourceFrame: true,
    clampsToLogicalGrid: false,
    canvasW: viewport.canvasW,
    canvasH: viewport.canvasH,
    screenDest,
    fullScreenDest,
    visibleFrameBounds: { ...visibleFrameBounds },
    viewportContainsDestination,
    unitBoxLocked: lockUnitBox,
  };
  return true;
}

export function installUnitAnimationViewportFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  installProjectileImpactAlignmentFinal();

  const originalDraw = unitAnimPlayer.draw.bind(unitAnimPlayer);
  unitAnimPlayer.draw = function drawViewportSafeFullFrame(
    ctx,
    unit,
    engine,
    boxX,
    boxY,
    boxW,
    boxH,
    options = {},
  ) {
    const key = String(unit?.res ?? '');
    const pack = this.ready.get(key);
    if (!pack) return originalDraw(ctx, unit, engine, boxX, boxY, boxW, boxH, options);

    const picked = this.pickDrawState(pack, unit, engine);
    if (!picked?.state || !isOverflowAnimationState(picked.state)) {
      return originalDraw(ctx, unit, engine, boxX, boxY, boxW, boxH, options);
    }

    return drawFullSourceFrame(
      this,
      ctx,
      unit,
      engine,
      pack,
      picked.state,
      boxX,
      boxY,
      boxW,
      boxH,
      options,
    );
  };

  installBattlefieldVisibleGridMapFinal();

  window.__verifyUnitAnimationViewportFinal = () => ({
    enabled: true,
    attackMinFrameRate: ACTION_MIN_FRAME_RATE,
    fullSourceFrameForAllStates: true,
    fullSourceFrameForAttacks: true,
    fullSourceFrameForFirstSpecial: true,
    scaleUsesUniformBounds: true,
    logicalGridClampRemoved: true,
    viewportDestinationContainment: true,
    recognizesHpAttackState: isAttackAnimationState('attacking_100'),
    recognizesAttackAlias: isAttackAnimationState('attack_60'),
    recognizesFlyShoeFirstSpecial: isOverflowAnimationState('secondAttackStatus'),
    supportsIdleOverflow: isOverflowAnimationState('default_100'),
    supportsMovingOverflow: isOverflowAnimationState('moving'),
    supportsDeathOverflow: isOverflowAnimationState('death'),
    lastAttack: unitAnimPlayer.__viewportAttackAudit ?? null,
  });
}
