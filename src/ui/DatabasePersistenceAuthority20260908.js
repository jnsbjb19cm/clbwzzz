import { authStore } from '../core/AuthStore.js';
import { BagView } from './BagView.js';
import { ShopView } from './ShopView.js';
import { audio } from '../core/AudioManager.js';
import { emitQuestEvent } from '../core/QuestEventBus.js';
import { cardInstanceIdentity, findCardInstanceSlot } from '../core/CardInstanceIdentity.js';

const PATCH_FLAG = Symbol.for('clbwz.databasePersistenceAuthority20260908');
const FUNCTIONAL_CARD_ITEMS = new Set([80,81,82,83,84,85,86,87,88,89,90,91]);

function applyProfile(view, profile) {
  if (!view?.player || !profile) return;
  const values = {
    level: Number(profile.level),
    exp: Number(profile.exp),
    hp: Number(profile.hp),
    gold: Number(profile.gold),
    gem: Number(profile.diamond ?? profile.gem),
    honor: Number(profile.honor),
    arena: Number(profile.arena),
  };
  for (const [key, value] of Object.entries(values)) {
    if (Number.isFinite(value)) view.player[key] = value;
  }
  if (dataNumber(profile.stamina) != null) view.player.stamina = Number(profile.stamina);
}

function dataNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function applyItems(view, data) {
  const inventory = view?.inventory;
  if (!inventory?.state || !Array.isArray(data?.items)) return;
  const requestedSlots = Number(data?.itemBag?.slotCount);
  const slotCount = Math.max(
    120,
    Number.isFinite(requestedSlots) ? Math.floor(requestedSlots) : 0,
    data.items.length,
  );
  const slots = Array.from({ length: slotCount }, () => null);
  let cursor = 0;
  for (const raw of data.items) {
    const itemId = Number(raw?.itemId);
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0 || cursor >= slots.length) continue;
    slots[cursor++] = { itemId, count, bound: Boolean(raw?.bound ?? raw?.isBound) };
  }
  inventory.state = { ...inventory.state, slotCount, slots };
  inventory.save?.();
}

function applyCards(view, data) {
  if (data?.cardInventory && view?.cardInventory?.applyServerSnapshot) {
    view.cardInventory.applyServerSnapshot(data.cardInventory);
  }
}

function applyServerData(view, data) {
  if (!data || typeof data !== 'object') return;
  applyProfile(view, data.profile);
  if (data.extraResources && view?.player) {
    const stamina = dataNumber(data.extraResources.stamina);
    if (stamina != null) view.player.stamina = stamina;
  }
  applyItems(view, data);
  applyCards(view, data);
  view?.onPlayerUpdate?.();
}

function replaceButton(button, handler) {
  if (!button) return null;
  const clone = button.cloneNode(true);
  button.replaceWith(clone);
  clone.addEventListener('click', handler);
  return clone;
}

function selectedItem(view) {
  const slot = view?.inventory?.getSlots?.()[view.selectedIndex];
  if (!slot) return null;
  const item = view.itemDb?.getById?.(slot.itemId);
  return item ? { slot, item } : null;
}

