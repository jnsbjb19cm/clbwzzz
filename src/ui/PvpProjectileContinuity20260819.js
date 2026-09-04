import { BattleRenderer } from '../battle/BattleRenderer.js';
import { applyProjectileServerTimeline } from './PvpServerTimeline20260819.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpProjectileContinuity20260819');
// 仅保留旧 verifier 的兼容字段；实际预测不再在 120ms 处停止。
// 视觉预测一直推进到服务器已经给出的 immutable hit endpoint，伤害/死亡仍由服务器决定。
const LEGACY_EXTRAPOLATE_SEC = 0.12;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isLaunchOwnedProjectile(projectile) {
  return projectile?.launched !== false
    && projectile?.done !== true
    && (projectile?.trajectory === 'straight' || projectile?.trajectory === 'parabola')
    && Number.isFinite(Number(projectile?.__authorityReceivedAt));
}

function seedAuthorityVelocity(projectile) {
  let vx = finite(projectile.__authorityVx);
  let vy = finite(projectile.__authorityVy);
  if (Math.abs(vx) < 1e-6) vx = finite(projectile._flightVx);
  if (Math.abs(vy) < 1e-6) vy = finite(projectile._flightVy);
  projectile.__authorityVx = vx;
  projectile.__authorityVy = vy;
  return { vx, vy };
}

function keepCrossFrameVisualX(projectile, currentX, predictedX, direction) {
  const previousVisualX = Number.isFinite(Number(projectile.__continuityVisualX))
    ? Number(projectile.__continuityVisualX)
    : currentX;

  let nextX;
  if (direction > 0) nextX = Math.max(previousVisualX, currentX, predictedX);
  else if (direction < 0) nextX = Math.min(previousVisualX, currentX, predictedX);
  else nextX = predictedX;

  projectile.__continuityVisualX = nextX;
  return nextX;
}

function predictProjectile(projectile, now) {
  // 新协议：普通 straight/parabola 子弹用绝对服务器时间轴。
  // 不积分本机 delta，不追 20/30Hz snapshot target；30/60/144FPS 只是采样次数不同。
  if (projectile?.__serverTimelineProjectile) {
    applyProjectileServerTimeline(projectile.__serverTimelineView, projectile, now);
    return;
  }

  // 旧协议/稀疏 snapshot 兼容路径：只能预测“视觉位置”，不能预测伤害结果。
  // 旧实现把 age 截断到 120ms，网络/CI 一旦两个绘制帧跨过这个窗口，子弹就停住等下一快照，
  // 形成用户看到的逐段跳动。现在沿服务器已给出的 launch velocity 持续前进，并在 hit endpoint 截止。
  if (!isLaunchOwnedProjectile(projectile)) return;

  const { vx, vy } = seedAuthorityVelocity(projectile);
  const receivedAt = finite(projectile.__authorityReceivedAt, now);
  const age = Math.max(0, (now - receivedAt) / 1000);
  const baseX = finite(projectile.__authorityTargetX, projectile.x);
  const baseY = finite(projectile.__authorityTargetY, projectile.y);
  let predictedX = baseX + vx * age;
  let predictedY = baseY + vy * age;

  const startX = finite(projectile.flightStartCol, finite(projectile.startCol, projectile.x));
  const endX = finite(projectile.flightEndCol, finite(projectile.hitCol, predictedX));
  const startY = finite(projectile.flightStartLane, finite(projectile.lane, projectile.y));
  const endY = finite(projectile.flightEndLane, finite(projectile.hitLane, predictedY));
  const direction = Math.sign(endX - startX) || Math.sign(vx);
  let reachedEndpoint = false;
  if (direction > 0 && predictedX >= endX) {
    predictedX = endX;
    reachedEndpoint = true;
  } else if (direction < 0 && predictedX <= endX) {
    predictedX = endX;
    reachedEndpoint = true;
  }
  if (reachedEndpoint) predictedY = endY;

  const currentX = finite(projectile.x, predictedX);
  projectile.x = keepCrossFrameVisualX(projectile, currentX, predictedX, direction);
  projectile.y = predictedY;

  const distance = endX - startX;
  if (Math.abs(distance) > 1e-6) {
    const visualProgress = Math.max(0, Math.min(1, (projectile.x - startX) / distance));
    projectile.__continuityProgress = Math.max(
      finite(projectile.__continuityProgress),
      finite(projectile.progress),
      visualProgress,
    );
    projectile.progress = projectile.__continuityProgress;
  }

  const lastDrawAt = finite(projectile.__continuityLastDrawAt, now);
  const drawDt = Math.max(0, Math.min(0.05, (now - lastDrawAt) / 1000));
  projectile.__continuityLastDrawAt = now;
  projectile.__continuityFlightT = Math.max(
    finite(projectile.__continuityFlightT),
    finite(projectile.flightT),
  ) + drawDt;
  projectile.flightT = projectile.__continuityFlightT;
}

export function installPvpProjectileContinuity20260819() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDrawProjectiles = BattleRenderer.prototype.drawProjectiles;
  BattleRenderer.prototype.drawProjectiles = function drawAuthorityProjectilesContinuously(ctx, engine) {
    const now = performance.now();
    for (const projectile of engine?.projectiles ?? []) predictProjectile(projectile, now);
    return previousDrawProjectiles.call(this, ctx, engine);
  };

  globalThis.__verifyPvpProjectileContinuity20260819 = () => ({
    enabled: true,
    extrapolateSec: LEGACY_EXTRAPOLATE_SEC,
    predictionStopsAtEndpoint: true,
    predictionHasNoTimeCap: true,
    firstSnapshotUsesLaunchVelocity: true,
    snapshotsCannotPullNormalProjectileBackward: true,
    crossFrameVisualXIsMonotonic: true,
    serverTimelineProjectilesIgnoreRenderDelta: true,
    serverDamageRemainsAuthoritative: true,
  });
}

export function schedulePvpProjectileContinuity20260819() {
  queueMicrotask(() => installPvpProjectileContinuity20260819());
}
