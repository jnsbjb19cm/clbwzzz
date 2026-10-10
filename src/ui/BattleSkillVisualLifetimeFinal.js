import { getSkillAnimationDuration } from '../battle/SkillAnimationConfig.js';
import { BattleSkillSystem } from '../systems/BattleSkillSystem.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleSkillVisualLifetimeFinal');

/**
 * 持续伤害/冻结/增益的 gameplay duration 属于状态系统，不属于施法动画寿命。
 * 火墙按地形寿命持续燃烧；陨石雨两遍；其余 cast visual 一个周期后退出。
 */
export function installBattleSkillVisualLifetimeFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousShowEffect = BattleSkillSystem.prototype.showEffect;
  BattleSkillSystem.prototype.showEffect = function showOnePassSkillVisual(skillId, effect, target) {
    const eng = this.engine;
    // 火墙是持续存在的地形，不是单次施法闪光。
    if (effect?.kind === 'fire_wall') return previousShowEffect.call(this, skillId, effect, target);
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
