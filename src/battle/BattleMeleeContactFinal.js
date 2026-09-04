import { BattleEngine } from './BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleMeleeContactFinal');
// 实际命中盒略放宽：0.62 在单位跨格连续位移时容易让同格近战“概率性”不触发。
const CONTACT_COL_DISTANCE = 0.75;

function isRangeOneMovingMelee(unit) {
  return Boolean(
    unit?.alive
      && unit.isMovable?.()
      && !unit.isRanged?.()
      && Number(unit.range) <= 1
      && !unit.attackingBase,
  );
}

function hasRealContact(engine, unit) {
  return engine.contactEnemies?.(unit)?.some(
    (target) => Math.abs(Number(target.col) - Number(unit.col)) < CONTACT_COL_DISTANCE,
  ) ?? false;
}

/**
 * 12x5 是寻路/放置逻辑网格，不是近战命中盒。
 * 射程 1 的可移动近战只有真正靠到 fractional-col 接触距离后才能开打；
 * 同时不能因为“下一格里有敌人”就提前停在当前格中心。
 */
export function installBattleMeleeContactFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousTryAttack = BattleEngine.prototype.tryAttack;
  BattleEngine.prototype.tryAttack = function tryAttackAfterRealMeleeContact(unit) {
    if (isRangeOneMovingMelee(unit) && !hasRealContact(this, unit)) return false;
    return previousTryAttack.call(this, unit);
  };

  // 这是战斗热路径，安装时只包装一次原型方法。
  // 旧实现会在每个 movement tick 临时覆写实例方法再还原，持续创建闭包并触发 setter/GC。
  const previousHasBlockingEnemyInCell = BattleEngine.prototype.hasBlockingEnemyInCell;
  BattleEngine.prototype.hasBlockingEnemyInCell = function hasBlockingEnemyInCellAfterRealContact(unit, col) {
    if (isRangeOneMovingMelee(unit) && !hasRealContact(this, unit)) {
      const gridCol = this.getUnitGridCol(unit);
      const aheadCol = gridCol + this.getMoveDir(unit);
      if (Number(col) === Number(aheadCol)) return false;
    }
    return previousHasBlockingEnemyInCell.call(this, unit, col);
  };
}
