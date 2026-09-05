import { ShopView } from './ShopView.js';

const PATCH_FLAG = Symbol.for('clbwz.diamondShopExpansion20260905');

const DIAMOND_PRODUCTS = Object.freeze([
  {
    key: 'gem-item:gold-box-10',
    name: '金币箱子×10',
    desc: '钻石购买；打开后每个可获得5,000金币，共可获得50,000金币',
    icon: '箱',
    realId: 1,
    subcategory: '经济',
    gemPrice: 20,
    count: 10,
  },
  {
    key: 'gem-item:item-box-10',
    name: '道具礼盒×10',
    desc: '钻石购买；可批量打开的随机道具礼盒',
    icon: '礼',
    realId: 9,
    subcategory: '特殊',
    gemPrice: 25,
    count: 10,
  },
  {
    key: 'gem-item:quality-reroll-5',
    name: '品质洗练石×5',
    desc: '钻石购买；用于重新洗练卡牌底座品质',
    icon: '洗',
    realId: 80,
    subcategory: '功能',
    gemPrice: 35,
    count: 5,
  },
  {
    key: 'gem-item:star-reroll-5',
    name: '属性洗练石×5',
    desc: '钻石购买；用于卡牌相关洗练功能',
    icon: '炼',
    realId: 81,
    subcategory: '功能',
    gemPrice: 35,
    count: 5,
  },
  {
    key: 'gem-item:bag-expand-3',
    name: '背包扩容符×3',
    desc: '钻石购买；每张使用后永久增加10格道具背包',
    icon: '扩',
    realId: 92,
    subcategory: '功能',
    gemPrice: 45,
    count: 3,
  },
  {
    key: 'gem-item:reverse-card-10',
    name: '逆转卡×10',
    desc: '钻石购买；用于还原铁匠铺销毁层内尚未过期的副卡',
    icon: '逆',
    realId: 50041,
    subcategory: '功能',
    gemPrice: 30,
    count: 10,
  },
  {
    key: 'gem-item:charm4-20',
    name: '四级保护符×20',
    desc: '钻石购买；高阶造卡与强化保护材料',
    icon: '护',
    realId: 50024,
    subcategory: '材料',
    gemPrice: 25,
    count: 20,
  },
  {
    key: 'gem-item:dna4-20',
    name: '四级DNA×20',
    desc: '钻石购买；四级卡牌制造定向材料',
    icon: 'DNA',
    realId: 50034,
    subcategory: '材料',
    gemPrice: 25,
    count: 20,
  },
]);

function toProduct(entry) {
  return {
    key: entry.key,
    kind: 'gem-item',
    name: entry.name,
    desc: entry.desc,
    icon: entry.icon,
    realId: entry.realId,
    category: 'item',
    subcategory: entry.subcategory,
    data: {
      gemPrice: entry.gemPrice,
      effect: { type: 'inventory', realId: entry.realId, count: entry.count },
    },
  };
}

function hasInventoryCapacity(view, itemId, count) {
  const slots = view.inventory?.getSlots?.() ?? [];
  const item = view.itemDb?.getById?.(Number(itemId));
  if (!item) return false;
  const maxStack = Math.max(1, Number(item.maxStack) || 327867);
  let capacity = 0;
  for (const slot of slots) {
    if (!slot) {
      capacity += maxStack;
    } else if (Number(slot.itemId) === Number(itemId)) {
      capacity += Math.max(0, maxStack - Math.max(0, Number(slot.count) || 0));
    }
    if (capacity >= count) return true;
  }
  return capacity >= count;
}

export function installDiamondShopExpansion20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousGetClassicProducts = ShopView.prototype.getClassicProducts;
  ShopView.prototype.getClassicProducts = function getClassicProductsWithDiamondItems20260905() {
    const products = previousGetClassicProducts.call(this);
    return [...products, ...DIAMOND_PRODUCTS.map(toProduct)];
  };

  const previousGetClassicVisibleProducts = ShopView.prototype.getClassicVisibleProducts;
  ShopView.prototype.getClassicVisibleProducts = function getClassicVisibleProductsWithDiamondRecommend20260905() {
    const visible = previousGetClassicVisibleProducts.call(this);
    if (this.classicCategory !== 'recommend') return visible;
    const diamond = this.getClassicProducts().filter((product) => product.kind === 'gem-item').slice(0, 4);
    const seen = new Set(diamond.map((product) => product.key));
    return [...diamond, ...visible.filter((product) => !seen.has(product.key))];
  };

  const previousFormatClassicPrice = ShopView.prototype.formatClassicPrice;
  ShopView.prototype.formatClassicPrice = function formatClassicPriceWithDiamondItems20260905(product) {
    if (product?.kind === 'gem-item') {
      return `${this.renderCurrencyIcon('gem')} ${Math.max(0, Number(product.data?.gemPrice) || 0)}`;
    }
    return previousFormatClassicPrice.call(this, product);
  };

  const previousResolveClassicCartCost = ShopView.prototype.resolveClassicCartCost;
  ShopView.prototype.resolveClassicCartCost = function resolveClassicCartCostWithDiamondItems20260905(entries = [...this.cart.values()]) {
    const sum = previousResolveClassicCartCost.call(this, entries);
    for (const entry of entries) {
      if (entry?.product?.kind !== 'gem-item') continue;
      const quantity = Math.max(0, Number(entry.quantity) || 0);
      sum.gem += Math.max(0, Number(entry.product.data?.gemPrice) || 0) * quantity;
    }
    return sum;
  };

  const previousPurchaseClassicProduct = ShopView.prototype.purchaseClassicProduct;
  ShopView.prototype.purchaseClassicProduct = function purchaseClassicProductWithDiamondItems20260905(product, root) {
    if (product?.kind !== 'gem-item') return previousPurchaseClassicProduct.call(this, product, root);

    const gemPrice = Math.max(0, Number(product.data?.gemPrice) || 0);
    const effect = product.data?.effect;
    const itemId = Number(effect?.realId);
    const count = Math.max(1, Math.floor(Number(effect?.count) || 1));
    if ((Number(this.player?.gem) || 0) < gemPrice) {
      this.toast(root, '钻石不足');
      return false;
    }
    if (!this.inventory || !this.itemDb?.getById?.(itemId)) {
      this.toast(root, '道具配置缺失');
      return false;
    }
    if (!hasInventoryCapacity(this, itemId, count)) {
      this.toast(root, '背包空间不足，未扣除钻石');
      return false;
    }
    if (!this.inventory.addItem(itemId, count)) {
      this.toast(root, '背包空间不足，未扣除钻石');
      return false;
    }

    this.player.gem -= gemPrice;
    return true;
  };

  if (typeof window !== 'undefined') {
    window.__diamondShopProducts20260905 = DIAMOND_PRODUCTS.map((entry) => ({
      name: entry.name,
      gemPrice: entry.gemPrice,
      itemId: entry.realId,
      count: entry.count,
    }));
  }
}
