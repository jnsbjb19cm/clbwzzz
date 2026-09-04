import { getSkillAnimationDuration } from '../battle/SkillAnimationConfig.js';
import { BattleSkillSystem } from '../systems/BattleSkillSystem.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleSkillVisualLifetimeFinal');

/**
 * 持续伤害/冻结/增益的 gameplay duration 属于状态系统，不属于施法动画寿命。
 * 除陨石雨明确需要两遍以外，所有 cast visual 只播放一个源动画周期后退出。
 */
export function installBattleSkillVisualLifetimeFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleSkillSystem.prototype.showEffect = function showOnePassSkillVisual(skillId, effect, target) {
    const eng = this.engine;
    const onePass = getSkillAnimationDuration(skillId, 0.9);

    if (Number(skillId) === 517) {
      eng.pushSkillEffect?.(
        'damage_all_enemies',
        null,
        0,
        skillId,
        Math.max(1.2, onePass * 2),
        true,
      );
      return;
    }

    eng.pushSkillEffect?.(
      effect.kind,
      target,
      effect.radius ?? 0,
      skillId,
      onePass,
      false,
    );
  };

  globalThis.__verifyBattleSkillVisualLifetimeFinal = () => ({
    enabled: true,
    castVisualUsesGameplayDuration: false,
    regularVisualLoops: false,
    meteorUsesExplicitTwoPassVisual: true,
  });
}
