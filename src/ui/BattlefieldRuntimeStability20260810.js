import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { getProjectileArcHeight } from '../battle/Projectile.js';
import { projectileVisualSize } from '../battle/ProjectileVisualSize.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';
import { installBattlefieldVisibleGridMapFinal } from './BattlefieldVisibleGridMapFinal.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldRuntimeStability20260810');
const GRID_PATCH_FLAG = Symbol.for('clbwzzz.battlefieldVisibleGridMapFinal');
const CACTUS_BULLET_RES = new Set([4, 25]);
const BLIZZARD_BLUE_BODY_FILTER = 'grayscale(0.55) sepia(0.9) saturate(5.4) hue-rotate(166deg) brightness(0.88) contrast(1.08)';

const STATUS_PALETTE = Object.freeze({
  frozen: Object.freeze({ body: '#2477dc', rim: '#d8f5ff' }),
  slowed: Object.freeze({ body: '#2477dc', rim: '#ccefff' }),
  poisoned: Object.freeze({ body: '#66743a', accent: '#89904b' }),
  burning: Object.freeze({ body: '#a94e2e', accent: '#ff9a51' }),
});

const PARABOLA_MUZZLES = new Map([
  // 南瓜投手 / 寒冰椰子 / 极寒椰子 / 强制高抛类：按攻击抬臂姿势把发射点提到人物上部。
  [9, { x: 0.24, y: 0.22 }],
  [17, { x: 0.25, y: 0.20 }],
  [54, { x: 0.25, y: 0.20 }],
  [72, { x: 0.24, y: 0.21 }],
]);

