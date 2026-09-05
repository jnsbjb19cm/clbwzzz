import { BattleEngine } from './BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwz.battleQueryPerformance20260905');
const REAR_CONTACT_TOLERANCE = 1.1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * 与 BattleEngine 原 getEnemiesInLane 规则保持一致，但不再：
 *   当前格全场扫一次 + 身后接触全场扫一次 + 射程内每一格再全场扫一次。
 *
 * 每次目标查询只扫描 this.units 一遍，并在这一遍内判断：
 *   1. 当前格；
 *   2. 身后 1.1 列连续接触容差；
 *   3. 前方射程格。
 *
 * 目标优先级仍由 pickPriorityTarget 的 dist / 可移动 / HP / uid 排序决定，
 * 因此这里只减少重复遍历，不改变攻击目标语义。
 */
export function collectEnemiesInLaneSinglePass20260905(engine, unit, lane) {
  const dir = engine.getMoveDir(unit);
  const gridCol = engine.getUnitGridCol(unit);
  const range = Math.max(0, Math.floor(finite(unit?.range)));
  const found = [];
  const seen = new Set();

  const add = (target, dist) => {
    const uid = target?.uid;
    if (seen.has(uid)) return;
    seen.add(uid);
    found.push({ unit: target, dist });
  };

  for (const target of engine.units ?? []) {
    if (target?.lane !== lane || !engine.isValidEnemyTarget(unit, target)) continue;

    const targetGridCol = engine.getUnitGridCol(target);

    // 原实现首先扫当前格；同格目标始终 dist=0。
    if (targetGridCol === gridCol) {
      add(target, 0);
      continue;
    }

    // 连续移动造成轻微错身时，保留原有 1.1 列身后接触容差。
    const signedDistance = (finite(target.col) - finite(unit.col)) * dir;
    if (signedDistance < 0 && signedDistance >= -REAR_CONTACT_TOLERANCE) {
      add(target, Math.abs(signedDistance));
      continue;
    }

    // 原实现逐格 getUnitsAt；网格列差等价于其 d。
    const cellDistance = (targetGridCol - gridCol) * dir;
    if (cellDistance >= 1 && cellDistance <= range) {
      add(target, cellDistance);
    }
  }

  return found;
}

export function installBattleQueryPerformance20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleEngine.prototype.getEnemiesInLane = function getEnemiesInLaneSinglePass20260905(unit, lane) {
    return collectEnemiesInLaneSinglePass20260905(this, unit, lane);
  };
}

export const BATTLE_QUERY_PERFORMANCE_20260905 = Object.freeze({
  laneTargetScansPerQuery: 1,
  rearContactTolerance: REAR_CONTACT_TOLERANCE,
});
