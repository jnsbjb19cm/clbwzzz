import { BattleEngine } from '../battle/BattleEngine.js';
import {
  ENEMY_BASE_FRAC,
  PLAYER_BASE_FRAC,
  roundBattleAmount,
} from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRuntimeFixes');

export function installBattleRuntimeFixes() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleEngine.prototype.getOpponentBaseEdgeCol = function getOpponentBaseEdgeCol(team = 'player') {
    return team === 'player' ? ENEMY_BASE_FRAC : PLAYER_BASE_FRAC;
  };

  const originalDamageBase = BattleEngine.prototype.damageBase;
  BattleEngine.prototype.damageBase = function damageBaseWithResult(side, amount) {
    const before = side === 'enemy' ? this.enemyHeroHp : this.heroHp;
    originalDamageBase.call(this, side, amount);
    const after = side === 'enemy' ? this.enemyHeroHp : this.heroHp;
    return roundBattleAmount(Math.max(0, before - after));
  };

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithBossScene(root) {
    if (this.boss && this.engine?.stage && this.engine.stage.stage_type !== 2) {
      this.engine.stage = {
        ...this.engine.stage,
        stage_type: 2,
        enemy_name: this.boss.name ?? this.boss.card_name ?? this.engine.stage.enemy_name,
      };
    }
    return originalRenderBattle.call(this, root);
  };
}
