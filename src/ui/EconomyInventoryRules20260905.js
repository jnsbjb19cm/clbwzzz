import './CardBindingBadge20260905.css';
import { ItemDatabase, InventoryStore } from '../core/ItemDatabase.js';
import { CardInventoryStore } from '../core/CardInventoryStore.js';
import { BagView } from './BagView.js';
import { LoginView } from './LoginView.js';
import { SmithyView } from './SmithyView.js';
import { CardCraftSystem } from '../systems/CardCraftSystem.js';
import { MaterialCombineSystem } from '../systems/MaterialCombineSystem.js';
import { authStore } from '../core/AuthStore.js';

const ITEM_BASE_SLOTS = 120; // 原基础60格 + 60格
const ITEM_STACK_MAX = 327867;
const STARTER_PACK_VERSION = 6;
const PATCH_FLAG = Symbol.for('clbwz.economyInventoryRules20260905');

function normalizeBoundOption(options) {
  if (typeof options === 'boolean') return options;
  return Boolean(options?.bound);
}

function appendBindingBadge(button, bound, className) {
  if (!button || !bound || button.querySelector(`.${className}`)) return;
  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = '绑定';
  badge.setAttribute('aria-label', '绑定');
  button.appendChild(badge);
}

function appendBindingDetail(detail, bound, className) {
  if (!detail || detail.querySelector(`.${className}`)) return;
  const node = document.createElement('p');
  node.className = `${className}${bound ? '' : ' is-tradable'}`;
  node.textContent = bound ? '绑定' : '非绑定';
  const heading = detail.querySelector('h2');
  if (heading) heading.insertAdjacentElement('afterend', node);
  else detail.prepend(node);
}

