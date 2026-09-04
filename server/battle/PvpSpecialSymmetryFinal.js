const PATCH_FLAG = Symbol.for('clbwzzz.pvpSpecialSymmetryFinal');

/**
 * 单机引擎里软泥忍者怪(28)的死亡分身曾只对 player 阵营执行。
 * PVP 服务端以 player=蓝、enemy=红运行，因此必须补齐红方同样的死亡召唤。
 */
export function installPvpSpecialSymmetryFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // BattleEngine.onUnitDeath now applies card 28's two-child split to both
  // teams. The former red-side wrapper would duplicate that into four units.
}
