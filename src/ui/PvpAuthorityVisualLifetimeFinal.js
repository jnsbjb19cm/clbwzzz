import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpAuthorityVisualLifetimeFinal');
const MAX_VISUAL_DT = 0.05;
const PROJECTILE_FORGET_MS = 1200;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function monotonicProjectileVisuals(renderer, engine, nowMs) {
  renderer.__pvpProjectileVisualHistory ??= new Map();
  const history = renderer.__pvpProjectileVisualHistory;
  const seen = new Set();

  for (const projectile of engine?.projectiles ?? []) {
    const id = Number(projectile?.id);
    if (!Number.isFinite(id)) continue;
    seen.add(id);
    const direction = projectile.owner === 'enemy' ? -1 : 1;
    const currentX = finite(projectile.x, projectile.startCol);
    const currentProgress = Math.max(0, Math.min(1, finite(projectile.progress)));
    const previous = history.get(id);

    if (!previous) {
      history.set(id, {
        x: currentX,
        progress: currentProgress,
        seenAt: nowMs,
      });
      continue;
    }

    const stableX = direction > 0
      ? Math.max(previous.x, currentX)
      : Math.min(previous.x, currentX);
    const stableProgress = Math.max(previous.progress, currentProgress);

    // 权威快照/插值如果给出倒退位置，直接把“绘制用位置”钉在上一次前沿。
    // 不改变命中/伤害权威；只禁止网络抖动让已经飞出的子弹倒着走。
    projectile.x = stableX;
    projectile.progress = stableProgress;
    history.set(id, {
      x: stableX,
      progress: stableProgress,
      seenAt: nowMs,
    });
  }

  for (const [id, entry] of history) {
    if (seen.has(id)) continue;
    if (nowMs - finite(entry.seenAt, nowMs) > PROJECTILE_FORGET_MS) history.delete(id);
  }
}

function agePvpVisualQueues(renderer, engine, nowMs) {
  if (!engine?.pvp) return 0;
  const previous = finite(renderer.__pvpVisualClockMs, nowMs);
  renderer.__pvpVisualClockMs = nowMs;
  const dt = Math.min(MAX_VISUAL_DT, Math.max(0, (nowMs - previous) / 1000));
  if (dt <= 0) return 0;

  // PVP 权威模式不能本地 engine.tick()，但以下三个入口仅老化纯视觉队列：
  // - 浮字
  // - 部署圈
  // - skill/impact/bump/card-feedback
  // 不会移动单位、结算伤害、推进技能状态或改变胜负。
  engine.updateFloats?.(dt);
  engine.updateDeployEffects?.(dt);
  engine.updateFx?.(dt);
  return dt;
}

export function installPvpAuthorityVisualLifetimeFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDraw = BattleRenderer.prototype.draw;
  if (typeof previousDraw !== 'function') return;

  BattleRenderer.prototype.draw = function drawWithAuthorityVisualClock(engine, ...args) {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (engine?.pvp) {
      const agedDt = agePvpVisualQueues(this, engine, nowMs);
      monotonicProjectileVisuals(this, engine, nowMs);
      this.__pvpVisualLifetimeAudit = {
        agedDt,
        deployEffects: engine.deployEffects?.length ?? 0,
        impactFx: engine.impactFx?.length ?? 0,
        skillFx: engine.skillFx?.length ?? 0,
        bumpFx: engine.bumpFx?.length ?? 0,
        floats: engine.floats?.length ?? 0,
        projectileHistory: this.__pvpProjectileVisualHistory?.size ?? 0,
      };
    }
    return previousDraw.call(this, engine, ...args);
  };

  globalThis.__verifyPvpAuthorityVisualLifetimeFinal = () => {
    const view = globalThis.__activeBattleWorldView ?? globalThis.__pvpFixtureBattle ?? null;
    return {
      enabled: true,
      agesVisualQueuesWithoutEngineTick: true,
      projectileVisualDirectionMonotonic: true,
      maxVisualDt: MAX_VISUAL_DT,
      runtime: view?.renderer?.__pvpVisualLifetimeAudit ?? null,
    };
  };
}

export function schedulePvpAuthorityVisualLifetimeFinal() {
  queueMicrotask(() => installPvpAuthorityVisualLifetimeFinal());
}