function patchItemInventory() {
  const originalGetMaxSlots = ItemDatabase.prototype.getMaxSlots;
  ItemDatabase.prototype.getMaxSlots = function getMaxSlots20260905() {
    return Math.max(ITEM_BASE_SLOTS, Number(originalGetMaxSlots.call(this)) || 0);
  };

  const originalEnsureStarterPack = InventoryStore.prototype.ensureStarterPack;
  InventoryStore.prototype.ensureStarterPack = function ensureStarterPack20260905() {
    // 旧逻辑每次载入都会把用掉的材料补回最低量，会绕过“每账号每天50次”。
    // 现在仅允许旧存档首次升级时补一次；正常消耗后不再自动回填。
    if ((Number(this.state?.starterPackVersion) || 0) >= STARTER_PACK_VERSION) return;
    return originalEnsureStarterPack.call(this);
  };

  InventoryStore.prototype.consolidateSlots = function consolidateSlots20260905() {
    if (!this.state?.slots) return;
    const totals = new Map();
    for (const slot of this.state.slots) {
      if (!slot) continue;
      const itemId = Number(slot.itemId);
      const count = Math.max(0, Math.floor(Number(slot.count) || 0));
      if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0) continue;
      const bound = Boolean(slot.bound);
      const key = `${itemId}:${bound ? 1 : 0}`;
      const row = totals.get(key) ?? { itemId, bound, count: 0 };
      row.count += count;
      totals.set(key, row);
    }
    this.state.slots.fill(null);
    for (const row of totals.values()) {
      this.placeInSlots(this.state.slots, row.itemId, row.count, { bound: row.bound });
    }
    this.save();
  };

  InventoryStore.prototype.placeInSlots = function placeInSlots20260905(slots, itemId, count, options = {}) {
    const item = this.itemDb.getById(itemId);
    if (!item || count <= 0) return count;
    const bound = normalizeBoundOption(options);
    let left = Math.max(0, Math.floor(Number(count) || 0));

    for (let i = 0; i < slots.length && left > 0; i += 1) {
      const slot = slots[i];
      if (!slot || slot.itemId !== Number(itemId) || Boolean(slot.bound) !== bound || slot.count >= ITEM_STACK_MAX) continue;
      const add = Math.min(ITEM_STACK_MAX - slot.count, left);
      slot.count += add;
      slot.bound = bound;
      left -= add;
    }
    for (let i = 0; i < slots.length && left > 0; i += 1) {
      if (slots[i]) continue;
      const add = Math.min(ITEM_STACK_MAX, left);
      slots[i] = { itemId: Number(itemId), count: add, bound };
      left -= add;
    }
    return left;
  };

  InventoryStore.prototype.countItem = function countItem20260905(itemId, bound = null) {
    const id = Number(itemId);
    let total = 0;
    for (const slot of this.state?.slots ?? []) {
      if (!slot || slot.itemId !== id) continue;
      if (bound !== null && Boolean(slot.bound) !== Boolean(bound)) continue;
      total += Math.max(0, Number(slot.count) || 0);
    }
    return total;
  };

  InventoryStore.prototype.consumeItemDetailed = function consumeItemDetailed20260905(itemId, count, options = {}) {
    const id = Number(itemId);
    const need = Math.max(0, Math.floor(Number(count) || 0));
    if (!Number.isInteger(id) || id <= 0 || need <= 0) return { ok: false, bound: 0, unbound: 0 };
    const forcedBound = options?.bound === true ? true : options?.bound === false ? false : null;
    if (this.countItem(id, forcedBound) < need) return { ok: false, bound: 0, unbound: 0 };

    let left = need;
    let boundUsed = 0;
    let unboundUsed = 0;
    // 默认优先消耗非绑定，只有非绑定不足时才动绑定材料。
    const order = forcedBound === null ? [false, true] : [forcedBound];
    for (const useBound of order) {
      for (let i = 0; i < this.state.slots.length && left > 0; i += 1) {
        const slot = this.state.slots[i];
        if (!slot || slot.itemId !== id || Boolean(slot.bound) !== useBound) continue;
        const take = Math.min(slot.count, left);
        slot.count -= take;
        left -= take;
        if (useBound) boundUsed += take;
        else unboundUsed += take;
        if (slot.count <= 0) this.state.slots[i] = null;
      }
    }
    this.save();
    return { ok: left === 0, bound: boundUsed, unbound: unboundUsed };
  };

  InventoryStore.prototype.consumeItem = function consumeItem20260905(itemId, count, options = {}) {
    return this.consumeItemDetailed(itemId, count, options).ok;
  };

  InventoryStore.prototype.wouldConsumeBound = function wouldConsumeBound20260905(itemId, count) {
    const need = Math.max(0, Math.floor(Number(count) || 0));
    return need > 0 && this.countItem(itemId, false) < need;
  };

  InventoryStore.prototype.restoreConsumed = function restoreConsumed20260905(itemId, consumed) {
    if (!consumed) return;
    if (consumed.unbound > 0) this.placeInSlots(this.state.slots, itemId, consumed.unbound, { bound: false });
    if (consumed.bound > 0) this.placeInSlots(this.state.slots, itemId, consumed.bound, { bound: true });
    this.save();
  };

  InventoryStore.prototype.addItem = function addItem20260905(itemId, count = 1, options = {}) {
    if (!Number.isInteger(count) || count <= 0) return false;
    const bound = normalizeBoundOption(options);
    let left = this.placeInSlots(this.state.slots, itemId, count, { bound });
    while (left > 0 && this.state.slotCount < this.itemDb.getMaxSlots()) {
      this.state.slotCount += 1;
      this.state.slots.push(null);
      left = this.placeInSlots(this.state.slots, itemId, left, { bound });
    }
    this.save();
    return left === 0;
  };

  InventoryStore.prototype.grantItems = function grantItems20260905(entries, label, options = {}) {
    const bound = normalizeBoundOption(options);
    this.consolidateSlots();
    const failed = [];
    for (const entry of entries ?? []) {
      const itemId = Number(entry?.itemId);
      const count = Math.max(0, Math.floor(Number(entry?.count) || 0));
      if (!itemId || !count) continue;
      if (!this.addItem(itemId, count, { bound })) {
        const item = this.itemDb.getById(itemId);
        failed.push({ itemId, name: item?.name ?? itemId, left: count });
      }
    }
    this.save();
    return { ok: failed.length === 0, failed, label, bound };
  };

  InventoryStore.prototype.grantBoundRefill = function grantBoundRefill20260905(entries) {
    return this.grantItems(entries, '绑定强化/制作材料', { bound: true });
  };

  const originalLoad = InventoryStore.prototype.load;
  InventoryStore.prototype.load = function load20260905() {
    const state = originalLoad.call(this);
    for (const item of this.itemDb?.items ?? []) item.maxStack = ITEM_STACK_MAX;
    for (const slot of this.state?.slots ?? []) {
      if (slot) slot.bound = Boolean(slot.bound);
    }
    if (this.state.slotCount < ITEM_BASE_SLOTS) this.state.slotCount = ITEM_BASE_SLOTS;
    while (this.state.slots.length < this.state.slotCount) this.state.slots.push(null);
    this.consolidateSlots();
    this.save();
    return state;
  };
}

function patchCardBinding() {
  const originalAddCard = CardInventoryStore.prototype.addCard;
  CardInventoryStore.prototype.addCard = function addCardBound20260905(cardId, star = 0, opts = {}) {
    const result = originalAddCard.call(this, cardId, star, opts);
    if (result?.ok && Number.isInteger(result.index)) {
      const slot = this.state.slots[result.index];
      if (slot) slot.bound = Boolean(opts?.bound);
      this.save();
    }
    return result;
  };
}

