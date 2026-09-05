import { BattleEngine } from '../battle/BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.newPlayerTutorialBaseProtectionV2');

if (!globalThis[PATCH_FLAG]) {
  globalThis[PATCH_FLAG] = true;

  const previousDamageBase = BattleEngine.prototype.damageBase;
  BattleEngine.prototype.damageBase = function damageBaseWithTutorialProtection(side, amount) {
    // 剧情教学阶段敌方基地免伤；进入“乘胜追击”最终阶段后由控制器显式解除。
    if (
      this?.tutorialMode === true
      && this?.tutorialBaseProtected === true
      && side === 'enemy'
    ) {
      return undefined;
    }
    return previousDamageBase.call(this, side, amount);
  };

  // 不再改写 placeEnemyUnit 的 lane。
  // 旧实现会把“第一只教学怪”强行改成第一个己方单位所在路；
  // 由于教程开场已有静态防御卡，第一个己方单位通常在第 1 路，导致跑鞋怪跑错路。
}
