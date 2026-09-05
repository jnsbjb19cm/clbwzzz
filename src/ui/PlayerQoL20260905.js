import { BagView } from './BagView.js';
import { FriendView } from './FriendView.js';

const PATCH_FLAG = Symbol.for('clbwz.playerQoL20260905');
const CARD_TARGET_ITEMS = new Set([80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91]);
const BATCH_YIELD_EVERY = 120;

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
    .bag-batch-use button:disabled{opacity:.55;cursor:default;filter:none}
    .bag-batch-use .bag-use-all-now{background:#425d36;border-color:#8aa579;font-weight:700}
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

function totalItemCount(view, itemId) {
  return (view.inventory?.getSlots?.() ?? []).reduce((sum, slot) => (
    Number(slot?.itemId) === Number(itemId)
      ? sum + Math.max(0, Math.floor(Number(slot?.count) || 0))
      : sum
  ), 0);
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * 批量循环期间暂停每个单品内部的 localStorage 写盘，最后统一保存一次。
 * 这不会改变内存中的物品/卡牌/货币结算，只是避免一次使用几百个道具时
 * 同步 JSON.stringify + localStorage 写入几百次把主线程卡死。
 */
function suspendStoreSaves(view) {
  const stores = [view.inventory, view.cardInventory].filter(Boolean);
  const restorers = [];
  for (const store of stores) {
    if (typeof store.save !== 'function') continue;
    const original = store.save;
    store.save = () => {};
    restorers.push(() => {
      store.save = original;
      original.call(store);
    });
  }
  return () => {
    for (const restore of restorers.reverse()) restore();
  };
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
  const initialTotal = Math.max(1, totalItemCount(view, item.id));
  const panel = document.createElement('div');
  panel.className = 'bag-batch-use';
  panel.innerHTML = `
    <div class="bag-batch-use-row">
      <span>使用数量</span>
      <input type="number" min="1" max="${initialTotal}" step="1" value="${Math.min(10, initialTotal)}" data-batch-use-count aria-label="批量使用数量" />
      <button type="button" data-batch-use-quick="1">1个</button>
      <button type="button" data-batch-use-quick="10">10个</button>
      <button type="button" data-batch-use-quick="all">填入全部</button>
      <button type="button" class="bag-use-all-now" data-batch-use-now-all>一键使用全部</button>
    </div>
    <small>“一键使用全部”会立即开始，不需要再点第二次；大量道具会分批处理，避免浏览器假死。需要选择目标卡牌的洗练/技能类道具仍逐个使用。</small>`;
  const actions = detail.querySelector('.bag-detail-actions');
  actions?.insertAdjacentElement('beforebegin', panel);

  // 克隆按钮去掉 BagView 原来的单次使用监听，统一改为数量驱动。
  const batchButton = useButton.cloneNode(true);
  batchButton.dataset.batchUseBound = 'true';
  useButton.replaceWith(batchButton);

  const input = panel.querySelector('[data-batch-use-count]');
  const allNowButton = panel.querySelector('[data-batch-use-now-all]');
  const controls = [input, batchButton, ...panel.querySelectorAll('button')].filter(Boolean);

  const liveTotal = () => Math.max(0, totalItemCount(view, item.id));
  const clampAndSync = () => {
    const available = Math.max(1, liveTotal());
    const amount = Math.max(1, Math.min(available, Math.floor(Number(input.value) || 1)));
    input.max = String(available);
    input.value = String(amount);
    batchButton.textContent = amount > 1 ? `批量打开/使用 ×${amount}` : '打开/使用';
    if (allNowButton) allNowButton.textContent = `一键使用全部 ×${available}`;
  };

  panel.querySelectorAll('[data-batch-use-quick]').forEach((button) => button.addEventListener('click', () => {
    const available = Math.max(1, liveTotal());
    const value = button.dataset.batchUseQuick;
    input.value = value === 'all' ? String(available) : String(Math.min(available, Number(value) || 1));
    clampAndSync();
  }));
  input.addEventListener('input', clampAndSync);
  clampAndSync();

  const performBatch = async (requestedAmount) => {
    if (batchButton.dataset.batchRunning === 'true') return;
    const availableAtStart = liveTotal();
    const requested = Math.max(1, Math.min(availableAtStart, Math.floor(Number(requestedAmount) || 1)));
    if (availableAtStart <= 0) {
      view.toast(root, '该道具已经用完');
      return;
    }

    batchButton.dataset.batchRunning = 'true';
    controls.forEach((control) => { control.disabled = true; });
    const originalButtonText = batchButton.textContent;
    let used = 0;
    let lastError = '';
    let preferredIndex = view.selectedIndex;
    const restoreSaves = suspendStoreSaves(view);

    try {
      for (let i = 0; i < requested; i += 1) {
        const index = matchingItemIndex(view, item.id, preferredIndex);
        if (index < 0) break;
        preferredIndex = index;
        const result = view.itemUse.use(item, index, view.inventory, view.cardInventory, view.player);
        if (result?.picker) {
          // 理论上 CARD_TARGET_ITEMS 已经挡住；这里仍保留兜底，防以后新增目标型道具。
          lastError = '该道具需要选择目标，已停止批量使用';
          break;
        }
        if (!result?.ok) {
          lastError = result?.error || result?.message || '使用失败';
          break;
        }
        used += 1;

        if (used % BATCH_YIELD_EVERY === 0 && used < requested) {
          batchButton.textContent = `使用中 ${used}/${requested}…`;
          await nextFrame();
        }
      }
    } finally {
      restoreSaves();
      batchButton.dataset.batchRunning = 'false';
      controls.forEach((control) => { control.disabled = false; });
      batchButton.textContent = originalButtonText;
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
      view.toast(root, used > 1 ? `已一键使用 ${used} 个「${item.name}」` : `已使用「${item.name}」`);
    }
  };

  batchButton.addEventListener('click', () => {
    void performBatch(Math.floor(Number(input.value) || 1));
  });

  allNowButton?.addEventListener('click', () => {
    const total = liveTotal();
    input.value = String(Math.max(1, total));
    clampAndSync();
    void performBatch(total);
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
