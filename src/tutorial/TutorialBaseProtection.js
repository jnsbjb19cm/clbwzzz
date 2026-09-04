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

  const previousPlaceEnemyUnit = BattleEngine.prototype.placeEnemyUnit;
  BattleEngine.prototype.placeEnemyUnit = function placeTutorialEnemyInLearnableLane(
    card,
    lane,
    isBoss = false,
    preferredCol = null,
  ) {
    let resolvedLane = lane;
    // 第一个教学敌人必须和玩家刚放下的第一张卡同路，避免新手卡在“第一次战斗”步骤。
    if (
      this?.tutorialMode === true
      && this?.__newPlayerTutorialPrepared === true
      && Number(this.killsThisBattle || 0) === 0
    ) {
      const firstPlayerUnit = (this.units ?? []).find((unit) => unit?.alive && unit.team === 'player');
      if (firstPlayerUnit) resolvedLane = Number(firstPlayerUnit.lane);
    }
    return previousPlaceEnemyUnit.call(this, card, resolvedLane, isBoss, preferredCol);
  };
}
