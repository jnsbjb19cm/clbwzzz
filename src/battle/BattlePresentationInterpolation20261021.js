/**
 * 2026-10-21 战斗运动平滑（固定步长渲染插值）
 *
 * 背景（用户反馈）：「只有可移动卡牌本体和子弹的帧率异常」——引擎从 2026-10-13 起按固定步长
 * TICK_INTERVAL(0.155s) 推进，渲染却是 requestAnimationFrame(60~165FPS)。姿态动画时钟已经用
 * engine.animationTime 平滑过，但**位置**（unit.col / projectile.x/y）仍只在 tick 时更新，
 * 于是移动单位和子弹实际只有 ~6.45 次/秒的位置更新，看起来一卡一卡。
 *
 * 做法（不改任何战斗数值/碰撞/命中判定）：
 *   1) 每个 engine.tick 前记录单位上一次的 col（prev），tick 后 current=unit.col；
 *   2) 每帧渲染前，用「本帧模拟余量 / 固定步长」当 alpha，把单位 col 临时改成
 *      current + (current-prev)*alpha（外推一个 tick 内已经走过的时间），画完立即还原；
 *   3) 子弹轨迹在发射时就解出解析解（flightStart/Vx/Vy/抛物线参数），渲染时用
 *      t = flightElapsed + alpha*step 直接算位置/弧高/贴图时钟，同样画完还原。
 * PVP/联机权威战斗有自己的快照插值（PvpAuthoritySmoothMotion），这里跳过。
 */
import { TICK_INTERVAL } from './BattleConfig.js';
import { BattleEngine } from './BattleEngine.js';
import { BattleRenderer } from './BattleRenderer.js';

const FLAG = Symbol.for('clbwz.battlePresentationInterpolation20261021');
let tickStep = Number(TICK_INTERVAL) > 0 ? Number(TICK_INTERVAL) : 0.155;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

/** 本帧渲染相对「上一次 tick」的时间比例（0~1）。无法插值时返回 null。 */
export function presentationAlpha(engine) {
  if (!engine || engine.pvp) return null;
  if (engine.status !== 'playing') return null;
  const remainder = Number(engine._simulationRemainder);
  if (!Number.isFinite(remainder) || remainder <= 0) return null;
  const step = tickStep > 0 ? tickStep : 0.155;
  return clamp01(remainder / step);
}

/** 单位渲染列：上一次 tick 到本次 tick 的外推。 */
export function interpolateUnitRenderCol(engine, unit, alpha = presentationAlpha(engine)) {
  if (alpha == null || !unit) return unit?.col ?? 0;
  const prev = Number(unit.__presentationPrevCol);
  const current = Number(unit.col);
  if (!Number.isFinite(prev) || !Number.isFinite(current)) return current;
  const delta = current - prev;
  // 瞬移/跳跃/换路等异常位移不插值，避免拖影。
  if (!Number.isFinite(delta) || Math.abs(delta) > 0.6 || Math.abs(delta) < 1e-6) return current;
  return current + delta * alpha;
}

/** 子弹渲染位置：用发射时锁定的解析轨迹外推。返回 null 表示不改（延迟/已落地/数据异常）。 */
export function interpolatedProjectileVisual(projectile, engine, alpha = presentationAlpha(engine)) {
  if (alpha == null || !projectile || projectile.done || !projectile.launched) return null;
  const duration = Number(projectile._flightDuration);
  const elapsed = Number(projectile._flightElapsed);
  if (!Number.isFinite(duration) || duration <= 1e-6 || !Number.isFinite(elapsed)) return null;
  const extra = alpha * (tickStep > 0 ? tickStep : 0.155);
  const t = Math.max(0, Math.min(duration, elapsed + extra));
  const x = finite(projectile.flightStartCol) + finite(projectile._flightVx) * t;
  const y = finite(projectile.flightStartLane) + finite(projectile._flightVy) * t;
  if (Math.abs(x - finite(projectile.x)) > 2 || Math.abs(y - finite(projectile.y)) > 2) return null;
  const arcOffset = projectile.trajectory === 'parabola'
    ? Math.max(0, finite(projectile._arcVelocity) * t + 0.5 * finite(projectile._arcAcceleration) * t * t)
    : 0;
  return {
    x,
    y,
    arcOffset,
    progress: clamp01(t / duration),
    flightT: finite(projectile.flightT) + extra,
  };
}

function snapshotTickState(engine) {
  if (!engine || engine.pvp || engine.status !== 'playing') return;
  for (const unit of engine.units ?? []) {
    if (!unit) continue;
    unit.__presentationPrevCol = unit.col;
  }
}

function applyPresentationState(engine) {
  const alpha = presentationAlpha(engine);
  if (alpha == null) return null;
  const restore = [];
  for (const unit of engine.units ?? []) {
    if (!unit) continue;
    const prev = Number(unit.__presentationPrevCol);
    const current = Number(unit.col);
    if (!Number.isFinite(prev) || !Number.isFinite(current)) continue;
    const rendered = interpolateUnitRenderCol(engine, unit, alpha);
    if (Math.abs(rendered - current) < 1e-6) continue;
    restore.push([unit, current]);
    unit.col = rendered;
  }
  for (const projectile of engine.projectiles ?? []) {
    const visual = interpolatedProjectileVisual(projectile, engine, alpha);
    if (!visual) continue;
    const saved = {
      x: projectile.x,
      y: projectile.y,
      arcOffset: projectile.arcOffset,
      progress: projectile.progress,
      flightT: projectile.flightT,
    };
    projectile.x = visual.x;
    projectile.y = visual.y;
    projectile.arcOffset = visual.arcOffset;
    projectile.progress = visual.progress;
    projectile.flightT = visual.flightT;
    restore.push([projectile, saved]);
  }
  return () => {
    for (const [target, saved] of restore) {
      if (typeof saved === 'number') {
        // Restore the scalar column after rendering; otherwise each draw compounds movement.
        target.col = saved;
      } else {
        target.x = saved.x;
        target.y = saved.y;
        target.arcOffset = saved.arcOffset;
        target.progress = saved.progress;
        target.flightT = saved.flightT;
      }
    }
  };
}

export function installBattlePresentationInterpolation20261021() {
  if (globalThis[FLAG]) return;
  globalThis[FLAG] = true;

  {
    const originalTick = BattleEngine.prototype.tick;
    if (typeof originalTick === 'function' && !originalTick.__presentationSnapshot20261021) {
      const wrapped = function tickWithPresentationSnapshot(dt) {
        snapshotTickState(this);
        return originalTick.call(this, dt);
      };
      wrapped.__presentationSnapshot20261021 = true;
      BattleEngine.prototype.tick = wrapped;
    }
  }

  {
    const originalDraw = BattleRenderer.prototype.draw;
    if (typeof originalDraw === 'function' && !originalDraw.__presentationInterpolation20261021) {
      const wrappedDraw = function drawWithPresentationInterpolation(engine) {
        const restore = applyPresentationState(engine);
        try {
          return originalDraw.call(this, engine);
        } finally {
          if (restore) restore();
        }
      };
      wrappedDraw.__presentationInterpolation20261021 = true;
      BattleRenderer.prototype.draw = wrappedDraw;
    }
  }
}
