import { BagView } from './BagView.js';
import { FriendView } from './FriendView.js';

const PATCH_FLAG = Symbol.for('clbwz.playerQoL20260905');
const CARD_TARGET_ITEMS = new Set([80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91]);

function ensureBatchStyle() {
  if (typeof document === 'undefined' || document.querySelector('#batch-item-use-style-20260905')) return;
  const style = document.createElement('style');
  style.id = 'batch-item-use-style-20260905';
  style.textContent = `
    .bag-batch-use{margin:10px 0 6px;padding:8px;border:1px solid rgba(180,197,174,.42);border-radius:8px;background:rgba(17,27,22,.38)}
    .bag-batch-use-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .bag-batch-use-row>span{font-size:12px;color:#d8e2d5;margin-right:2px}
    .bag-batch-use input{width:72px;min-width:0;padding:5px 6px;border:1px solid #71826c;border-radius:6px;background:#182019;color:#fff;text-align:center}
    .bag-batch-use button{padding:5px 9px;border:1px solid #6c8066;border-radius:6px;background:#2c3b2b;color:#eef4e9;cursor:pointer}
    .bag-batch-use button:hover{filter:brightness(1.08)}
    .bag-batch-use small{display:block;margin-top:5px;color:#9eaa9a;font-size:10px;line-height:1.4}
  `;
  document.head.appendChild(style);
}

function matchingItemIndex(view, itemId, preferredIndex = -1) {
  const slots = view.inventory?.getSlots?.() ?? [];
  if (preferredIndex >= 0 && slots[preferredIndex]?.itemId === Number(itemId) && slots[preferredIndex]?.count > 0) {
    return preferredIndex;
  }
  return slots.findIndex((slot) => slot?.itemId === Number(itemId) && Number(slot.count) > 0);
}

function enhanceBatchUse(view, root) {
  const detail = root?.querySelector?.('#bag-detail');
  if (!detail || view.mode !== 'item' || view.selectedIndex < 0) return;
  const slot = view.inventory?.getSlots?.()?.[view.selectedIndex];
  if (!slot) return;
  const item = view.itemDb?.getById?.(slot.itemId);
  if (!item || !view.itemUse?.isUsable?.(item)) return;

  const useButton = detail.querySelector('#bag-use');
  if (!useButton || useButton.dataset.batchUseBound === 'true') return;

  const needsCardPicker = CARD_TARGET_ITEMS.has(Number(item.id));
  if (needsCardPicker) {
    // 这类道具每次都必须重新选择目标卡牌，不能无目标地连续消耗。
    useButton.title = '该道具需要选择目标卡牌，请逐个使用';
    useButton.dataset.batchUseBound = 'true';
    return;
  }

  ensureBatchStyle();
  const maxCount = Math.max(1, Math.floor(Number(slot.count) || 1));
  const panel = document.createElement('div');
  panel.className = 'bag-batch-use';
  panel.innerHTML = `
    <div class="bag-batch-use-row">
      <span>使用数量</span>
      <input type="number" min="1" max="${maxCount}" step="1" value="${Math.min(10, maxCount)}" data-batch-use-count aria-label="批量使用数量" />
      <button type="button" data-batch-use-quick="1">1个</button>
      <button type="button" data-batch-use-quick="10">10个</button>
      <button type="button" data-batch-use-quick="all">全部</button>
    </div>
    <small>礼盒、卡包、药水和直接使用型道具支持批量使用；需要选择目标卡牌的洗练/技能类道具仍逐个使用。</small>`;
  const actions = detail.querySelector('.bag-detail-actions');
  actions?.insertAdjacentElement('beforebegin', panel);

  // 克隆按钮去掉 BagView 原来的单次使用监听，统一改为数量驱动。
  const batchButton = useButton.cloneNode(true);
  batchButton.dataset.batchUseBound = 'true';
  useButton.replaceWith(batchButton);

  const input = panel.querySelector('[data-batch-use-count]');
  const clampAndSync = () => {
    const selectedSlot = view.inventory?.getSlots?.()?.[view.selectedIndex];
    const available = Math.max(1, Math.floor(Number(selectedSlot?.itemId) === Number(item.id)
      ? Number(selectedSlot?.count) || 1
      : maxCount));
    const amount = Math.max(1, Math.min(available, Math.floor(Number(input.value) || 1)));
    input.max = String(available);
    input.value = String(amount);
    batchButton.textContent = amount > 1 ? `批量打开/使用 ×${amount}` : '打开/使用';
  };

  panel.querySelectorAll('[data-batch-use-quick]').forEach((button) => button.addEventListener('click', () => {
    const value = button.dataset.batchUseQuick;
    input.value = value === 'all' ? String(maxCount) : String(Math.min(maxCount, Number(value) || 1));
    clampAndSync();
  }));
  input.addEventListener('input', clampAndSync);
  clampAndSync();

  batchButton.addEventListener('click', () => {
    const requested = Math.max(1, Math.min(maxCount, Math.floor(Number(input.value) || 1)));
    let used = 0;
    let lastError = '';
    let preferredIndex = view.selectedIndex;

    for (let i = 0; i < requested; i += 1) {
      const index = matchingItemIndex(view, item.id, preferredIndex);
      if (index < 0) break;
      preferredIndex = index;
      const result = view.itemUse.use(item, index, view.inventory, view.cardInventory, view.player);
      if (result?.picker) {
        view._showCardPicker(item.id, index, item, root);
        return;
      }
      if (!result?.ok) {
        lastError = result?.error || result?.message || '使用失败';
        break;
      }
      used += 1;
    }

    view.onPlayerUpdate?.();
    const nextIndex = matchingItemIndex(view, item.id, preferredIndex);
    view.selectedIndex = nextIndex >= 0 ? nextIndex : -1;
    view.refresh(root);

    if (used <= 0) {
      view.toast(root, lastError || '没有成功使用道具');
    } else if (lastError) {
      view.toast(root, `已使用 ${used} 个「${item.name}」；随后停止：${lastError}`);
    } else {
      view.toast(root, used > 1 ? `已批量使用 ${used} 个「${item.name}」` : `已使用「${item.name}」`);
    }
  });
}

function installBatchItemUse() {
  const previousRenderItemDetail = BagView.prototype.renderItemDetail;
  BagView.prototype.renderItemDetail = function renderItemDetailWithBatchUse20260905(root) {
    const result = previousRenderItemDetail.call(this, root);
    enhanceBatchUse(this, root);
    return result;
  };
}

function installFriendSearchGuidance() {
  const previousRender = FriendView.prototype.render;
  FriendView.prototype.render = async function renderWithSearchGuidance20260905(root, ...args) {
    const result = await previousRender.call(this, root, ...args);
    const input = root?.querySelector?.('#friend-search');
    if (input) {
      input.placeholder = '输入玩家ID / 游戏昵称 / 登录账号';
      input.title = '支持玩家ID、游戏昵称、登录账号；昵称和账号支持模糊搜索';
    }
    return result;
  };
}

export function installPlayerQoL20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installBatchItemUse();
  installFriendSearchGuidance();
}
