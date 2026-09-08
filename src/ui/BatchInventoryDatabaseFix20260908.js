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

  const panel = root?.querySelector?.('#bag-detail .bag-batch-use');
  const oldUseButton = root?.querySelector?.('#bag-detail #bag-use');
  if (!panel || !oldUseButton) return;

  const itemId = Number(item.id);
  const bound = Boolean(selectedSlot.bound);
  const oldInput = panel.querySelector('[data-batch-use-count]');
  const initialRequested = Math.max(1, Math.floor(Number(oldInput?.value) || 1));

  panel.innerHTML = `
    <div class="bag-batch-use-row">
      <span>使用数量</span>
      <input type="number" min="1" step="1" value="1" data-batch-use-count aria-label="批量使用数量" />
      <button type="button" data-batch-use-quick="1">1个</button>
      <button type="button" data-batch-use-quick="10">10个</button>
      <button type="button" data-batch-use-quick="all">填入全部</button>
      <button type="button" class="bag-use-all-now" data-batch-use-now-all>一键使用全部</button>
    </div>
    <small>数量与下方“批量打开/使用”按钮实时联动；所有消耗和奖励先写数据库，再刷新背包。</small>`;

  const useButton = replaceNode(oldUseButton);
  if (!useButton) return;
  useButton.dataset.databaseBatchAuthority = 'true';

  const input = panel.querySelector('[data-batch-use-count]');
  const allNowButton = panel.querySelector('[data-batch-use-now-all]');
  const quickButtons = [...panel.querySelectorAll('[data-batch-use-quick]')];
  const controls = [input, useButton, allNowButton, ...quickButtons].filter(Boolean);

  const available = () => countSameBinding(view, itemId, bound);
  const sync = (preferred = null) => {
    const total = available();
    const max = Math.max(1, total);
    const raw = preferred == null ? Number(input.value) : Number(preferred);
    const amount = Math.max(1, Math.min(max, Math.floor(raw) || 1));
    input.max = String(max);
    input.value = String(amount);
    useButton.textContent = amount > 1 ? `批量打开/使用 ×${amount}` : '打开/使用';
    if (allNowButton) allNowButton.textContent = `一键使用全部 ×${total}`;
    useButton.disabled = total <= 0;
    if (allNowButton) allNowButton.disabled = total <= 0;
    return amount;
  };

  sync(Math.min(initialRequested, Math.max(1, available())));
  input.addEventListener('input', () => sync());
  input.addEventListener('change', () => sync());

  for (const button of quickButtons) {
    button.addEventListener('click', () => {
      const total = available();
      const raw = button.dataset.batchUseQuick;
      sync(raw === 'all' ? total : Number(raw) || 1);
    });
  }

  const perform = async (requested) => {
    const total = available();
    if (total <= 0) {
      view.toast(root, '该道具已经用完');
      return;
    }
    const amount = Math.max(1, Math.min(total, Math.floor(Number(requested) || 1));
    controls.forEach((control) => { control.disabled = true; });
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
      view.toast(root, used > 1
        ? `已从数据库扣除并使用 ${used} 个「${item.name}」`
        : `已从数据库扣除并使用「${item.name}」`);
    } catch (error) {
      controls.forEach((control) => { control.disabled = false; });
      sync();
      view.toast(root, error?.message || '批量使用失败，数据库未扣除');
    }
  };

  useButton.addEventListener('click', () => {
    void perform(sync());
  });
  allNowButton?.addEventListener('click', () => {
    const total = available();
    sync(total);
    void perform(total);
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