function installBagAuthority() {
  const originalRender = BagView.prototype.render;
  BagView.prototype.render = function renderWithDatabaseAuthority20260908(root) {
    this.__databaseAuthorityRoot = root;
    return originalRender.call(this, root);
  };

  const originalRenderItemDetail = BagView.prototype.renderItemDetail;
  BagView.prototype.renderItemDetail = function renderItemDetailDatabaseAuthority20260908(root) {
    originalRenderItemDetail.call(this, root);
    const picked = selectedItem(this);
    if (!picked) return;
    const { slot, item } = picked;

    if (Number(item.id) === 98) {
      // 2026-09-11：改名卡（98）走独立改名弹窗；改名由服务端 /player/rename 扣卡+入库。
      replaceButton(root.querySelector('#bag-detail #bag-use'), () => this._openRenameDialog(root));
    } else if (!FUNCTIONAL_CARD_ITEMS.has(Number(item.id))) {
      replaceButton(root.querySelector('#bag-detail #bag-use'), async (event) => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try {
          const data = await authStore.api.post('/player/inventory/use', {
            itemId: Number(item.id),
            bound: Boolean(slot.bound),
          });
          applyServerData(this, data);
          this.selectedIndex = -1;
          this.refresh(root);
          this.toast(root, data.message || '使用成功');
        } catch (error) {
          this.toast(root, error?.message || '道具使用失败');
        } finally {
          if (button.isConnected) button.disabled = false;
        }
      });
    }

    // 2026-10-11 用户：「批量操作里丢弃和出售我选了 222 个，结果还是 1 个」
    // 原因：这两个处理器把数量写死成 count: 1，从不读界面上的数量控件。
    // 这里按当前可见的数量控件取值（滑块/数字两种模式都兼容），并夹到实际持有量。
    const readSelectedQty = () => {
      const box = root.querySelector('#bag-detail');
      const candidates = [box?.querySelector('[data-trade-range]'), box?.querySelector('[data-trade-count]')];
      const visible = candidates.find((el) => el && el.offsetParent !== null) ?? candidates.find(Boolean);
      const picked = Math.max(1, Math.floor(Number(visible?.value) || 1));
      const owned = Math.max(1, Math.floor(Number(slot?.count) || picked));
      return Math.max(1, Math.min(picked, owned));
    };

    replaceButton(root.querySelector('#bag-detail #bag-sell'), async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const qty = readSelectedQty();   // 2026-10-11：读界面数量（原来写死 1，选 222 也只卖 1 个）
        const data = await authStore.api.post('/player/inventory/sell', {
          itemId: Number(item.id), count: qty, bound: Boolean(slot.bound),
        });
        applyServerData(this, data);
        this.selectedIndex = -1;
        this.refresh(root);
        this.toast(root, '出售 ' + qty + ' 个，获得 ' + (data.gain ?? item.sellPrice ?? 0) + ' 金币');
      } catch (error) {
        this.toast(root, error?.message || '出售失败');
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });

    replaceButton(root.querySelector('#bag-detail #bag-drop'), async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const qty = readSelectedQty();
        const data = await authStore.api.post('/player/inventory/drop', {
          itemId: Number(item.id), count: qty, bound: Boolean(slot.bound),
        });
        applyServerData(this, data);
        this.selectedIndex = -1;
        this.refresh(root);
        this.toast(root, '已丢弃 ' + qty + ' 个');
      } catch (error) {
        this.toast(root, error?.message || '丢弃失败');
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  };

  BagView.prototype.handleExpand = async function handleExpandDatabaseAuthority20260908(root) {
    audio.playSfx('click');
    try {
      const data = await authStore.api.post('/player/inventory/expand', {});
      applyServerData(this, data);
      this.refresh(root);
      this.toast(root, `扩容成功！当前 ${data.itemBag?.slotCount ?? data.slotCount ?? this.inventory.getSlotCount()} 格`);
    } catch (error) {
      this.toast(root, error?.message || '扩容失败');
    }
  };

  const originalRenderCardDetail = BagView.prototype.renderCardDetail;
  BagView.prototype.renderCardDetail = function renderCardDetailDatabaseAuthority20260908(root) {
    originalRenderCardDetail.call(this, root);
    const slotIndex = Number(this.selectedIndex);
    replaceButton(root.querySelector('#bag-detail #bag-card-drop'), async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const data = await authStore.api.post('/player/cards/discard', { slotIndex });
        applyServerData(this, data);
        this.selectedIndex = -1;
        this.refresh(root);
        this.toast(root, '已移除 1 张卡牌');
      } catch (error) {
        this.toast(root, error?.message || '移除卡牌失败');
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  };

  // 80~91 功能道具的卡牌效果和道具扣除必须在一个服务器事务中完成。
  BagView.prototype._applyCardEffect = function applyCardEffectDatabaseAuthority20260908(itemId, itemSlotIndex, slot, card, extra) {
    const store = this.cardInventory;
    if (store?._cardActionPending) return '卡牌正在保存，请勿重复使用';
    const expectedTarget = cardInstanceIdentity(slot);
    const expectedSource = extra?.sourceSlot ? cardInstanceIdentity(extra.sourceSlot) : null;
    const slots = store?.getSlots?.() ?? [];
    let targetSlotIndex = findCardInstanceSlot(slots, expectedTarget, slots.indexOf(slot));
    let sourceSlotIndex = expectedSource
      ? findCardInstanceSlot(slots, expectedSource, slots.indexOf(extra.sourceSlot), targetSlotIndex) : -1;
    const itemSlot = this.inventory?.getSlots?.()[itemSlotIndex];
    if (!FUNCTIONAL_CARD_ITEMS.has(Number(itemId))) return '该功能道具暂不支持';
    if (targetSlotIndex < 0) return '卡牌列表已更新，请重新选择';
    if (Number(itemId) === 90 && !String(extra?.name || '').trim()) return '请输入新名称';
    if (Number(itemId) === 89 && (sourceSlotIndex < 0 || sourceSlotIndex === targetSlotIndex)) return '请选择两张不同的卡牌';

    const root = this.__databaseAuthorityRoot;
    const token = authStore.token;
    store._cardActionPending = true;
    const pending = store._remoteCardInventoryQueue ?? Promise.resolve();
    store._remoteCardInventoryQueue = pending.then(async () => {
      if (store._remoteCardInventoryError) throw store._remoteCardInventoryError;
      if (token !== authStore.token) throw new Error('账号已切换，请重新选择卡牌');
      // 2026-10-14 修复（用户：升阶/洗练报 400、还洗到别的卡）:
      // 服务端会按【槽位号】读行，并用 expectedTarget（卡牌实例身份）比对；
      // 只要客户端卡表与服务端不一致（补卡/排序后尤其常见），槽位就会指到别的卡上 -> 400。
      // 这里先拉一次服务端权威卡表并应用，然后**按身份**重新定位目标槽位（不再靠旧下标）。
      try {
        const fresh = await authStore.api.get('/player/card-inventory');
        if (token === authStore.token && Array.isArray(fresh?.cards)) {
          store.applyServerSnapshot?.(fresh);
          if (authStore.snapshot) authStore.snapshot.cardInventory = fresh;
        }
      } catch { /* 刷新失败就继续按本地走，服务端仍会校验 */ }
      if (token !== authStore.token) throw new Error('账号已切换，请重新选择卡牌');
      {
        const slotsNow = store.getSlots() || [];
        const hit = findCardInstanceSlot(slotsNow, expectedTarget, targetSlotIndex);
        if (hit < 0) throw new Error('卡牌列表已更新，请重新选择，未消耗道具');
        targetSlotIndex = hit;
        if (expectedSource) {
          const hitSrc = findCardInstanceSlot(slotsNow, expectedSource, sourceSlotIndex, targetSlotIndex);
          if (hitSrc < 0) throw new Error('用于转移的卡牌已变化，请重新选择');
          sourceSlotIndex = hitSrc;
        }
      }
      if (cardInstanceIdentity(store.getSlots()[targetSlotIndex]) !== expectedTarget
        || (expectedSource && cardInstanceIdentity(store.getSlots()[sourceSlotIndex]) !== expectedSource)) {
        throw new Error('卡牌列表已更新，请重新选择，未消耗道具');
      }
      return authStore.api.post('/player/cards/use-functional-item', {
        itemId: Number(itemId),
        targetSlotIndex,
        sourceSlotIndex,
        expectedTarget,
        expectedSource,
        name: String(extra?.name || '').trim(),
        bound: Boolean(itemSlot?.bound),
      });
    }).then((data) => {
      if (token !== authStore.token) return;
      applyServerData(this, data);
      this.selectedIndex = -1;
      if (root?.isConnected) this.refresh(root);
      if (root?.isConnected) this.toast(root, data.message || '功能道具使用成功');
    }).catch((error) => {
      if (root?.isConnected) this.toast(root, error?.message || '功能道具使用失败');
    }).finally(() => {
      store._cardActionPending = false;
    });
    return '正在保存…';
  };
}