function patchCraftBinding() {
  const originalCraft = CardCraftSystem.prototype.craft;
  CardCraftSystem.prototype.craft = function craftBound20260905(targetCardId, inventory, cardInventory, craftState, opts = {}) {
    const target = this.db.getById(targetCardId);
    const level = target ? Math.min(4, Math.max(1, Number(target.quality) || 1)) : 1;
    const cfg = this.materials.getLevelConfig(level);
    const need = this.rules.materialsPerCraft;
    const craftBound = Boolean(cfg && (
      inventory.wouldConsumeBound?.(cfg.parchment, need.parchment)
      || inventory.wouldConsumeBound?.(cfg.gem, need.gem)
      || (opts.useCharm && inventory.wouldConsumeBound?.(cfg.charm, 1))
      || (opts.useDna && inventory.wouldConsumeBound?.(cfg.dna, 1))
    ));

    const addCard = cardInventory.addCard;
    cardInventory.addCard = function addCraftedCardBound(cardId, star = 0, addOpts = {}) {
      return addCard.call(this, cardId, star, { ...addOpts, bound: craftBound });
    };
    try {
      const result = originalCraft.call(this, targetCardId, inventory, cardInventory, craftState, opts);
      if (result?.ok && result?.cardId) result.bound = craftBound;
      return result;
    } finally {
      cardInventory.addCard = addCard;
    }
  };

  MaterialCombineSystem.prototype.combine = function combineBound20260905(inventory, type, fromLevel) {
    const check = this.canCombine(inventory, type, fromLevel);
    if (!check.ok) return check;
    const consumed = inventory.consumeItemDetailed?.(check.fromId, check.ratio)
      ?? { ok: inventory.consumeItem(check.fromId, check.ratio), bound: 0, unbound: check.ratio };
    if (!consumed.ok) return { ok: false, error: '材料扣除失败' };
    const outputBound = Number(consumed.bound) > 0;
    if (!inventory.addItem(check.toId, 1, { bound: outputBound })) {
      inventory.restoreConsumed?.(check.fromId, consumed);
      return { ok: false, error: '背包已满，合成材料未消耗' };
    }
    const item = this.materials.getItem(check.toId);
    return {
      ok: true,
      itemName: item?.name ?? '',
      toLevel: check.toLevel,
      bound: outputBound,
    };
  };
}

function patchBagBindingAndRefill() {
  const originalBindModeEvents = BagView.prototype.bindModeEvents;
  BagView.prototype.bindModeEvents = function bindModeEvents20260905(root) {
    originalBindModeEvents.call(this, root);
    // 正式账号不再保留可绕过每日补发限制的顶部测试补发入口。
    root.querySelector('#bag-debug-btn')?.remove();
  };

  const originalRenderToolbar = BagView.prototype.renderToolbar;
  BagView.prototype.renderToolbar = function renderToolbar20260905(root) {
    originalRenderToolbar.call(this, root);
    if (this.mode !== 'item') return;

    root.querySelector('#bag-grant-powder')?.remove();
    root.querySelector('#bag-reset')?.remove();
    const oldButton = root.querySelector('#bag-grant-mat');
    if (!oldButton) return;
    const button = oldButton.cloneNode(true);
    button.textContent = '补发绑定材料';
    button.title = '每天最多50次；每次强化粉、羊皮纸、宝石、保护符、DNA等各100个，全部绑定';
    oldButton.replaceWith(button);
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = '补发中…';
      try {
        const data = await authStore.api.post('/player/material-refill', {});
        const local = this.inventory.grantBoundRefill(data.items ?? []);
        this.refresh(root);
        if (!local.ok) {
          this.toast(root, `服务器已补发，但本地背包空间不足：${local.failed.map((f) => f.name).join('、')}`);
        } else {
          this.toast(root, `已补发全部绑定材料各100个；今日 ${data.claimCount}/${data.dailyLimit} 次，剩余 ${data.remaining} 次`);
        }
      } catch (error) {
        this.toast(root, error?.message || '材料补发失败');
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });
  };

  const originalRenderItemGrid = BagView.prototype.renderItemGrid;
  BagView.prototype.renderItemGrid = function renderItemGridBound20260905(root, grid) {
    originalRenderItemGrid.call(this, root, grid);
    for (const button of grid.querySelectorAll('.bag-slot:not(.empty)')) {
      const slot = this.inventory.getSlots()[Number(button.dataset.index)];
      appendBindingBadge(button, Boolean(slot?.bound), 'bag-item-binding-badge');
    }
  };

  const originalRenderCardGrid = BagView.prototype.renderCardGrid;
  BagView.prototype.renderCardGrid = function renderCardGridBound20260905(root, grid) {
    originalRenderCardGrid.call(this, root, grid);
    for (const button of grid.querySelectorAll('.bag-slot:not(.empty)')) {
      const slot = this.cardInventory.getSlots()[Number(button.dataset.index)];
      appendBindingBadge(button, Boolean(slot?.bound), 'bag-card-bound-badge');
    }
  };

  const originalRenderItemDetail = BagView.prototype.renderItemDetail;
  BagView.prototype.renderItemDetail = function renderItemDetailBound20260905(root) {
    originalRenderItemDetail.call(this, root);
    const slot = this.inventory.getSlots()[this.selectedIndex];
    appendBindingDetail(root.querySelector('#bag-detail'), Boolean(slot?.bound), 'bag-item-binding-detail');
  };

  const originalRenderCardDetail = BagView.prototype.renderCardDetail;
  BagView.prototype.renderCardDetail = function renderCardDetailBound20260905(root) {
    originalRenderCardDetail.call(this, root);
    const slot = this.cardInventory.getSlots()[this.selectedIndex];
    appendBindingDetail(root.querySelector('#bag-detail'), Boolean(slot?.bound), 'bag-card-bound-detail');
  };
}

