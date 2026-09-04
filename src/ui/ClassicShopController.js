import './ClassicShopController.css';
import { audio } from '../core/AudioManager.js';
import itemAtlasData from '../data/atlas/preload_items.json';
import { ShopView } from './ShopView.js';
import {
  getLegacyShopExtensionSprite,
  ITEM_EXTENSION_URL,
} from './ItemExtensionSprites.js';

const PATCH_FLAG = Symbol.for('clbwz.classicShopController.v1');
const SHOP_ITEM_ATLAS = new Map(itemAtlasData.sprites.map((sprite) => [String(sprite.name), sprite]));
const SHIELD_HEALTH_ICON = new URL('../../resources/img/sheldheath.png', import.meta.url).href;
const POWER_BOTTLE_ICON = new URL('../../resources/img/powerbottle.png', import.meta.url).href;

// These numbers point to the ORIGINAL artwork before any alias is applied.
// Keeping the relation non-recursive is essential: changing one target item
// must not cascade into another item's source image.
const LEGACY_ICON_ALIAS = new Map([
  ['速度卷轴', 34],             // 原逆转卡
  ['经验加成卡', 40],           // 原复活十字章
  ['掉落加成符', 42],           // 原双倍金币卡
  ['双倍金币卡', 39],           // 原生命护盾药水
  ['三倍金币卡', 41],           // 原能量药剂
  ['藏宝图', 43],               // 原经验加成卡
  ['道具礼盒', 44],             // 原三倍金币卡
  ['装备礼盒', 45],             // 原掉落加成符
  ['随机技能书', 46],           // 原藏宝图
  ['幸运符', 47],               // 原道具礼盒
  ['远古召唤卷', 48],           // 原装备礼盒
]);

const SEMANTIC_ATLAS_ICON = new Map([
  ['豪华金币箱', ['gold_icon', 'gold']],
  ['超值钻石包', ['blueDiamond_icon', 'blue-diamond']],
  ['经验大礼包', ['exp_icon', 'exp-icon']],
  ['体力药水·大', ['power_icon', 'power-icon']],
]);

function renderAtlasSprite(candidates) {
  const names = Array.isArray(candidates) ? candidates : [candidates];
  const sprite = names.map((name) => SHOP_ITEM_ATLAS.get(String(name))).find(Boolean);
  if (!sprite) return '';
  const width = Math.max(1, Number(sprite.width) || 45);
  const height = Math.max(1, Number(sprite.height) || 45);
  const scale = Math.min(1, 76 / Math.max(width, height));
  return `<span class="classic-shop-semantic-art"><span class="classic-shop-atlas"><i style="width:${width}px;height:${height}px;background-position:-${sprite.x}px -${sprite.y}px;transform:translate(-50%,-50%) scale(${scale.toFixed(4)})"></i></span></span>`;
}

function renderLegacySprite(sprite) {
  if (!sprite) return '';
  const scale = Math.min(0.62, 74 / Math.max(sprite.width, sprite.height));
  return `<span class="classic-shop-extension"><i style="width:${sprite.width}px;height:${sprite.height}px;background-image:url('${ITEM_EXTENSION_URL}');background-position:-${sprite.x}px -${sprite.y}px;transform:translate(-50%,-50%) scale(${scale.toFixed(4)})"></i></span>`;
}

function renderDirectImage(url, alt) {
  return `<span class="classic-shop-direct-image"><img src="${url}" alt="${alt}" draggable="false"></span>`;
}

function getQuantity(view, product) {
  return Math.max(0, Math.floor(Number(view.cart.get(product.key)?.quantity) || 0));
}

function resolveProduct(view, key) {
  return view.getClassicProducts().find((product) => product.key === key) ?? null;
}

function setQuantity(view, root, product, quantity, message = true) {
  const next = Math.max(0, Math.floor(Number(quantity) || 0));
  if (next <= 0) view.cart.delete(product.key);
  else view.cart.set(product.key, { product, quantity: next });

  audio.playSfx('click');
  const catalog = root.querySelector('[data-shop-products]');
  const previousScrollTop = catalog?.scrollTop ?? 0;
  view.renderClassicCatalog(root);
  const nextCatalog = root.querySelector('[data-shop-products]');
  if (nextCatalog) nextCatalog.scrollTop = previousScrollTop;
  if (message) view.toast?.(root, next > 0 ? `购物车：${product.name} ×${next}` : `已从购物车移除：${product.name}`);
}

function adjustQuantity(view, root, product, delta) {
  setQuantity(view, root, product, getQuantity(view, product) + delta);
}