async function buyClassicProduct(view, product) {
  if (product.kind === 'recharge') {
    // 充值不算「从商场购买道具」，不上报主线8。
    return authStore.api.post('/player/shop/recharge-demo', { payId: Number(product.data?.pay_id) });
  }
  let data;
  if (product.kind === 'pack') {
    data = await authStore.api.post('/player/shop/buy-pack', { packId: Number(product.data?.item_id) });
  } else if (product.kind === 'item' || product.kind === 'gem-item') {
    const effect = product.data?.effect;
    if (effect?.type !== 'inventory') throw new Error('该商品尚未接入数据库道具发放');
    data = await authStore.api.post('/player/shop/buy-item', {
      itemId: Number(effect.realId),
      count: Math.max(1, Number(effect.count) || 1),
      goldCost: product.kind === 'gem-item' ? 0 : Math.max(0, Number(product.data?.price) || 0),
      gemCost: product.kind === 'gem-item' ? Math.max(0, Number(product.data?.gemPrice) || 0) : 0,
    });
  } else {
    throw new Error('未知商品类型');
  }
  // 2026-10-09（用户报「买东西任务不涨」）：
  // 购买是入库权威的 —— 这一层把 ShopView.purchaseClassicProduct / checkoutClassicCart / renderPack
  // 整条链路都接管了，ShopView 里那几个 emitQuestEvent 根本没机会执行。
  // 所以成功后必须在这里补上报主线8「商场采购」。
  emitQuestEvent('shop_buy', { count: 1 });
  return data;
}

