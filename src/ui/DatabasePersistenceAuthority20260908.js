import { authStore } from '../core/AuthStore.js';
import { BagView } from './BagView.js';
import { ShopView } from './ShopView.js';
import { audio } from '../core/AudioManager.js';

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

    if (!FUNCTIONAL_CARD_ITEMS.has(Number(item.id))) {
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

    replaceButton(root.querySelector('#bag-detail #bag-sell'), async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const data = await authStore.api.post('/player/inventory/sell', {
          itemId: Number(item.id), count: 1, bound: Boolean(slot.bound),
        });
        applyServerData(this, data);
        this.selectedIndex = -1;
        this.refresh(root);
        this.toast(root, `出售获得 ${data.gain ?? item.sellPrice ?? 0} 金币`);
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
        const data = await authStore.api.post('/player/inventory/drop', {
          itemId: Number(item.id), count: 1, bound: Boolean(slot.bound),
        });
        applyServerData(this, data);
        this.selectedIndex = -1;
        this.refresh(root);
        this.toast(root, '已丢弃 1 个');
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
        this.toast(root, '已从数据库移除 1 张卡牌');
      } catch (error) {
        this.toast(root, error?.message || '移除卡牌失败');
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  };

  // 80~91 功能道具的卡牌效果和道具扣除必须在一个服务器事务中完成。
  BagView.prototype._applyCardEffect = function applyCardEffectDatabaseAuthority20260908(itemId, itemSlotIndex, slot, card, extra) {
    const targetSlotIndex = this.cardInventory?.getSlots?.().indexOf(slot) ?? -1;
    const sourceSlotIndex = extra?.sourceSlot
      ? this.cardInventory?.getSlots?.().indexOf(extra.sourceSlot) ?? -1
      : -1;
    const itemSlot = this.inventory?.getSlots?.()[itemSlotIndex];
    if (!FUNCTIONAL_CARD_ITEMS.has(Number(itemId))) return '该功能道具暂不支持';
    if (Number(itemId) === 90 && !String(extra?.name || '').trim()) return '请输入新名称';
    if (Number(itemId) === 89 && (sourceSlotIndex < 0 || sourceSlotIndex === targetSlotIndex)) return '请选择两张不同的卡牌';

    const root = this.__databaseAuthorityRoot;
    void authStore.api.post('/player/cards/use-functional-item', {
      itemId: Number(itemId),
      targetSlotIndex,
      sourceSlotIndex,
      name: String(extra?.name || '').trim(),
      bound: Boolean(itemSlot?.bound),
    }).then((data) => {
      applyServerData(this, data);
      this.selectedIndex = -1;
      if (root?.isConnected) this.refresh(root);
      if (root?.isConnected) this.toast(root, data.message || '功能道具使用成功');
    }).catch((error) => {
      if (root?.isConnected) this.toast(root, error?.message || '功能道具使用失败');
    });
    return '正在保存到数据库…';
  };
}

async function buyClassicProduct(view, product) {
  if (product.kind === 'recharge') {
    return authStore.api.post('/player/shop/recharge-demo', { payId: Number(product.data?.pay_id) });
  }
  if (product.kind === 'pack') {
    return authStore.api.post('/player/shop/buy-pack', { packId: Number(product.data?.item_id) });
  }
  if (product.kind === 'item') {
    const effect = product.data?.effect;
    if (effect?.type !== 'inventory') throw new Error('该商品尚未接入数据库道具发放');
    return authStore.api.post('/player/shop/buy-item', {
      itemId: Number(effect.realId),
      count: Math.max(1, Number(effect.count) || 1),
      goldCost: Math.max(0, Number(product.data?.price) || 0),
    });
  }
  throw new Error('未知商品类型');
}

function installShopAuthority() {
  ShopView.prototype.checkoutClassicCart = async function checkoutClassicCartDatabaseAuthority20260908(root) {
    const entries = [...this.cart.values()];
    if (!entries.length) return;
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
    if (stopMessage) this.toast(root, purchased ? `已购买 ${purchased} 件；其余未购买：${stopMessage}` : stopMessage);
    else this.toast(root, `成功购买 ${purchased} 件商品，数据已写入数据库`);
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
          this.toast(root, '充值演示数据已写入数据库');
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
          this.toast(root, `购买成功：${product.name}`);
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
