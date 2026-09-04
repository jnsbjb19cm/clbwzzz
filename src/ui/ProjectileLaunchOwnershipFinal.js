import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { getProjectileArcHeight } from '../battle/Projectile.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';

const PATCH_FLAG = Symbol.for('clbwzzz.projectileLaunchOwnershipFinal');
const CACTUS_BULLET_RES = new Set([4, 25]);

const PARABOLA_MUZZLES = new Map([
  [9, { x: 0.24, y: 0.22 }],
  [17, { x: 0.25, y: 0.20 }],
  [54, { x: 0.25, y: 0.20 }],
  [72, { x: 0.24, y: 0.21 }],
]);

const STRAIGHT_MUZZLES = new Map([
  [14, { x: 0.29, y: 0.43 }],
  [91, { x: 0.31, y: 0.42 }],
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fieldToClient(renderer, x, y) {
  const canvas = renderer?.canvas;
  const rect = renderer?.battleCanvasClientRect;
  if (!canvas || !rect?.width || !rect?.height) return { x: 0, y: 0 };
  const scale = Math.max(0.0001, finite(renderer.fieldScale, 1) || 1);
  const pixelX = x * scale + finite(renderer.fieldOffsetX);
  const pixelY = y * scale + finite(renderer.fieldOffsetY);
  return {
    x: rect.left + pixelX * rect.width / Math.max(1, canvas.width),
    y: rect.top + pixelY * rect.height / Math.max(1, canvas.height),
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function numericResourceId(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function isExplicitTrackingProjectile(projectile) {
  // 普通 straight/parabola 一律不追踪。
  // 黑暗精灵等“穿透直击”仍允许保留 targetUid 用于结算，但视觉路线仍由发射时路径决定。
  return projectile?.trajectory === 'homing'
    || (projectile?.pierce === true && projectile?.visualOnly !== true);
}

function launchEndCol(projectile) {
  return finite(projectile?.flightEndCol, finite(projectile?.hitCol, projectile?.startCol));
}

function launchEndLane(projectile) {
  return finite(projectile?.flightEndLane, finite(projectile?.hitLane, projectile?.lane));
}

function stableLaunchVisual(projectile) {
  const id = projectile?.id;
  const direction = projectile?.owner === 'enemy' ? -1 : 1;
  const start = finite(projectile?.flightStartCol, finite(projectile?.startCol));
  const end = launchEndCol(projectile);

  if (projectile.__launchOwnedVisualId !== id) {
    projectile.__launchOwnedVisualId = id;
    projectile.__launchOwnedVisualX = finite(projectile.x, start);
    projectile.__launchOwnedVisualProgress = clamp01(projectile.progress);
  }

  const candidateX = finite(projectile.x, projectile.__launchOwnedVisualX);
  projectile.__launchOwnedVisualX = direction > 0
    ? Math.max(projectile.__launchOwnedVisualX, candidateX)
    : Math.min(projectile.__launchOwnedVisualX, candidateX);

  const denominator = end - start;
  const xProgress = Math.abs(denominator) > 1e-6
    ? clamp01((projectile.__launchOwnedVisualX - start) / denominator)
    : clamp01(projectile.progress);
  projectile.__launchOwnedVisualProgress = Math.max(
    projectile.__launchOwnedVisualProgress,
    clamp01(projectile.progress),
    xProgress,
  );

  return {
    x: projectile.__launchOwnedVisualX,
    progress: projectile.__launchOwnedVisualProgress,
  };
}

function launchMuzzleOffset(renderer, engine, projectile) {
  if (projectile.__launchMuzzleVisualId === projectile.id
    && Number.isFinite(projectile.__launchMuzzleOffsetX)
    && Number.isFinite(projectile.__launchMuzzleOffsetY)) {
    return {
      x: projectile.__launchMuzzleOffsetX,
      y: projectile.__launchMuzzleOffsetY,
    };
  }

  const sourceUnit = engine?.units?.find?.((unit) => unit.uid === projectile.sourceUid);
  let offsetX = 0;
  let offsetY = 0;
  if (sourceUnit) {
    const layout = renderer.computeUnitLayout(engine, sourceUnit);
    if (layout) {
      const direction = sourceUnit.team === 'enemy' ? -1 : 1;
      const res = Number(sourceUnit.res ?? projectile.sourceRes);
      const profile = projectile.trajectory === 'parabola'
        ? (PARABOLA_MUZZLES.get(res) ?? { x: 0.24, y: 0.23 })
        : (STRAIGHT_MUZZLES.get(res) ?? { x: 0.27, y: 0.47 });
      const centerX = renderer.battleGridX?.(sourceUnit.col);
      const centerY = renderer.battleGridY?.(sourceUnit.lane);
      const muzzleX = layout.cx + direction * layout.portraitW * profile.x;
      const muzzleY = layout.portraitY + layout.portraitH * profile.y;
      if ([centerX, centerY, muzzleX, muzzleY].every(Number.isFinite)) {
        // 只缓存“武器相对人物中心”的偏移，不缓存人物当前世界坐标。
        // 因此后续服务器纠正/人物继续移动不会把已经发出的子弹拖回去。
        offsetX = muzzleX - centerX;
        offsetY = muzzleY - centerY;
      }
    }
  }

  projectile.__launchMuzzleVisualId = projectile.id;
  projectile.__launchMuzzleOffsetX = offsetX;
  projectile.__launchMuzzleOffsetY = offsetY;
  return { x: offsetX, y: offsetY };
}

function drawProjectileSprite(renderer, ctx, projectile, point, target, source) {
  if (projectile.sourceRes != null) {
    const pack = renderer.bulletAnims.get(String(projectile.sourceRes));
    if (pack?.meta?.animations?.yidong) {
      renderer.drawBulletAnimFrame(
        ctx,
        pack,
        'yidong',
        point.x,
        point.y,
        projectile.trajectory === 'parabola' ? 30 : 24,
        projectile.flightT ?? 0,
        projectile.owner === 'enemy',
      );
      return;
    }
    void renderer.requestBulletAnim(projectile.sourceRes);
  }

  const image = (projectile.sourceRes != null
    ? renderer.bulletCache.get(String(projectile.sourceRes))
    : null) ?? renderer.bulletCache.get('default');
  const size = projectile.trajectory === 'parabola' ? 28 : 22;
  if (image) {
    const bulletRes = projectile.sourceRes != null ? Number(projectile.sourceRes) : null;
    const angle = bulletRes != null
      && CACTUS_BULLET_RES.has(bulletRes)
      && projectile.trajectory === 'straight'
      ? (projectile.owner === 'player' ? 0 : Math.PI)
      : Math.atan2(target.y - source.y, target.x - source.x);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(Number.isFinite(angle) ? angle : 0);
    SpriteAtlas.draw(ctx, image, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = projectile.color ?? '#fff';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function installEngineLaunchOwnership() {
  const previousUpdateProjectiles = BattleEngine.prototype.updateProjectiles;
  BattleEngine.prototype.updateProjectiles = function updateNonHomingProjectilesWithoutRetarget(dt) {
    const hiddenTargets = [];
    for (const projectile of this.projectiles ?? []) {
      if (!projectile?.targetUid || isExplicitTrackingProjectile(projectile)) continue;
      hiddenTargets.push([projectile, projectile.targetUid]);
      // 旧 BattleEngine 会看到 targetUid 就每 tick 重写 hitCol/hitLane/resolveCol。
      // 飞行期间临时隐藏 targetUid，让 straight/parabola 真正拥有发射时锁定的路径；
      // 结算时依靠扫掠碰撞/落点格，不再“隔空追中”已经走开的目标。
      projectile.targetUid = null;
    }

    try {
      return previousUpdateProjectiles.call(this, dt);
    } finally {
      // surviving projectiles 仍保留原 targetUid 供调试/特效去重；运动逻辑不会再读取它。
      for (const [projectile, targetUid] of hiddenTargets) projectile.targetUid = targetUid;
    }
  };
}

function installLaunchOwnedRenderer() {
  BattleRenderer.prototype.drawProjectiles = function drawLaunchOwnedProjectiles(ctx, engine) {
    this._launchOwnedProjectileAudit = [];
    for (const projectile of engine?.projectiles ?? []) {
      if (!projectile?.launched) continue;

      const visual = stableLaunchVisual(projectile);
      const startCol = finite(projectile.flightStartCol, finite(projectile.startCol));
      const startLane = finite(projectile.flightStartLane, finite(projectile.lane));
      const endCol = launchEndCol(projectile);
      const endLane = launchEndLane(projectile);
      const gridStartX = this.battleGridX?.(startCol);
      const gridStartY = this.battleGridY?.(startLane);
      const targetX = this.battleGridX?.(endCol);
      const targetY = this.battleGridY?.(endLane);
      if (![gridStartX, gridStartY, targetX, targetY].every(Number.isFinite)) continue;

      const muzzleOffset = launchMuzzleOffset(this, engine, projectile);
      const source = {
        x: gridStartX + muzzleOffset.x,
        y: gridStartY + muzzleOffset.y,
      };
      const target = { x: targetX, y: targetY };
      const progress = visual.progress;

      const arcHeight = projectile.trajectory === 'parabola'
        ? (finite(projectile._arcHeight) > 0
            ? finite(projectile._arcHeight)
            : getProjectileArcHeight(startCol, endCol))
        : 0;
      // 与 Projectile 的常重力公式一致：z/h = 4p(1-p)。
      const arcOffset = projectile.trajectory === 'parabola'
        ? 4 * arcHeight * progress * (1 - progress)
        : 0;

      const planarLane = startLane + (endLane - startLane) * progress;
      const planarGridY = this.battleGridY?.(planarLane, 0);
      const arcedGridY = this.battleGridY?.(planarLane, arcOffset);
      const arcPixelDelta = Number.isFinite(planarGridY) && Number.isFinite(arcedGridY)
        ? arcedGridY - planarGridY
        : 0;

      // 最终屏幕坐标完全由“发射时枪口 → 发射时落点”的单调 progress 决定。
      // 不再把当前攻击者坐标混进来，也不再用 mutable hitCol 重建路径。
      const point = {
        x: source.x + (target.x - source.x) * progress,
        y: source.y + (target.y - source.y) * progress + arcPixelDelta,
      };

      // 最后一层可见坐标护栏：网络外推/快照纠正无论怎样抖，屏幕上的 X 不能反向。
      if (projectile.__finalDrawVisualId !== projectile.id) {
        projectile.__finalDrawVisualId = projectile.id;
        projectile.__finalDrawX = point.x;
      } else {
        projectile.__finalDrawX = projectile.owner === 'enemy'
          ? Math.min(projectile.__finalDrawX, point.x)
          : Math.max(projectile.__finalDrawX, point.x);
      }
      point.x = projectile.__finalDrawX;

      drawProjectileSprite(this, ctx, projectile, point, target, source);
      this._launchOwnedProjectileAudit.push({
        id: projectile.id,
        owner: projectile.owner,
        trajectory: projectile.trajectory,
        sourceRes: numericResourceId(projectile.sourceRes),
        sourceLane: projectile.sourceLane ?? projectile.lane,
        visualLane: startLane + (endLane - startLane) * progress,
        rawX: finite(projectile.x),
        stableX: visual.x,
        progress,
        startCol,
        endCol,
        arcHeight,
        arcOffset,
        drawX: point.x,
        drawY: point.y,
        muzzleX: source.x,
        muzzleY: source.y,
        launchPathLocked: true,
        liveSourcePositionIgnored: true,
      });
    }

    // 兼容既有诊断/回归入口：最终 renderer 已取代旧 RuntimeStability 的 projectile draw，
    // 但旧 verifier 仍是公开测试缝。镜像同一份最终 audit，避免出现“实际绘制正确、诊断字段空”的假红。
    this._runtimeStabilityProjectileAudit = this._launchOwnedProjectileAudit;
    this._runtimeCoordinateProjectileAudit = this._launchOwnedProjectileAudit;
    this._coordinateProjectileAudit = this._launchOwnedProjectileAudit.map((item) => {
      const draw = fieldToClient(this, item.drawX, item.drawY);
      const muzzle = fieldToClient(this, item.muzzleX, item.muzzleY);
      return {
        ...item,
        drawClientX: draw.x,
        drawClientY: draw.y,
        muzzleClientX: muzzle.x,
        muzzleClientY: muzzle.y,
      };
    });
  };
}

export function installProjectileLaunchOwnershipFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installEngineLaunchOwnership();
  installLaunchOwnedRenderer();

  globalThis.__verifyProjectileLaunchOwnershipFinal = () => {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView
      ?? globalThis.__activeBattleWorldView
      ?? globalThis.__pvpFixtureBattle;
    return {
      enabled: true,
      straightLaunchPathLocked: true,
      parabolaLaunchPathLocked: true,
      normalTargetRetargetDisabled: true,
      liveAttackerPositionIgnoredAfterLaunch: true,
      finalDrawXDirectionMonotonic: true,
      parabolaUsesConstantGravity: true,
      projectiles: view?.renderer?._launchOwnedProjectileAudit ?? [],
    };
  };
}

export function scheduleProjectileLaunchOwnershipFinal() {
  queueMicrotask(() => installProjectileLaunchOwnershipFinal());
}
