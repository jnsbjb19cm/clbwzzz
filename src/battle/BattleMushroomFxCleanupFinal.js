import { BattleEngine } from './BattleEngine.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleMushroomFxCleanupFinal');
const MUSHROOM_RES = 58;

export function installBattleMushroomFxCleanupFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousTryMushroomAttack = BattleEngine.prototype.tryMushroomAttack;
  BattleEngine.prototype.tryMushroomAttack = function tryMushroomAttackWithoutDuplicateFullscreenFx(unit) {
    const result = previousTryMushroomAttack.call(this, unit);
    if (!result || Number(unit?.res) !== MUSHROOM_RES) return result;

    // MC58 自己的攻击帧已经包含法阵，BattleMushroomProjectileFinal 又会生成真实毒子弹。
    // 旧核心同时塞入 fullScreen mushroom_bubble，会让整屏反复叠一层大动画，
    // 造成绿/紫圈残留和明显 overdraw。删除这一份重复视觉，不改伤害/毒弹时序。
    this.skillFx = (this.skillFx ?? []).filter((fx) => fx?.kind !== 'mushroom_bubble');
    this.skillEffects = this.skillFx;
    return result;
  };
}