function installShopAuthority() {
  ShopView.prototype.purchaseClassicDirect = async function purchaseClassicDirect(root, product, quantity) {
    if (this._shopPurchasePending) return { purchased: 0, message: '请等待当前购买完成' };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 || product?.kind === 'recharge') {
      return { purchased: 0, message: '购买数量或商品无效' };
    }
    this._shopPurchasePending = true;
    let purchased = 0, message = '';
    try {
      const cost = this.resolveClassicCartCost([{ product, quantity }]);
      if ((Number(this.player.gold) || 0) < cost.gold || (Number(this.player.gem) || 0) < cost.gem) {
        return { purchased: 0, message: '余额不足，未购买' };
      }
      for (let index = 0; index < quantity; index += 1) {
        try {
          const data = await buyClassicProduct(this, product);
          purchased += 1;
          applyServerData(this, data);
        } catch (error) {
          message = error?.message || '购买失败，请查看背包后再试';
          break;
        }
      }
      if (root?.isConnected) this.renderClassicCatalog(root);
      return { purchased, message };
    } finally {
      this._shopPurchasePending = false;
    }
  };

  ShopView.prototype.checkoutClassicCart = async function checkoutClassicCartDatabaseAuthority20260908(root) {
    if (this._shopPurchasePending) return;
    const entries = [...this.cart.values()];
    if (!entries.length) return;
    this._shopPurchasePending = true;
    try {
    const remaining = new Map(this.cart);
    let purchased = 0;
    let stopMessage = '';
    for (const entry of entries) {
      let bought = 0;
      for (let index = 0; index < entry.quantity; index += 1) {
        try {
          const data = await buyClassicProduct(this, entry.product);
          applyServerData(this, data);
          bought += 1;
          purchased += 1;
        } catch (error) {
          stopMessage = error?.message || '购买失败';
          break;
        }
      }
      if (bought >= entry.quantity) remaining.delete(entry.product.key);
      else if (bought > 0) remaining.set(entry.product.key, { ...entry, quantity: entry.quantity - bought });
      if (stopMessage) break;
    }
    this.cart = remaining;
    this.renderClassicCatalog(root);
    // 2026-10-06：曾把"已购买 N 件"这类播报去掉；2026-10-11 用户反馈"购物车买成功了一点提示都没有"，
    // 所以恢复成功提示（失败分支保持原样，仍然只提示有用的原因）。
    if (stopMessage) this.toast(root, purchased ? `已购买 ${purchased} 件；其余未购买：${stopMessage}` : stopMessage);
    else if (purchased > 0) this.toast(root, `购买成功：已购买 ${purchased} 件`);
    } finally {
      this._shopPurchasePending = false;
    }
  };

  const originalRenderRecharge = ShopView.prototype.renderRecharge;
  ShopView.prototype.renderRecharge = function renderRechargeDatabaseAuthority20260908(body, root) {
    originalRenderRecharge.call(this, body, root);
    body.querySelectorAll('[data-type="recharge"]').forEach((button) => {
      replaceButton(button, async (event) => {
        const current = event.currentTarget;
        current.disabled = true;
        try {
          const data = await authStore.api.post('/player/shop/recharge-demo', { payId: Number(current.dataset.id) });
          applyServerData(this, data);
          this.toast(root, '充值成功');
        } catch (error) {
          this.toast(root, error?.message || '充值失败');
        } finally {
          if (current.isConnected) current.disabled = false;
        }
      });
    });
  };

  const originalRenderPack = ShopView.prototype.renderPack;
  ShopView.prototype.renderPack = function renderPackDatabaseAuthority20260908(body, root) {
    originalRenderPack.call(this, body, root);
    body.querySelectorAll('[data-type="pack"]').forEach((button) => {
      replaceButton(button, async (event) => {
        const current = event.currentTarget;
        current.disabled = true;
        try {
          const data = await authStore.api.post('/player/shop/buy-pack', { packId: Number(current.dataset.id) });
          applyServerData(this, data);
          // 2026-10-09：卡包购买也走入库权威，这里补上报主线8。
          emitQuestEvent('shop_buy', { count: 1 });
          this.toast(root, `🎉抽到「${data.cardName || data.cardId}」`);
        } catch (error) {
          this.toast(root, error?.message || '购买卡牌包失败');
        } finally {
          if (current.isConnected) current.disabled = false;
        }
      });
    });
  };

  const originalRenderItem = ShopView.prototype.renderItem;
  ShopView.prototype.renderItem = function renderItemDatabaseAuthority20260908(body, root) {
    originalRenderItem.call(this, body, root);
    body.querySelectorAll('[data-type="item"]').forEach((button) => {
      replaceButton(button, async (event) => {
        const current = event.currentTarget;
        const product = this.getClassicProducts().find((entry) => entry.key === `item:${Number(current.dataset.idx)}`);
        if (!product) { this.toast(root, '商品配置不存在'); return; }
        current.disabled = true;
        try {
          const data = await buyClassicProduct(this, product);
          applyServerData(this, data);
        } catch (error) {
          this.toast(root, error?.message || '购买失败');
        } finally {
          if (current.isConnected) current.disabled = false;
        }
      });
    });
  };
}

export function installDatabasePersistenceAuthority20260908() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installBagAuthority();
  installShopAuthority();
}
