import { BattleEngine } from './BattleEngine.js';
import { COLS } from './BattleConfig.js';

/**
 * 技能飘字使用“攻击方 → 对方基地前沿列”的逻辑坐标。
 *
 * - player 攻击方的对方基地在右侧最后一列；
 * - enemy 攻击方的对方基地在左侧第一列。
 *
 * BattleSkillSystem 早期已调用此方法，但 BattleEngine 没有实现，导致
 * 基地伤害/治疗技能运行到飘字阶段时报 TypeError。集中补在原型上，保证
 * 浏览器战斗与服务端无头 PVP 使用完全相同的坐标规则。
 */
if (typeof BattleEngine.prototype.getOpponentBaseEdgeCol !== 'function') {
  BattleEngine.prototype.getOpponentBaseEdgeCol = function getOpponentBaseEdgeCol(attackerTeam) {
    return attackerTeam === 'player' ? COLS - 1 : 0;
  };
}

export function installBattleEngineBaseEdgeCompat() {
  return BattleEngine.prototype.getOpponentBaseEdgeCol;
}
