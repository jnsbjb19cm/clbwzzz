import { unitAnimPlayer } from './UnitAnimPlayer.js';

let installed = false;

function resolveHpAttackState(meta, unit) {
  const keys = Array.isArray(meta?.attackHpAnims)
    ? [...meta.attackHpAnims]
    : Object.keys(meta?.animations ?? {}).filter((key) => key.startsWith('attack_'));
  if (!keys.length) return null;
  keys.sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  const pct = (Number(unit?.hp) / Math.max(1, Number(unit?.maxHp) || 1)) * 100;
  for (const key of keys) {
    const threshold = Number(key.split('_')[1]);
    if (Number.isFinite(threshold) && pct <= threshold && meta.animations?.[key]) return key;
  }
  const last = keys[keys.length - 1];
  return meta.animations?.[last] ? last : null;
}

/**
 * 基地攻击时保持单位渲染锚点稳定。
 *
 * BattleEngine 已经把 attackingBase 单位的逻辑 col 锁在基地边缘；这里仅处理视觉层：
 * 1. 基地攻击不应用逐帧 root/anchorOffsetX 位移，避免攻击后“回弹”；
 * 2. HP 分段 attack_xx 动画临时映射到 attacking，让现有统一攻击锚点逻辑生效；
 * 3. 攻击脚点沿用待机脚点，避免攻击/待机切换产生上下跳动；
 * 4. 引擎在同一次攻击窗口里重复触发时不再把 attacking 时钟清零，避免基地攻击鬼畜。
 *
 * 修改只在一次 draw 调用期间生效，普通单位互殴仍保留原 XML 攻击位移。
 */
export function installBaseAttackRenderStability20260906() {
  if (installed || unitAnimPlayer.__baseAttackRenderStability20260906) return;
  installed = true;
  unitAnimPlayer.__baseAttackRenderStability20260906 = true;

  const originalDraw = unitAnimPlayer.draw.bind(unitAnimPlayer);
  const originalTriggerAttack = unitAnimPlayer.triggerAttack.bind(unitAnimPlayer);

  unitAnimPlayer.triggerAttack = function patchedBaseAttackTrigger(unit, engine, duration) {
    const now = Number(engine?.time) || 0;
    const wasAttackActive = Boolean(unit?._attackAnimUntil && now < Number(unit._attackAnimUntil));
    const genericKey = unit?.uid != null ? `${unit.uid}:attacking` : null;
    const previousGenericClock = genericKey ? this.clocks?.get(genericKey) : undefined;

    const result = originalTriggerAttack(unit, engine, duration);
    if (unit?.attackingBase && genericKey) {
      if (wasAttackActive) {
        // UnitAnimPlayer 本身会在 active attack window 内直接 return；这里必须同样保持
        // generic attacking 的时钟，不能像旧补丁那样每 tick 强制回到第 0 帧。
        if (previousGenericClock != null) this.clocks?.set(genericKey, previousGenericClock);
      } else {
        // 只有真正开始了下一次攻击，才从第 0 帧播放基地攻击动画。
        this.clocks?.set(genericKey, 0);
      }
    }
    return result;
  };

  unitAnimPlayer.draw = function patchedBaseAttackDraw(
    ctx,
    unit,
    engine,
    boxX,
    boxY,
    boxW,
    boxH,
    options = {},
  ) {
    if (!unit?.attackingBase) {
      return originalDraw(ctx, unit, engine, boxX, boxY, boxW, boxH, options);
    }

    const pack = this.ready?.get(String(unit.res));
    const meta = pack?.meta;
    if (!meta?.animations) {
      return originalDraw(ctx, unit, engine, boxX, boxY, boxW, boxH, options);
    }

    const animations = meta.animations;
    const hpAttackState = resolveHpAttackState(meta, unit);
    const hpAttackAnim = hpAttackState ? animations[hpAttackState] : null;
    const originalGenericAttack = animations.attacking;
    const originalAttackHpAnims = meta.attackHpAnims;

    // attack_25/50/75/100 等状态原本不会进入 UnitAnimPlayer 的 attacking 锚定分支。
    // 基地攻击时临时借用同一份帧作为 generic attacking，确保左右基地/PVP 都使用同一固定锚点。
    if (hpAttackAnim) {
      meta.attackHpAnims = [];
      animations.attacking = hpAttackAnim;
    }

    const activeAttackAnim = hpAttackAnim ?? animations.attacking;
    const frames = Array.isArray(activeAttackAnim?.frames) ? activeAttackAnim.frames : [];
    const originalAnchorOffsets = frames.map((frame) => frame?.anchorOffsetX);
    for (const frame of frames) {
      if (frame) frame.anchorOffsetX = 0;
    }

    const drawFootY = meta.drawFootY;
    const hadAttackFoot = Boolean(drawFootY && Object.prototype.hasOwnProperty.call(drawFootY, 'attacking'));
    const originalAttackFoot = drawFootY?.attacking;
    if (drawFootY) {
      const stableFoot = drawFootY.default ?? drawFootY.moving ?? drawFootY.flying;
      if (stableFoot != null) drawFootY.attacking = stableFoot;
    }

    try {
      return originalDraw(ctx, unit, engine, boxX, boxY, boxW, boxH, options);
    } finally {
      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        if (!frame) continue;
        const value = originalAnchorOffsets[index];
        if (value === undefined) delete frame.anchorOffsetX;
        else frame.anchorOffsetX = value;
      }

      if (drawFootY) {
        if (hadAttackFoot) drawFootY.attacking = originalAttackFoot;
        else delete drawFootY.attacking;
      }

      if (hpAttackAnim) {
        meta.attackHpAnims = originalAttackHpAnims;
        if (originalGenericAttack === undefined) delete animations.attacking;
        else animations.attacking = originalGenericAttack;
      }
    }
  };
}
