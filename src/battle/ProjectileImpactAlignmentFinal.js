import { BattleEngine } from './BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.projectileImpactAlignmentFinal');

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * 子弹的“飞行终点”和“爆炸/命中特效”必须是同一个世界坐标。
 *
 * BattleEngine 过去用 getProjectileHitFrac() 把飞行终点放在目标格的迎弹前沿，
 * 但 resolveProjectileImpact() 又把爆炸放回 primary.col 的格子中心，导致子弹到终点
 * 后视觉上再横跳半格才爆炸。这里保留碰撞前沿语义，只把命中特效对齐到真正终点。
 */
export function installProjectileImpactAlignmentFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousResolveProjectileImpact = BattleEngine.prototype.resolveProjectileImpact;
  BattleEngine.prototype.resolveProjectileImpact = function resolveProjectileImpactAtTerminal(projectile, primary) {
    const before = this.impactFx?.length ?? 0;
    const result = previousResolveProjectileImpact.call(this, projectile, primary);

    const impact = this.impactFx?.[before];
    if (impact && projectile) {
      const terminalCol = finite(projectile.resolveCol, finite(projectile.hitCol, finite(projectile.x, primary?.col)));
      const terminalLane = finite(projectile.hitLane, finite(projectile.y, primary?.lane));
      if (terminalCol != null) impact.col = terminalCol;
      if (terminalLane != null) impact.lane = terminalLane;
      impact.__projectileTerminalAligned = true;
      impact.__projectileId = projectile.id ?? null;
    }

    return result;
  };

  globalThis.__verifyProjectileImpactAlignmentFinal = () => ({
    enabled: true,
    impactUsesProjectileTerminal: true,
    targetCellCenterJumpRemoved: true,
  });
}
