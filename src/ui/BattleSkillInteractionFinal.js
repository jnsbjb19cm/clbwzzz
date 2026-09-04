import { getSkillAnimationDuration } from '../battle/SkillAnimationConfig.js';
import { BattleSkillSystem } from '../systems/BattleSkillSystem.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleSkillInteractionFinal');

function loadoutKey(view) {
  return (view?.engine?.skillLoadout ?? [])
    .map((skillId) => Number(skillId) || 0)
    .join('|');
}

function skillSlotsAreStable(view, root, key) {
  const slots = root?.querySelector?.('#skill-slots');
  const expected = view?.engine?.skillLoadout?.length ?? 0;
  if (!slots || !expected) return false;
  return view.__stableSkillLoadoutKey === key
    && slots.querySelectorAll('[data-skill-slot]').length === expected;
}

function syncSkillButtons(view, root) {
  const slots = root?.querySelector?.('#skill-slots');
  const engine = view?.engine;
  if (!slots || !engine?.skills) return;

  for (const button of slots.querySelectorAll('[data-skill-slot]')) {
    const slotIndex = Number(button.dataset.skillSlot);
    const skillId = Number(engine.skillLoadout?.[slotIndex]) || 0;
    if (!skillId) continue;

    const cooldown = Math.max(0, Number(engine.skills.cooldowns?.[skillId]) || 0);
    const pending = Number(engine.skills.pendingSkillId) === skillId;
    const canCast = engine.skills.canCast(skillId).ok;
    button.classList.toggle('pending', pending);
    button.classList.toggle('unavailable', !canCast);

    let cooldownNode = button.querySelector('.skill-slot-cd');
    if (cooldown > 0) {
      if (!cooldownNode) {
        cooldownNode = document.createElement('span');
        cooldownNode.className = 'skill-slot-cd';
        button.appendChild(cooldownNode);
      }
      const label = String(Math.ceil(cooldown));
      if (cooldownNode.textContent !== label) cooldownNode.textContent = label;
    } else {
      cooldownNode?.remove();
    }
  }
}

export function installBattleSkillInteractionFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  /*
   * PVP 权威快照会频繁把 lastSkillKey 清空。旧 renderSkillPanel 因而反复
   * slotsEl.innerHTML=...，导致：
   * 1) pointerdown 到 click 之间按钮节点可能被替换，用户感觉“点了技能没反应”；
   * 2) 技能栏每 50~100ms 创建/销毁一批节点，和手牌一起造成明显掉帧。
   *
   * 技能槽结构只在 loadout 改变时才需要重建；MP、冷却、pending 状态全部原地同步。
   */
  const previousRenderSkillPanel = BattleView.prototype.renderSkillPanel;
  BattleView.prototype.renderSkillPanel = function renderStableSkillPanel(root) {
    const key = loadoutKey(this);
    if (skillSlotsAreStable(this, root, key)) {
      // 抵消 PVP 快照对 lastSkillKey 的强制清空，但保留核心 key 语义。
      this.lastSkillKey = this.getSkillKey?.() ?? key;
      syncSkillButtons(this, root);
      return;
    }

    const result = previousRenderSkillPanel.call(this, root);
    this.__stableSkillLoadoutKey = key;
    syncSkillButtons(this, root);
    return result;
  };

  /*
   * 游戏状态持续时间 != “释放动画”持续时间。
   * 旧 showEffect 把 10~15 秒 buff/DoT duration 直接拿去循环播放施法动画，
   * 造成主动技能释放后法阵/全屏动画长时间残留。除陨石雨明确需要两遍外，
   * 施法动画只播放一遍；持续伤害/冻结/buff 的生命周期仍由 BattleSkillSystem
   * 的 unit 状态、activeFields、dots/hots 等逻辑维护，不受这里缩短视觉动画影响。
   */
  const previousShowEffect = BattleSkillSystem.prototype.showEffect;
  BattleSkillSystem.prototype.showEffect = function showOneShotCastEffect(skillId, effect, target) {
    if (effect?.kind === 'damage_all_enemies') {
      return previousShowEffect.call(this, skillId, effect, target);
    }

    const animationDuration = Math.max(0.08, getSkillAnimationDuration(skillId, 0.9));
    this.engine.pushSkillEffect?.(
      effect?.kind ?? 'skill',
      target,
      effect?.radius ?? 0,
      skillId,
      animationDuration,
      false,
    );
  };

  window.__verifyBattleSkillInteractionFinal = () => {
    const view = globalThis.__activeBattleWorldView ?? window.__pvpFixtureBattle ?? null;
    const slots = document.querySelector('#skill-slots');
    return {
      enabled: true,
      stableSkillDom: true,
      castFxSeparatedFromGameplayDuration: true,
      loadoutKey: view ? loadoutKey(view) : null,
      slotCount: slots?.querySelectorAll('[data-skill-slot]').length ?? 0,
      pendingSkillId: view?.engine?.skills?.pendingSkillId ?? null,
      firstSlot: slots?.querySelector('[data-skill-slot="0"]') ?? null,
    };
  };
}
