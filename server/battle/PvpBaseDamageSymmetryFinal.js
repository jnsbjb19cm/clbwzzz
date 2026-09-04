import { BattleEngine } from '../../src/battle/BattleEngine.js';
import { roundBattleAmount } from '../../src/battle/BattleConfig.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpBaseDamageSymmetryFinal');

/**
 * PvpBattle 为了关闭 PVE 波次以 trainingMode 初始化 BattleEngine；原 damageBase
 * 会在 trainingMode 下忽略 player 基地伤害，造成红方永远打不掉蓝方基地。
 */
export function installPvpBaseDamageSymmetryFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDamageBase = BattleEngine.prototype.damageBase;
  BattleEngine.prototype.damageBase = function damagePvpBaseSymmetrically(side, amount) {
    if (!this.pvp) return previousDamageBase.call(this, side, amount);
    const damage = roundBattleAmount(amount);
    if (damage <= 0) return 0;
    if (side === 'enemy') {
      const before = this.enemyHeroHp;
      this.enemyHeroHp = roundBattleAmount(Math.max(0, this.enemyHeroHp - damage));
      return roundBattleAmount(before - this.enemyHeroHp);
    }
    if (side === 'player') {
      const before = this.heroHp;
      this.heroHp = roundBattleAmount(Math.max(0, this.heroHp - damage));
      return roundBattleAmount(before - this.heroHp);
    }
    return 0;
  };
}
