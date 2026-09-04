function isAttackVisualState(state) {
  const key = String(state ?? '');
  return key === 'attacking'
    || key.startsWith('attacking_')
    || key.startsWith('attack_');
}

/**
 * 任何实际动画状态都允许可见像素越过人物的稳定缩放边界。
 * uniformBounds 只能用于“人物本体尺寸/脚点”的稳定锚定，不能再充当 source clip。
 * 否则今天修 attacking，明天 default/moving/stun/death 又会把法杖、尾迹、光圈截成矩形。
 */
export function isOverflowAnimationState(state) {
  return String(state ?? '').trim().length > 0;
}

export function isAttackAnimationState(state) {
  return isAttackVisualState(state);
}
