import { BattleEngine } from './BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleMeleeContactFinal');
// 真实碰撞距离只用于“是否停止继续前进”；攻击距离仍以 BattleUnit.range=1 为权威。
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
 * 12x5 是寻路/放置逻辑网格，fractional col 才是连续移动坐标。
 * 可移动近战的攻击权威仍是 BattleUnit.range=1：进入相邻一格即可正常出手；
 * CONTACT_COL_DISTANCE 只控制移动阻挡，避免单位因为“下一格有敌人”过早停在格子中心。
 */
export function installBattleMeleeContactFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 不再二次收窄 tryAttack() 的一格近战射程。
  // 旧包装要求中心距离 <0.75，导致 0.75~1 格内已被 BattleEngine 合法锁定的近战目标无法攻击。

  // 这是战斗热路径，安装时只包装一次原型方法。
  // 仅移动阻挡需要真实接触距离；攻击仍完全交给 BattleEngine.tryAttack/chooseTarget。
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
