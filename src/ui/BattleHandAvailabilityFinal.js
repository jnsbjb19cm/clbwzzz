import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleHandAvailabilityFinal');

function applyHandAvailability(view, root) {
  const hand = root?.querySelector?.('#hand');
  const engine = view?.engine;
  if (!hand || !engine) return;

  for (const button of hand.querySelectorAll('[data-hand-idx]')) {
    const handIndex = Number(button.dataset.handIdx);
    const entry = engine.deck?.[handIndex];
    const card = entry?.card;
    if (!card) continue;

    const cooldown = Math.max(0, Number(engine.cooldowns?.[handIndex]) || 0);
    const cost = engine.getDeployCost(card);
    const resourceLow = !engine.trainingMode
      && (engine.sunlight < cost.sun || engine.food < cost.food);
    const cooling = !engine.trainingMode && cooldown > 0;
    const blocked = engine.status !== 'playing' || cooling || resourceLow;
    if (!button.dataset.readyTitle) {
      button.dataset.readyTitle = button.title || `${card.name}(拖拽到战场放置)`;
    }

    button.classList.toggle('state-cooling', cooling);
    button.classList.toggle('state-resource-low', !cooling && resourceLow);
    button.classList.toggle('state-ready', !blocked);
    button.classList.toggle('unavailable', blocked);
    button.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    const selected = Boolean(engine.placingActive && engine.selectedHandIndex === handIndex);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const nativeDragEnabled = !hand.classList.contains('pointer-drag-hand') && !blocked;
    button.draggable = nativeDragEnabled;
    button.setAttribute('draggable', String(nativeDragEnabled));
    button.dataset.handState = cooling ? 'cooldown' : resourceLow ? 'resource-low' : 'ready';

    let badge = button.querySelector('.slot-state-badge');
    if (cooling) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'slot-state-badge';
        button.appendChild(badge);
      }
      const seconds = String(Math.ceil(cooldown));
      if (badge.textContent !== seconds) badge.textContent = seconds;
      badge.setAttribute('aria-label', `冷却剩余${seconds}秒`);
      button.title = `${card.name}：冷却剩余 ${seconds} 秒`;
    } else {
      badge?.remove();
      if (resourceLow) {
        const missing = [];
        if (engine.sunlight < cost.sun) missing.push(`阳光${cost.sun}`);
        if (engine.food < cost.food) missing.push(`食物${cost.food}`);
        button.title = `${card.name}：资源不足(需要${missing.join('、')})`;
      } else if (!blocked) {
        button.title = button.dataset.readyTitle;
      }
    }
  }
}

function handStructureKey(view) {
  return (view?.engine?.deck ?? []).map((entry, index) => {
    const card = entry?.card ?? {};
    const instance = entry?.instance ?? {};
    return [
      index,
      card.id ?? '',
      card.spriteRes ?? '',
      card.card_quality ?? card.quality ?? '',
      instance.craftQuality ?? '',
      instance.star ?? instance.strengthLv ?? '',
    ].join(':');
  }).join('|');
}

function hasStableHandDom(view, root, structureKey) {
  const hand = root?.querySelector?.('#hand');
  if (!hand || !view?.engine?.deck) return false;
  const buttons = hand.querySelectorAll('[data-hand-idx]');
  return view.__stableHandStructureKey === structureKey
    && buttons.length >= view.engine.deck.length
    && buttons.length > 0;
}

export function installBattleHandAvailabilityFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  /*
   * 手牌 DOM 只能在“结构状态”变化时重建。
   * 旧 getHandKey 把 sunlight / food 放进 key；资源自然回复会导致整排 hand.innerHTML 重建，
   * 冷却液面随即被销毁再创建，视觉上就是卡槽冷却闪烁。
   *
   * PVP 还有第二层问题：20Hz 权威快照会把 view.lastHandKey 强制清空。即使 getHandKey
   * 已经稳定，下一次 renderHand 仍会因为 lastHandKey='' 重建整排 DOM。这里使用独立的
   * __stableHandRenderKey 守卫真实 DOM；只要结构没变，就原地更新资源/冷却状态，不受
   * 快照清空 lastHandKey 影响。
   */
  const originalGetHandKey = BattleView.prototype.getHandKey;
  BattleView.prototype.getHandKey = function getStableHandKey() {
    if (!this.engine?.deck) return originalGetHandKey.call(this);
    const cooldownPhase = this.engine.deck
      .map((_, index) => `${index}:${(Number(this.engine.cooldowns?.[index]) || 0) > 0 ? 1 : 0}`)
      .join('|');
    return [
      this.engine.selectedHandIndex ?? -1,
      this.engine.placingActive ? 1 : 0,
      this.engine.status ?? 'playing',
      cooldownPhase,
    ].join('|');
  };

  const previousSyncCooldown = BattleView.prototype.syncCooldownOverlay;
  BattleView.prototype.syncCooldownOverlay = function syncCooldownWithDistinctStates(root) {
    const result = previousSyncCooldown.call(this, root);
    applyHandAvailability(this, root);
    return result;
  };

  const previousRenderHand = BattleView.prototype.renderHand;
  BattleView.prototype.renderHand = function renderHandWithStableDom(root) {
    const key = this.getHandKey();
    const structureKey = handStructureKey(this);
    if (hasStableHandDom(this, root, structureKey)) {
      // 核心/PVP 补丁即使把 lastHandKey 清空，也把它恢复到真实结构 key，避免重建。
      this.lastHandKey = key;
      applyHandAvailability(this, root);
      return;
    }

    // The exact renderer also guards on lastHandKey. A deck/quality structure
    // change must bypass that state-only guard and rebuild exactly once.
    this.lastHandKey = '';
    const result = previousRenderHand.call(this, root);
    this.__stableHandStructureKey = structureKey;
    this.lastHandKey = key;
    applyHandAvailability(this, root);
    return result;
  };

  window.__verifyBattleHandAvailabilityFinal = () => {
    const hand = document.querySelector('#hand');
    const first = hand?.querySelector('[data-hand-idx="0"]');
    return {
      enabled: true,
      stableResourceKey: true,
      snapshotDomGuard: true,
      cooling: document.querySelectorAll('#hand .deck-slot.state-cooling').length,
      resourceLow: document.querySelectorAll('#hand .deck-slot.state-resource-low').length,
      ready: document.querySelectorAll('#hand .deck-slot.state-ready').length,
      firstNode: first ?? null,
    };
  };
}
