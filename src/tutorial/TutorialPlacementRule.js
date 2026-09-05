import { BattleEngine } from '../battle/BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.newPlayerTutorialPlacementRuleV2');

function fail(engine, options, message) {
  if (!options?.silent) engine.lastDeployError = message;
  return false;
}

if (!globalThis[PATCH_FLAG]) {
  globalThis[PATCH_FLAG] = true;

  const previousCanDeploy = BattleEngine.prototype.canDeploy;
  BattleEngine.prototype.canDeploy = function canDeployWithTutorialScript(
    lane,
    col,
    handIndex = this.selectedHandIndex,
    options = {},
  ) {
    if (this?.tutorialMode === true && this?.tutorialPlacementRule) {
      const rule = this.tutorialPlacementRule;
      const card = this.deck?.[handIndex]?.card;
      const cardId = Number(card?.id);
      const wantedId = Number(rule.cardId);
      const laneNo = Number(lane);
      const colNo = Number(col);

      if (wantedId && cardId !== wantedId) {
        return fail(this, options, rule.cardMessage || `勇士，这一步请先放下「${rule.cardName || '指定卡牌'}」`);
      }

      if (Number.isInteger(rule.lane) && laneNo !== Number(rule.lane)) {
        return fail(this, options, rule.laneMessage || `勇士，这一步请放在第 ${Number(rule.lane) + 1} 路`);
      }

      if (Number.isInteger(rule.col) && colNo !== Number(rule.col)) {
        return fail(this, options, rule.colMessage || `勇士，这一步请放在第 ${Number(rule.col) + 1} 列`);
      }

      if (Array.isArray(rule.allowedCols) && !rule.allowedCols.map(Number).includes(colNo)) {
        return fail(this, options, rule.colMessage || '勇士，请放在高亮的可用列中');
      }

      if (Number.isFinite(Number(rule.minCol)) && colNo < Number(rule.minCol)) {
        return fail(this, options, rule.colMessage || '勇士，请放得更靠前一些');
      }

      if (Number.isFinite(Number(rule.maxCol)) && colNo > Number(rule.maxCol)) {
        return fail(this, options, rule.colMessage || '勇士，请放在更靠近己方基地的后排');
      }
    }

    return previousCanDeploy.call(this, lane, col, handIndex, options);
  };
}
