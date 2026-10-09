import { authStore } from '../core/AuthStore.js';
import { BagView } from './BagView.js';

const PATCH_FLAG = Symbol.for('clbwz.batchInventoryDatabaseFix20260908');

function applyProfile(view, profile) {
  if (!view?.player || !profile) return;
  const map = {
    level: profile.level,
    exp: profile.exp,
    hp: profile.hp,
    gold: profile.gold,
    gem: profile.diamond ?? profile.gem,
    honor: profile.honor,
    arena: profile.arena,
  };
  for (const [key, raw] of Object.entries(map)) {
    const value = Number(raw);
    if (Number.isFinite(value)) view.player[key] = value;
  }
}

function applyItems(view, data) {
  if (!view?.inventory?.state || !Array.isArray(data?.items)) return;
  const currentSlots = Math.max(120, Number(view.inventory.state.slotCount) || 120);
  const serverSlots = Math.max(120, Number(data?.itemBag?.slotCount) || 0);
  const slotCount = Math.max(currentSlots, serverSlots, data.items.length);
  const slots = Array.from({ length: slotCount }, () => null);
  let cursor = 0;
  for (const raw of data.items) {
    const itemId = Number(raw?.itemId);
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0 || cursor >= slots.length) continue;
    slots[cursor++] = {
      itemId,
      count,
      bound: Boolean(raw?.bound ?? raw?.isBound),
    };
  }
  view.inventory.state = { ...view.inventory.state, slotCount, slots };
  view.inventory.save?.();
}

function applyServerData(view, data) {
  applyProfile(view, data?.profile);
  if (view?.player && data?.extraResources) {
    const stamina = Number(data.extraResources.stamina);
    if (Number.isFinite(stamina)) view.player.stamina = stamina;
  }
  applyItems(view, data);
  if (data?.cardInventory && view?.cardInventory?.applyServerSnapshot) {
    view.cardInventory.applyServerSnapshot(data.cardInventory);
  }
  view?.onPlayerUpdate?.();
}

function countSameBinding(view, itemId, bound) {
  return (view?.inventory?.getSlots?.() ?? []).reduce((sum, slot) => {
    if (!slot || Number(slot.itemId) !== Number(itemId) || Boolean(slot.bound) !== Boolean(bound)) return sum;
    return sum + Math.max(0, Math.floor(Number(slot.count) || 0));
  }, 0);
}

function findSameBinding(view, itemId, bound) {
  return (view?.inventory?.getSlots?.() ?? []).findIndex((slot) => (
    slot
    && Number(slot.itemId) === Number(itemId)
    && Boolean(slot.bound) === Boolean(bound)
    && Number(slot.count) > 0
  ));
}

function replaceNode(node) {
  if (!node) return null;
  const clone = node.cloneNode(true);
  node.replaceWith(clone);
  return clone;
}

function installBatchPanelAuthority(view, root) {
  if (view.mode !== 'item' || view.selectedIndex < 0) return;
  const selectedSlot = view.inventory?.getSlots?.()?.[view.selectedIndex];
  if (!selectedSlot) return;
  const item = view.itemDb?.getById?.(selectedSlot.itemId);
  if (!item) return;
  // 不可使用的道具不接管（保持 BagView 的「不可使用」按钮）。
  if (!view.itemUse?.isUsable?.(item)) return;
  // 2026-10-09（用户报「改名卡请在背包中点击使用」）：改名卡(98) 必须走 BagView 自己的改名弹窗，
  // 通用 /inventory/use 会 400 拒绝。
  if (Number(item.id) === 98) return;

  const oldUseButton = root?.querySelector?.('#bag-detail #bag-use');
  if (!oldUseButton || oldUseButton.dataset.databaseBatchAuthority === 'true') return;

  const itemId = Number(item.id);
  const bound = Boolean(selectedSlot.bound);
  // 数量统一读 BagView 自己的控件（滑块或填数字，两者始终同步在同一处）。
  const detail = root.querySelector('#bag-detail');
  const amountInput = detail?.querySelector?.('[data-trade-count]');
  const amountRange = detail?.querySelector?.('[data-trade-range]');

  // 克隆按钮以去掉 BagView 挂的「本地使用」监听，避免同一份物品被扣两次。
  const useButton = replaceNode(oldUseButton);
  if (!useButton) return;
  useButton.dataset.databaseBatchAuthority = 'true';

  const amountOf = () => Math.max(1, Math.floor(Number(amountInput?.value) || 1));
  const syncLabel = () => {
    const amount = amountOf();
    useButton.textContent = amount > 1 ? `批量打开/使用 ×${amount}` : '打开/使用';
  };
  syncLabel();
  amountInput?.addEventListener('input', syncLabel);
  amountInput?.addEventListener('change', syncLabel);
  amountRange?.addEventListener('input', syncLabel);

  const perform = async (requested) => {
    const total = countSameBinding(view, itemId, bound);
    if (total <= 0) {
      view.toast(root, '该道具已经用完');
      return;
    }
    const amount = Math.max(1, Math.min(total, Math.floor(Number(requested) || 1)));
    useButton.disabled = true;
    const originalText = useButton.textContent;
    useButton.textContent = `数据库处理中 ${amount} 个…`;
    try {
      const data = await authStore.api.post('/player/inventory/use', {
        itemId,
        count: amount,
        bound,
      });
      applyServerData(view, data);
      const nextIndex = findSameBinding(view, itemId, bound);
      view.selectedIndex = nextIndex >= 0 ? nextIndex : -1;
      view.refresh(root);
      const used = Math.max(1, Number(data?.used) || amount);
      const detailText = String(data?.message || '').trim();
      view.toast(root, detailText
        ? `${detailText}（已从数据库扣除 ${used} 个）`
        : (used > 1 ? `已从数据库扣除并使用 ${used} 个「${item.name}」` : `已从数据库扣除并使用「${item.name}」`));
    } catch (error) {
      useButton.disabled = false;
      useButton.textContent = originalText;
      syncLabel();
      view.toast(root, error?.message || '使用失败，数据库未扣除');
    }
  };

  useButton.addEventListener('click', () => {
    void perform(amountOf());
  });
}

export function installBatchInventoryDatabaseFix20260908() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderItemDetail = BagView.prototype.renderItemDetail;
  BagView.prototype.renderItemDetail = function renderItemDetailBatchDatabaseFix20260908(root) {
    const result = previousRenderItemDetail.call(this, root);
    installBatchPanelAuthority(this, root);
    return result;
  };
}