const STRAIGHT_MUZZLES = new Map([
  [14, { x: 0.29, y: 0.43 }],
  [91, { x: 0.31, y: 0.42 }],
]);
const POISON_DOT_KINDS = new Set(['poison', 'curse']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activeDotKinds(unit, now) {
  return (Array.isArray(unit?.dots) ? unit.dots : [])
    .filter((dot) => finite(dot?.until, -Infinity) > now)
    .map((dot) => String(dot?.kind ?? ''));
}

function statusVisual(unit, engine) {
  const now = finite(engine?.time);
  if (unit?.frozenUntil && now < unit.frozenUntil) return 'frozen';
  const dots = activeDotKinds(unit, now);
  if (dots.some((kind) => POISON_DOT_KINDS.has(kind))) return 'poisoned';
  if (dots.includes('burn')) return 'burning';
  if (unit?.slowedUntil && now < unit.slowedUntil) return 'slowed';
  return null;
}

function statusFilter(kind) {
  // 单位只绘制一次：直接在真实 drawImage 上做色彩变换，避免旧实现为了染色
  // 再把整个大动画包重画到 offscreen canvas，蘑菇/飞鞋等大动作会明显增加 fill-rate。
  if (kind === 'frozen' || kind === 'slowed') {
    // 普通减速与暴风雪命中后的身体蓝色蒙版完全一致；脚下冰晶/风环仍用于区分状态。
    return BLIZZARD_BLUE_BODY_FILTER;
  }
  if (kind === 'poisoned') {
    return 'grayscale(0.48) sepia(0.92) saturate(2.25) hue-rotate(36deg) brightness(0.78) contrast(1.04)';
  }
  if (kind === 'burning') {
    return 'sepia(0.52) saturate(2.1) hue-rotate(334deg) brightness(0.9)';
  }
  return 'none';
}

function drawSmallIceAccent(renderer, ctx, unit, engine, layout) {
  const { cx, footY, circleSize } = layout;
  const now = finite(engine?.time);
  const size = circleSize * 1.42;
  renderer.drawGlobalFxPack?.(ctx, 'freeze', cx, footY - circleSize * 0.42, size, now);

  ctx.save();
  ctx.strokeStyle = STATUS_PALETTE.frozen.rim;
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = 2;
  for (let index = -2; index <= 2; index += 1) {
    const x = cx + index * circleSize * 0.16;
    const bottom = footY - circleSize * 0.03;
    const top = bottom - circleSize * (0.22 + (Math.abs(index) % 2) * 0.08);
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x - circleSize * 0.045, top + circleSize * 0.06);
    ctx.lineTo(x, top);
    ctx.lineTo(x + circleSize * 0.045, top + circleSize * 0.06);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSmallPoisonAccent(ctx, layout, phase) {
  const { cx, footY, circleSize } = layout;
  ctx.save();
  ctx.fillStyle = STATUS_PALETTE.poisoned.accent;
  const puffs = [
    [-0.20, -0.12, 0.075],
    [0.02, -0.23, 0.09],
    [0.22, -0.11, 0.07],
  ];
  for (let i = 0; i < puffs.length; i += 1) {
    const [ox, oy, scale] = puffs[i];
    const drift = Math.sin(phase * 2.6 + i * 1.3) * circleSize * 0.025;
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    ctx.arc(
      cx + ox * circleSize + drift,
      footY + oy * circleSize,
      circleSize * scale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawSmallBurnAccent(ctx, layout, phase) {
  const { cx, footY, circleSize } = layout;
  ctx.save();
  ctx.strokeStyle = STATUS_PALETTE.burning.accent;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = 1.7;
  const pulse = 0.85 + Math.sin(phase * 7) * 0.1;
  for (const offset of [-0.14, 0.14]) {
    const x = cx + offset * circleSize;
    const y = footY - circleSize * 0.16;
    ctx.beginPath();
    ctx.ellipse(x, y, circleSize * 0.07 * pulse, circleSize * 0.14 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSmallSlowAccent(ctx, layout, now = 0) {
  const { cx, footY, circleSize } = layout;
  const y = footY - circleSize * 0.15;
  const phase = now * 2.7;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = 'rgb(74,174,217)';
  ctx.beginPath();
  ctx.ellipse(cx, y, circleSize * 0.40, circleSize * 0.125, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.78;
  ctx.strokeStyle = STATUS_PALETTE.slowed.rim;
  ctx.lineWidth = 1.7;
  for (let index = 0; index < 3; index += 1) {
    const start = phase + index * Math.PI * 2 / 3;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      y,
      circleSize * (0.34 + index * 0.025),
      circleSize * (0.085 + index * 0.012),
      0,
      start,
      start + Math.PI * 0.72,
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 0.66;
  for (const offset of [-0.18, 0, 0.18]) {
    const drift = Math.sin(phase + offset * 8) * circleSize * 0.025;
    const x = cx + offset * circleSize + drift;
    ctx.beginPath();
    ctx.moveTo(x - circleSize * 0.04, y - circleSize * 0.08);
    ctx.lineTo(x, y - circleSize * 0.02);
    ctx.lineTo(x + circleSize * 0.04, y - circleSize * 0.08);
    ctx.stroke();
  }
  ctx.restore();

  return { centerX: cx, centerY: y, footY, color: STATUS_PALETTE.slowed.rim };
}

function projectileMuzzle(unit, layout, projectile) {
  const direction = unit?.team === 'enemy' ? -1 : 1;
  const res = Number(unit?.res ?? projectile?.sourceRes);
  const parabola = projectile?.trajectory === 'parabola';
  const profile = parabola
    ? (PARABOLA_MUZZLES.get(res) ?? { x: 0.24, y: 0.23 })
    : (STRAIGHT_MUZZLES.get(res) ?? { x: 0.27, y: 0.47 });
  return {
    x: layout.cx + direction * layout.portraitW * profile.x,
    y: layout.portraitY + layout.portraitH * profile.y,
  };
}

function stableProjectileState(projectile) {
  const direction = projectile?.owner === 'enemy' ? -1 : 1;
  const id = projectile?.id;
  if (projectile.__stableVisualId !== id) {
    projectile.__stableVisualId = id;
    projectile.__stableVisualX = finite(projectile.x, projectile.startCol);
    projectile.__stableVisualProgress = clamp(finite(projectile.progress), 0, 1);
  }

  const candidateX = finite(projectile.x, projectile.__stableVisualX);
  projectile.__stableVisualX = direction > 0
    ? Math.max(projectile.__stableVisualX, candidateX)
    : Math.min(projectile.__stableVisualX, candidateX);
  projectile.__stableVisualProgress = Math.max(
    projectile.__stableVisualProgress,
    clamp(finite(projectile.progress), 0, 1),
  );

  return {
    x: projectile.__stableVisualX,
    progress: projectile.__stableVisualProgress,
  };
}

function drawProjectileSprite(renderer, ctx, projectile, point, target) {
  if (projectile.sourceRes != null) {
    const pack = renderer.bulletAnims.get(String(projectile.sourceRes));
    if (pack?.meta?.animations?.yidong) {
      renderer.drawBulletAnimFrame(
        ctx,
        pack,
        'yidong',
        point.x,
        point.y,
        projectileVisualSize(projectile, true),
        projectile.flightT ?? 0,
        projectile.owner === 'enemy',
      );
      return projectileVisualSize(projectile, true);
    }
    void renderer.requestBulletAnim(projectile.sourceRes);
  }

  const image = (projectile.sourceRes != null
    ? renderer.bulletCache.get(String(projectile.sourceRes))
    : null) ?? renderer.bulletCache.get('default');
  const size = projectileVisualSize(projectile, false);
  if (image) {
    const bulletRes = projectile.sourceRes != null ? Number(projectile.sourceRes) : null;
    const angle = bulletRes != null
      && CACTUS_BULLET_RES.has(bulletRes)
      && projectile.trajectory === 'straight'
      ? (projectile.owner === 'player' ? 0 : Math.PI)
      : Math.atan2(target.y - point.source.y, target.x - point.source.x);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(Number.isFinite(angle) ? angle : 0);
    SpriteAtlas.draw(ctx, image, -size / 2, -size / 2, size, size);
    ctx.restore();
    return size;
  }

  ctx.save();
  ctx.fillStyle = projectile.color ?? '#fff';
  ctx.beginPath();
  ctx.arc(point.x, point.y, Number(projectile?.sourceRes) === 118 ? 12 : 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return Number(projectile?.sourceRes) === 118 ? 24 : 14;
}

function impactPackIsSafe(pack, margin = 3) {
  const meta = pack?.meta;
  const anim = meta?.animations?.baoza;
  if (!anim?.frames?.length) return false;
  const maxX = finite(meta.frameW) - 1;
  const maxY = finite(meta.frameH) - 1;
  return anim.frames.every((frame) => {
    const bounds = frame?.bounds;
    return !bounds || (
      bounds.left > margin
      && bounds.top > margin
      && bounds.right < maxX - margin
      && bounds.bottom < maxY - margin
    );
  });
}

function drawFallbackImpact(ctx, x, y, cellW, t) {
  const progress = clamp(finite(t) / 0.32, 0, 1);
  if (progress >= 1) return;
  ctx.save();
  ctx.globalAlpha = 0.82 * (1 - progress);
  ctx.strokeStyle = '#f6e3a4';
  ctx.lineWidth = Math.max(2, cellW * 0.045);
  ctx.beginPath();
  ctx.arc(x, y, cellW * (0.16 + progress * 0.34), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function installFinalRenderer() {
  // VisibleGridMap 早期曾被 UnitAnimationViewportFinal 间接安装，随后又被旧的
  // RuntimeCoordinate/SkillPosition/ImpactSafety 覆盖。这里在 main 的同步 installer
  // 全结束后重新落地一次，使“屏幕上真实 12x5 格”重新成为最终坐标来源。
  delete globalThis[GRID_PATCH_FLAG];
  installBattlefieldVisibleGridMapFinal();

  const originalUnitSprite = BattleRenderer.prototype.drawUnitSprite;
  const originalSkillFx = BattleRenderer.prototype.drawSkillFx;

  //明确要求移除品质绿圈：不再绘制任何常驻品质光圈/qualityLightCircle。
  BattleRenderer.prototype.drawUnitHalo = function drawNoPersistentQualityHalo() {
    this._runtimeStabilityHaloSuppressed = true;
  };

  // 状态着色只经过一次单位 sprite draw，不再二次重画动画到 offscreen canvas。
  BattleRenderer.prototype.drawUnitSprite = function drawUnitSpriteWithStatusTint(ctx, engine, unit, layout, options) {
    const kind = statusVisual(unit, engine);
    if (!kind || !('filter' in ctx)) {
      return originalUnitSprite.call(this, ctx, engine, unit, layout, options);
    }
    ctx.save();
    try {
      ctx.filter = statusFilter(kind);
      return originalUnitSprite.call(this, ctx, engine, unit, layout, options);
    } finally {
      ctx.restore();
    }
  };

  BattleRenderer.prototype.drawStatusEffects = function drawStatusEffectsWithoutSecondUnitPass(ctx, unit, engine, layout) {
    const now = finite(engine?.time);
    const frozen = Boolean(unit?.frozenUntil && now < unit.frozenUntil);
    const slowed = Boolean(unit?.slowedUntil && now < unit.slowedUntil);
    const stunned = Boolean(unit?.stunnedUntil && now < unit.stunnedUntil);
    const dots = activeDotKinds(unit, now);
    const poisoned = dots.some((kind) => POISON_DOT_KINDS.has(kind));
    const burning = dots.includes('burn');

    if (frozen) drawSmallIceAccent(this, ctx, unit, engine, layout);
    const slowAccent = !frozen && slowed ? drawSmallSlowAccent(ctx, layout, now) : null;
    if (poisoned) drawSmallPoisonAccent(ctx, layout, now);
    if (burning) drawSmallBurnAccent(ctx, layout, now);
    if (stunned) {
      this.drawGlobalFxPack?.(ctx, 'vertigo', layout.cx, layout.cellTop + 8, layout.circleSize * 1.55, now);
    }

    this._runtimeStabilityStatusAudit = {
      frozen,
      slowed,
      poisoned,
      burning,
      stunned,
      slowAccent,
      slowedBodyFilter: slowed ? statusFilter('slowed') : null,
      singleSpritePass: true,
      offscreenUnitRedraw: false,
      palette: STATUS_PALETTE,
    };
  };

  BattleRenderer.prototype.drawDeployEffects = function drawNeutralDeployPulse(ctx, engine) {
    const cellW = this.battleGridCellWidth?.() ?? 78;
    const cellH = this.battleGridCellHeight?.() ?? 78;
    for (const fx of engine?.deployEffects ?? []) {
      const x = this.battleGridX?.(fx.col);
      const y = this.battleGridY?.(fx.lane);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const maxLife = Math.max(0.001, finite(fx.maxLife, 0.28));
      const progress = clamp(1 - finite(fx.life) / maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.42 * (1 - progress);
      ctx.strokeStyle = '#dff8ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + cellH * 0.28,
        cellW * (0.12 + progress * 0.16),
        cellH * (0.035 + progress * 0.055),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  };

  BattleRenderer.prototype.drawProjectiles = function drawStableHighArcProjectiles(ctx, engine) {
    this._runtimeStabilityProjectileAudit = [];
    for (const projectile of engine?.projectiles ?? []) {
      if (!projectile?.launched) continue;
      const visual = stableProjectileState(projectile);
      const sourceUnit = engine?.units?.find?.((unit) => unit.uid === projectile.sourceUid);
      const sourceLayout = sourceUnit ? this.computeUnitLayout(engine, sourceUnit) : null;
      const source = sourceLayout
        ? projectileMuzzle(sourceUnit, sourceLayout, projectile)
        : {
            x: this.battleGridX?.(projectile.startCol),
            y: this.battleGridY?.(projectile.lane),
          };
      const gridStart = {
        x: this.battleGridX?.(projectile.startCol),
        y: this.battleGridY?.(projectile.lane),
      };
      const target = {
        x: this.battleGridX?.(projectile.hitCol),
        y: this.battleGridY?.(projectile.hitLane),
      };
      if (![source.x, source.y, gridStart.x, gridStart.y, target.x, target.y].every(Number.isFinite)) continue;

      const arcHeight = projectile.trajectory === 'parabola'
        ? (finite(projectile._arcHeight) > 0
            ? finite(projectile._arcHeight)
            : getProjectileArcHeight(projectile.startCol, projectile.hitCol))
        : 0;
      const arcOffset = projectile.trajectory === 'parabola'
        ? Math.sin(visual.progress * Math.PI) * arcHeight
        : finite(projectile.arcOffset);
      const currentX = this.battleGridX?.(visual.x);
      const currentY = this.battleGridY?.(finite(projectile.y, projectile.lane), arcOffset);
      if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) continue;

      // progress=0 精确落在抬臂/武器发射点；随后平滑脱离人物进入高抛轨迹。
      const point = {
        x: currentX + (source.x - gridStart.x) * (1 - visual.progress),
        y: currentY + (source.y - gridStart.y) * (1 - visual.progress),
        source,
      };
      const drawSize = drawProjectileSprite(this, ctx, projectile, point, target);
      this._runtimeStabilityProjectileAudit.push({
        id: projectile.id,
        sourceRes: Number(projectile.sourceRes),
        trajectory: projectile.trajectory,
        progress: visual.progress,
        rawX: finite(projectile.x),
        stableX: visual.x,
        arcHeight,
        arcOffset,
        drawX: point.x,
        drawY: point.y,
        muzzleX: source.x,
        muzzleY: source.y,
        drawSize,
      });
    }
  };

  BattleRenderer.prototype.drawImpactFx = function drawNativeSpeedImpacts(ctx, engine) {
    const cellW = this.battleGridCellWidth?.() ?? 78;
    for (const fx of engine?.impactFx ?? []) {
      const x = this.battleGridX?.(fx.col);
      const y = this.battleGridY?.(clamp(Math.round(finite(fx.lane)), 0, 4));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      let drawn = false;
      if (fx.res != null) {
        const pack = this.bulletAnims.get(String(fx.res));
        if (impactPackIsSafe(pack)) {
          const anim = pack.meta.animations.baoza;
          const rate = Math.max(1, finite(anim.frameRate, 12));
          const duration = Math.max(0.001, finite(anim.duration, anim.frames.length / rate));
          const elapsed = Math.max(0, finite(fx.t));
          const alpha = elapsed <= duration
            ? 1
            : Math.max(0, 1 - (elapsed - duration) / 0.10);
          if (alpha > 0.01) {
            // 旧实现 slow=0.55 会把 12fps 再降到约 6.6fps，肉眼明显卡顿。
            this.drawBulletAnimFrame(
              ctx,
              pack,
              'baoza',
              x,
              y,
              cellW * (Number(fx.res) === 54 ? 2.4 : 1.05),
              elapsed,
              false,
              alpha,
              false,
              1.0,
            );
          }
          drawn = true;
        } else if (!pack) {
          void this.requestBulletAnim(fx.res);
        }
      }
      if (!drawn) drawFallbackImpact(ctx, x, y, cellW, fx.t);
    }
  };


  // 旧代码又额外塞了一份 fullScreen mushroom_bubble，既重复又造成全屏 overdraw/大圈残留。
  BattleRenderer.prototype.drawSkillFx = function drawSkillsWithoutDuplicateMushroomBubble(ctx, engine) {
    const list = engine?.skillFx ?? engine?.skillEffects ?? [];
    const filtered = list.filter((fx) => fx?.kind !== 'mushroom_bubble');
    if (filtered.length === list.length) return originalSkillFx.call(this, ctx, engine);
    const oldSkillFx = engine.skillFx;
    const oldSkillEffects = engine.skillEffects;
    try {
      engine.skillFx = filtered;
      engine.skillEffects = filtered;
      return originalSkillFx.call(this, ctx, engine);
    } finally {
      engine.skillFx = oldSkillFx;
      engine.skillEffects = oldSkillEffects;
    }
  };
}

export function installBattlefieldRuntimeStability20260810() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  installFinalRenderer();

  const originalPushDeployEffect = BattleEngine.prototype.pushDeployEffect;
  BattleEngine.prototype.pushDeployEffect = function pushShortNeutralDeployEffect(...args) {
    const before = this.deployEffects?.length ?? 0;
    const result = originalPushDeployEffect.call(this, ...args);
    const fx = this.deployEffects?.[before];
    if (fx) {
      fx.life = Math.min(finite(fx.life, 0.28), 0.28);
      fx.maxLife = 0.28;
    }
    return result;
  };

  const originalSpawnImpactFx = BattleEngine.prototype.spawnImpactFx;
  BattleEngine.prototype.spawnImpactFx = function spawnShortImpactFx(...args) {
    const before = this.impactFx?.length ?? 0;
    const result = originalSpawnImpactFx.call(this, ...args);
    const fx = this.impactFx?.[before];
    if (fx) fx.life = Math.min(finite(fx.life, 1.1), 1.1);
    return result;
  };

  globalThis.__verifyBattlefieldRuntimeStability20260810 = () => {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView
      ?? globalThis.__activeBattleWorldView
      ?? globalThis.__pvpFixtureBattle;
    return {
      enabled: true,
      persistentQualityHaloRemoved: true,
      duplicateMushroomBubbleRemoved: true,
      statusUsesSingleSpritePass: true,
      statusOffscreenUnitRedraw: false,
      projectileMonotonicVisualX: true,
      parabolaLaunchUsesRaisedMuzzle: true,
      impactPlaybackRate: 1,
      visibleGridReinstalledLast: Boolean(view?.renderer?.battleVisualGrid),
      status: view?.renderer?._runtimeStabilityStatusAudit ?? null,
      projectiles: view?.renderer?._runtimeStabilityProjectileAudit ?? [],
    };
  };
}

export function scheduleBattlefieldRuntimeStability20260810() {
  queueMicrotask(() => installBattlefieldRuntimeStability20260810());
}
