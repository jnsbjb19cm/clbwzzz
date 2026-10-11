/**
 * 战斗内手牌卡槽：竖长方形（2026-10-11 用户要求）
 *
 * 背景（为什么不用 CSS）：
 *   实测 + 控制台验证过 —— 沉浸式战斗里卡槽尺寸由多条高权重规则 + flex 决定：
 *     body.battle-immersive .battle-fullscreen-final #hand .deck-slot { width: auto !important; }  ← 3 class + 1 id
 *     #hand .deck-slot { width/min-width/max-width/flex-basis: var(--hand-slot-w); }               ← 变量由 JS 内联写
 *   我在样式表里加了 5 版 !important / 换权重 / 换文件都不是"没生效"就是"越改越小"。
 *   而**内联样式**是唯一压得住的层级（游戏自己就是这么写 --hand-slot-w 的）。
 *   → 所以这里用 JS 直接给每个卡槽写死内联尺寸，并把外层容器一起撑高（否则 overflow:hidden 会裁掉）。
 *
 * 效果：宽 W 窄、高 H 长 → 竖长方形。要改就改下面两个数字。
 */

const SLOT_W = 74;      // 宽度保持设计值（= 原来的 --hand-slot-w），不做窄化（用户：62 太细了）
const SLOT_H = 116;     // 高度加长 → 竖长方形（宽 74 : 高 116 ≈ 1:1.57）

const FLAG = Symbol.for('clbwz.battleHandSlotShape20261011');
const STYLE_ID = 'clbwz-hand-slot-shape-20261011';

function applyToHand(hand) {
  if (!(hand instanceof HTMLElement)) return;
  const slots = hand.querySelectorAll('.deck-slot');
  if (!slots.length) return;
  for (const slot of slots) {
    slot.style.setProperty('width', `${SLOT_W}px`, 'important');
    slot.style.setProperty('min-width', `${SLOT_W}px`, 'important');
    slot.style.setProperty('max-width', `${SLOT_W}px`, 'important');
    slot.style.setProperty('flex', `0 0 ${SLOT_W}px`, 'important');
    slot.style.setProperty('flex-basis', `${SLOT_W}px`, 'important');
    slot.style.setProperty('height', `${SLOT_H}px`, 'important');
    slot.style.setProperty('min-height', `${SLOT_H}px`, 'important');
    slot.style.setProperty('max-height', `${SLOT_H}px`, 'important');
    slot.style.setProperty('aspect-ratio', 'auto', 'important');
  }
  // 容器：撑高 + 不再裁切（否则竖长方形会被 overflow:hidden 截掉上下）
  hand.style.setProperty('height', `${SLOT_H + 8}px`, 'important');
  hand.style.setProperty('min-height', `${SLOT_H + 8}px`, 'important');
  hand.style.setProperty('flex-basis', `${SLOT_H + 8}px`, 'important');
  hand.style.setProperty('overflow', 'visible', 'important');
  hand.style.setProperty('align-items', 'stretch', 'important');
  const holder = hand.closest('.slots-container');
  if (holder) {
    holder.style.setProperty('height', `${SLOT_H + 16}px`, 'important');
    holder.style.setProperty('min-height', `${SLOT_H + 16}px`, 'important');
    holder.style.setProperty('overflow', 'visible', 'important');
    holder.style.setProperty('align-items', 'flex-end', 'important');
  }
}

export function installBattleHandSlotShape20261011() {
  if (globalThis[FLAG]) return;
  globalThis[FLAG] = true;

  const run = () => {
    try {
      for (const hand of document.querySelectorAll('#hand')) applyToHand(hand);
    } catch { /* 忽略：形状调整失败不影响战斗 */ }
  };

  // 1) 立刻跑一次
  run();
  // 2) 手牌是反复重渲染的 → 用 MutationObserver 跟着跑
  try {
    const observer = new MutationObserver(() => run());
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  } catch { /* 忽略 */ }
  // 3) 路由切换 / 窗口变化时也补一次
  window.addEventListener('clbwz:route', run);
  window.addEventListener('resize', run);
  setInterval(run, 1500);

  console.info(`[clbwz] 战斗内卡槽形状已启用：宽 ${SLOT_W}px / 高 ${SLOT_H}px（竖长方形）`);
}