function patchSmithyRules() {
  const originalOpenRules = SmithyView.prototype.openRulesDialog;
  if (typeof originalOpenRules !== 'function') return;
  SmithyView.prototype.openRulesDialog = function openRulesDialogBound20260905(root) {
    originalOpenRules.call(this, root);
    const list = root.querySelector('[data-smithy-rule-list]');
    if (!list || list.querySelector('[data-binding-rule]')) return;
    const li = document.createElement('li');
    li.dataset.bindingRule = 'true';
    li.textContent = '绑定规则：只要本次制作或加工实际消耗了任意绑定材料，最终产物一定为绑定；加工、合成不能解除绑定状态。';
    list.appendChild(li);
  };
}

function patchLoginIdentifier() {
  const originalRender = LoginView.prototype.render;
  LoginView.prototype.render = function renderIdentifier20260905(root) {
    originalRender.call(this, root);
    const input = root.querySelector('#login-username');
    const label = input?.closest('.login-field')?.querySelector('span');
    if (label && this.mode === 'login') label.textContent = '账号或游戏昵称';
    if (input) input.placeholder = '登录可填写账号或游戏昵称';
  };

  const originalSetMode = LoginView.prototype.setMode;
  LoginView.prototype.setMode = function setModeIdentifier20260905(mode) {
    originalSetMode.call(this, mode);
    const input = this.root?.querySelector('#login-username');
    const label = input?.closest('.login-field')?.querySelector('span');
    if (label) label.textContent = this.mode === 'register' ? '账号（3 位以上）' : '账号或游戏昵称';
    if (input) input.placeholder = this.mode === 'register' ? '' : '账号 / 游戏昵称';
    const sub = this.root?.querySelector('#login-sub');
    if (sub && this.mode === 'login') sub.textContent = '使用账号或游戏昵称进入魔幻森林';
  };

  const originalSubmit = LoginView.prototype.submit;
  LoginView.prototype.submit = async function submitIdentifier20260905() {
    if (this.mode !== 'login') return originalSubmit.call(this);
    if (this.busy) return;
    const identifier = this.root.querySelector('#login-username')?.value?.trim() ?? '';
    const password = this.root.querySelector('#login-password')?.value ?? '';
    if (!identifier) return this.setError('请输入账号或游戏昵称');
    if (password.length < 6) return this.setError('密码至少 6 位');

    this.busy = true;
    const btn = this.root.querySelector('#login-submit');
    btn.disabled = true;
    btn.textContent = '请稍候…';
    this.setError('');
    try {
      const result = await authStore.login({ username: identifier, password });
      this.busy = false;
      btn.disabled = false;
      const successMeta = { isNewAccount: false, nickname: result?.snapshot?.profile?.nickname ?? '' };
      if (result?.recoveryCode) this.showRecoveryCode(result.recoveryCode, 'game', successMeta);
      else this.onSuccess?.(successMeta);
    } catch (error) {
      this.setError(error?.message || '登录失败');
      this.busy = false;
      btn.disabled = false;
      btn.textContent = '登录';
    }
  };
}

export function installEconomyInventoryRules20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  patchItemInventory();
  patchCardBinding();
  patchCraftBinding();
  patchBagBindingAndRefill();
  patchSmithyRules();
  patchLoginIdentifier();
}

export const ECONOMY_ITEM_RULES_20260905 = Object.freeze({
  baseSlots: ITEM_BASE_SLOTS,
  maxStack: ITEM_STACK_MAX,
  refillDailyLimit: 50,
  refillPerItem: 100,
});
