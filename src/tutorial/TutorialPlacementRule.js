import { BattleEngine } from '../battle/BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.newPlayerTutorialPlacementRuleV1');
const TUTORIAL_MIDDLE_LANE = 2;

if (!globalThis[PATCH_FLAG]) {
  globalThis[PATCH_FLAG] = true;

  const previousCanDeploy = BattleEngine.prototype.canDeploy;
  BattleEngine.prototype.canDeploy = function canDeployWithTutorialFirstLane(
    lane,
    col,
    handIndex = this.selectedHandIndex,
    options = {},
  ) {
    if (this?.tutorialMode === true) {
      const hasRealPlayerDeployment = (this.units ?? []).some(
        (unit) => unit?.alive
          && unit.team === 'player'
          && unit.tutorialStaticDefense !== true,
      );

      if (!hasRealPlayerDeployment && Number(lane) !== TUTORIAL_MIDDLE_LANE) {
        if (!options?.silent) {
          this.lastDeployError = '新手教程：第一张卡请放在第三路（中路）';
        }
        return false;
      }
    }

    return previousCanDeploy.call(this, lane, col, handIndex, options);
  };
}