function renderProductAction(view, product) {
  const quantity = getQuantity(view, product);
  if (quantity <= 0) {
    return `<button type="button" class="shop-buy-btn" data-classic-cart-plus="${product.key}" aria-label="加入购物车：${product.name}">加入购物车</button>`;
  }
  return `<div class="classic-shop-product-action" data-classic-cart-control="${product.key}">
    <button type="button" data-classic-cart-minus="${product.key}" aria-label="减少 ${product.name}">−</button>
    <b aria-label="${product.name} 数量">${quantity}</b>
    <button type="button" data-classic-cart-plus="${product.key}" aria-label="增加 ${product.name}">＋</button>
  </div>`;
}

function bindProductActions(view, root) {
  const catalog = root.querySelector('[data-shop-products]');
  if (!catalog) return;
  catalog.querySelectorAll('.classic-shop-product').forEach((article) => {
    const oldButton = article.querySelector('[data-add-cart]');
    const key = oldButton?.dataset.addCart;
    if (!key) return;
    const product = resolveProduct(view, key);
    if (!product) return;
    oldButton.outerHTML = renderProductAction(view, product);
  });

  catalog.querySelectorAll('[data-classic-cart-plus]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = resolveProduct(view, button.dataset.classicCartPlus);
      if (product) adjustQuantity(view, root, product, 1);
    });
  });
  catalog.querySelectorAll('[data-classic-cart-minus]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = resolveProduct(view, button.dataset.classicCartMinus);
      if (product) adjustQuantity(view, root, product, -1);
    });
  });
}

function renderCartEntries(view, root) {
  const list = root.querySelector('[data-cart-list]');
  if (!list) return;
  const entries = [...view.cart.values()].filter((entry) => Number(entry.quantity) > 0);
  list.innerHTML = entries.length
    ? entries.slice(0, 5).map((entry) => `<li>
        <span title="${entry.product.name}">${entry.product.name}</span>
        <span class="classic-shop-cart-quantity">
          <button type="button" data-classic-cart-list-minus="${entry.product.key}" aria-label="减少 ${entry.product.name}">−</button>
          <b>${entry.quantity}</b>
          <button type="button" data-classic-cart-list-plus="${entry.product.key}" aria-label="增加 ${entry.product.name}">＋</button>
        </span>
      </li>`).join('')
    : '<li><span>购物车为空</span></li>';

  list.querySelectorAll('[data-classic-cart-list-plus]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = resolveProduct(view, button.dataset.classicCartListPlus);
      if (product) adjustQuantity(view, root, product, 1);
    });
  });
  list.querySelectorAll('[data-classic-cart-list-minus]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = resolveProduct(view, button.dataset.classicCartListMinus);
      if (product) adjustQuantity(view, root, product, -1);
    });
  });
}

function resolveSpecialIcon(view, product, originalIcon) {
  if (product?.kind === 'recharge') {
    return renderAtlasSprite(['blueDiamond_icon', 'blue-diamond'])
      || `<span class="classic-shop-semantic-art">${view.renderCurrencyIcon?.('gem') ?? ''}</span>`;
  }

  if (product?.materialSprite || product?.materialImage) {
    return originalIcon.call(view, product);
  }

  if (product?.name === '生命护盾药水') return renderDirectImage(SHIELD_HEALTH_ICON, product.name);
  if (product?.name === '能量药剂') return renderDirectImage(POWER_BOTTLE_ICON, product.name);

  const semantic = SEMANTIC_ATLAS_ICON.get(product?.name);
  if (semantic) {
    const html = renderAtlasSprite(semantic);
    if (html) return html;
  }

  const legacyIndex = LEGACY_ICON_ALIAS.get(product?.name);
  if (legacyIndex != null) {
    const html = renderLegacySprite(getLegacyShopExtensionSprite(legacyIndex));
    if (html) return html;
  }

  return originalIcon.call(view, product);
}

export function installClassicShopController() {
  const proto = ShopView?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;
  Object.defineProperty(proto, PATCH_FLAG, { value: true });

  const originalIcon = proto.renderClassicProductIcon;
  const originalCatalog = proto.renderClassicCatalog;
  const originalCart = proto.renderClassicCart;

  proto.renderClassicProductIcon = function renderClassicProductIconControlled(product) {
    return resolveSpecialIcon(this, product, originalIcon);
  };

  proto.renderClassicCart = function renderClassicCartControlled(root) {
    originalCart.call(this, root);
    renderCartEntries(this, root);
  };

  proto.renderClassicCatalog = function renderClassicCatalogControlled(root) {
    originalCatalog.call(this, root);
    bindProductActions(this, root);
  };
}
