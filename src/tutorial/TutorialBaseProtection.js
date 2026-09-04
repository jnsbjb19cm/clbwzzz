import { BattleEngine } from '../battle/BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.newPlayerTutorialBaseProtectionV1');

if (!globalThis[PATCH_FLAG]) {
  globalThis[PATCH_FLAG] = true;
  const previousDamageBase = BattleEngine.prototype.damageBase;
  BattleEngine.prototype.damageBase = function damageBaseWithTutorialProtection(side, amount) {
    // 新手教程前半程的敌方基地固定为 800 HP；这段时间只用于讲解与练习，基地免伤。
    // 最终训练会把 enemyHeroMaxHp 改为 260，此时自动恢复真实基地伤害与胜负判定。
    if (
      this?.tutorialMode === true
      && this?.__newPlayerTutorialPrepared === true
      && side === 'enemy'
      && Number(this.enemyHeroMaxHp) === 800
    ) {
      return undefined;
    }
    return previousDamageBase.call(this, side, amount);
  };
}
