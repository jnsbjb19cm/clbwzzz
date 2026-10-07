import { getAttackPattern } from '../core/CardTraitRegistry.js';

/**
 * 喷喷怪(62)/超级喷喷怪(101)/土岩兽(116) 这类"以自身为中心 3×3"的单位（`square_self`）：
 * 它们站在原地喷周围一圈，**周围 3×3（含跨行）里的敌人都算可打目标**；
 * 3×3 里没人就**不出手**（不能退回同路逻辑，否则会隔着好几格去打别人）。
 *
 * 返回 `null` = "不是自中心单位，调用方走普通索敌"；
 * 返回数组（可能为空）= "就是自中心单位，目标就是这些，空数组表示不出手"。
 *
 * 注意：这条规则必须被**所有**重写 `getEnemiesInLane` 的地方复用 ——
 * 之前 `BattleQueryPerformance20260905` 的性能版把它整个丢掉了，
 * 于是喷喷怪又变回"只打本行"（用户报告的 bug）。
 */
export function collectSelfCenteredTargets(engine, unit, lane) {
  if (!unit?.isSelfCenteredMelee?.()) return null;
  if (Number(lane) !== Number(unit.lane)) return null;
  const radius = Math.max(1, Number(getAttackPattern(unit.cardId)?.radius ?? 1));
  const selfCol = engine.getUnitGridCol(unit);
  const found = [];
  for (const target of engine.units ?? []) {
    if (!engine.isValidEnemyTarget(unit, target)) continue;
    const dl = Math.abs(Math.round(Number(target.lane)) - Math.round(Number(unit.lane)));
    const dc = Math.abs(Math.round(Number(target.col)) - selfCol);
    if (dl <= radius && dc <= radius) found.push({ unit: target, dist: Math.max(dl, dc) });
  }
  return found;
}
