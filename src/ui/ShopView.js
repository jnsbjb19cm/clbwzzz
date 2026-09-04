import { audio } from '../core/AudioManager.js';
import payData from '../data/pay.json';
import packData from '../data/tearPackageItem.json';
import itemAtlasData from '../data/atlas/preload_items.json';
import {
  getShopExtensionSprite,
  ITEM_EXTENSION_URL,
} from './ItemExtensionSprites.js';
import {
  getCraftMaterialImage,
  getCraftMaterialSprite,
  getCraftMaterialSpriteStyle,
} from './SmithyMaterialArtwork.js';

const TABS = [
  { id: 'recharge', label: '充值' },
  { id: 'pack', label: '卡牌包' },
  { id: 'item', label: '道具' },
];

const QUALITY_NAMES = { 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 5: '传说', 6: '逆天' };

const CLASSIC_SHOP_CATEGORIES = [
  { id: 'fitting', label: '试衣间' },
  { id: 'cart', label: '购物车' },
  { id: 'recommend', label: '推荐' },
  { id: 'item', label: '道具' },
  { id: 'fashion', label: '服饰' },
  { id: 'beauty', label: '美容' },
  { id: 'coupon', label: '金币礼券区' },
];

const CLASSIC_SHOP_SUBCATEGORIES = Object.freeze({
  fitting: [],
  cart: [],
  recommend: [],
  item: ['全部', '强化', '材料', '功能', '战斗', '经济', '特殊'],
  fashion: ['衣服', '帽子', '眼镜', '饰品', '套装', 'GG', 'MM'],
  beauty: ['全部', '眼睛', '脸饰'],
  coupon: [],
});
const SHOP_ITEM_ATLAS = new Map(itemAtlasData.sprites.map((sprite) => [String(sprite.name), sprite]));
const CLASSIC_SHOP_PAGE_SIZE = 8;

// Every physical shop item uses a stable inventory id. Rewards and battle buffs
// are applied only when the player opens/uses the item from the bag.
const SHOP_ITEMS = [
  { cat:'货币', name:'金币礼盒',     desc:'打开获得5,000金币',     price:5,     icon:'🎁', effect:{type:'inventory',realId:1,count:1} },
  { cat:'货币', name:'红钻礼盒',     desc:'打开获得10钻石',        price:15000, icon:'🎁', effect:{type:'inventory',realId:2,count:1} },
  { cat:'货币', name:'荣誉礼盒',     desc:'打开获得5,000荣誉',     price:8000,  icon:'🎁', effect:{type:'inventory',realId:3,count:1} },
  { cat:'货币', name:'豪华金币箱',   desc:'打开获得20,000金币',    price:18000, icon:'🎁', effect:{type:'inventory',realId:60020,count:1} },
  { cat:'货币', name:'超值钻石包',   desc:'打开获得50钻石',        price:65000, icon:'💎', effect:{type:'inventory',realId:60021,count:1} },
  { cat:'货币', name:'经验大礼包',   desc:'打开获得5,000经验值',   price:5000,  icon:'🧪', effect:{type:'inventory',realId:60022,count:1} },
  { cat:'货币', name:'体力药水·大',  desc:'使用后恢复100点体力',   price:4000,  icon:'🧪', effect:{type:'inventory',realId:60023,count:1} },

  { cat:'强化', name:'一级强化粉×30', desc:'用于强化1级卡牌',     price:5000,  icon:'✦', effect:{type:'inventory',realId:10001,count:30} },
  { cat:'强化', name:'二级强化粉×20', desc:'用于强化2级卡牌',     price:7000,  icon:'✦', effect:{type:'inventory',realId:10002,count:20} },
  { cat:'强化', name:'三级强化粉×15', desc:'用于强化3级卡牌',     price:10000, icon:'✦', effect:{type:'inventory',realId:10003,count:15} },
  { cat:'强化', name:'四级强化粉×10', desc:'用于强化4级卡牌',     price:15000, icon:'✦', effect:{type:'inventory',realId:10004,count:10} },
  { cat:'强化', name:'五级强化粉×6',  desc:'用于强化5级卡牌',     price:22000, icon:'✦', effect:{type:'inventory',realId:10005,count:6} },

  { cat:'材料', name:'一级宝石×10',  desc:'制作卡牌材料',         price:2000,  icon:'💎', effect:{type:'inventory',realId:50011,count:10} },
  { cat:'材料', name:'二级宝石×8',   desc:'制作卡牌材料',         price:4000,  icon:'💎', effect:{type:'inventory',realId:50012,count:8} },
  { cat:'材料', name:'三级宝石×5',   desc:'制作卡牌材料',         price:8000,  icon:'💎', effect:{type:'inventory',realId:50013,count:5} },
  { cat:'材料', name:'四级宝石×2',   desc:'制作卡牌材料',         price:15000, icon:'💎', effect:{type:'inventory',realId:50014,count:2} },
  { cat:'材料', name:'一级羊皮纸×25', desc:'制作1级卡牌基础材料',  price:3500,  icon:'📜', effect:{type:'inventory',realId:50001,count:25} },
  { cat:'材料', name:'二级羊皮纸×20', desc:'制作2级卡牌基础材料',  price:6000,  icon:'📜', effect:{type:'inventory',realId:50002,count:20} },
  { cat:'材料', name:'三级羊皮纸×15', desc:'制作3级卡牌基础材料',  price:10000, icon:'📜', effect:{type:'inventory',realId:50003,count:15} },
  { cat:'材料', name:'四级羊皮纸×10', desc:'制作4级卡牌基础材料',  price:16000, icon:'📜', effect:{type:'inventory',realId:50004,count:10} },
  { cat:'材料', name:'一级保护符×8',  desc:'制作失败时保留材料',    price:5000,  icon:'🛡️', effect:{type:'inventory',realId:50021,count:8} },

  { cat:'功能', name:'品质洗练石',  desc:'使用后,选择一张需要洗练的卡牌,将其品质重新洗练',    price:25000, icon:'🔮', effect:{type:'inventory',realId:80,count:1} },
  { cat:'功能', name:'属性洗练石',  desc:'使用后,选择一张需要洗练的卡牌,为其随机分配星级',    price:18000, icon:'🎲', effect:{type:'inventory',realId:81,count:1} },
  { cat:'功能', name:'品质升阶石',   desc:'使用后,选择一张卡牌,将其品质提升一级',      price:50000, icon:'⬆️', effect:{type:'inventory',realId:82,count:1} },
  { cat:'功能', name:'完美洗练石',   desc:'使用后,选择一张卡牌,将其变为完美品质',   price:150000,icon:'🔥', effect:{type:'inventory',realId:83,count:1} },
  { cat:'功能', name:'技能书(攻击)',  desc:'使用后,选择一张卡牌,习得攻击技能',   price:12000, icon:'⚔️', effect:{type:'inventory',realId:84,count:1} },
  { cat:'功能', name:'技能书(防御)',  desc:'使用后,选择一张卡牌,习得防御技能',   price:12000, icon:'🛡️', effect:{type:'inventory',realId:85,count:1} },
  { cat:'功能', name:'技能书(辅助)',  desc:'使用后,选择一张卡牌,习得辅助技能',   price:12000, icon:'💊', effect:{type:'inventory',realId:86,count:1} },
  { cat:'功能', name:'技能遗忘卷轴',  desc:'使用后,将天赋树的技能遗忘，并重新分配天赋点',     price:8000,  icon:'📜', effect:{type:'inventory',realId:87,count:1} },
  { cat:'功能', name:'卡牌重置石',   desc:'使用后,选择一张卡牌,将其星级重置,且返还每级强化的强化粉',    price:30000, icon:'🔄', effect:{type:'inventory',realId:88,count:1} },
  { cat:'功能', name:'强化转移符',   desc:'使用后,选择两张张卡牌,将第一张卡牌的经验转移至第二张卡牌',     price:15000, icon:'↗️', effect:{type:'inventory',realId:89,count:1} },
  { cat:'功能', name:'星辰命名笔',   desc:'使用后,选择一张卡牌,重新命名该卡牌',     price:5000,  icon:'✏️', effect:{type:'inventory',realId:90,count:1} },
  { cat:'功能', name:'羁绊觉醒石',   desc:'使用后,选择一张卡牌,解锁羁绊(PVP无效）',     price:35000, icon:'💫', effect:{type:'inventory',realId:91,count:1} },
  { cat:'功能', name:'背包扩容符',   desc:'使用后,增加10个背包格',   price:20000, icon:'📦', effect:{type:'inventory',realId:92,count:1} },
  { cat:'功能', name:'逆转卡',       desc:'还原铁匠铺中尚未过期的副卡', price:12000, icon:'🔄', effect:{type:'inventory',realId:50041,count:1} },

  { cat:'战斗', name:'攻击卷轴',    desc:'使用后下次战斗攻击+25%(PVP无效)',     price:6000,  icon:'⚡', effect:{type:'inventory',realId:60001,count:1} },
  { cat:'战斗', name:'防御卷轴',    desc:'使用后下次战斗防御+25%(PVP无效)',     price:6000,  icon:'🛡️', effect:{type:'inventory',realId:60002,count:1} },
  { cat:'战斗', name:'速度卷轴',    desc:'使用后下次战斗攻速+20%(PVP无效)',     price:6000,  icon:'💨', effect:{type:'inventory',realId:60003,count:1} },
  { cat:'战斗', name:'暴击药水',    desc:'使用后下次战斗暴击率+15%(PVP无效)',   price:7000,  icon:'💥', effect:{type:'inventory',realId:60004,count:1} },
  { cat:'战斗', name:'生命护盾药水', desc:'使用后下次战斗获得20%生命护盾(PVP无效)', price:8000, icon:'💚', effect:{type:'inventory',realId:60005,count:1} },
  { cat:'战斗', name:'复活十字章',  desc:'使用后下次战斗可复活一次(PVP无效)',      price:12000, icon:'✝️', effect:{type:'inventory',realId:60006,count:1} },
  { cat:'战斗', name:'能量药剂',    desc:'使用后下次战斗初始能量+50%(PVP无效)',    price:9000,  icon:'🔋', effect:{type:'inventory',realId:60007,count:1} },

  { cat:'经济', name:'双倍金币卡',  desc:'使用后下场战斗金币翻倍', price:7000,  icon:'💳', effect:{type:'inventory',realId:60008,count:1} },
  { cat:'经济', name:'经验加成卡',  desc:'使用后下场战斗经验+60%', price:6500,  icon:'💳', effect:{type:'inventory',realId:60009,count:1} },
  { cat:'经济', name:'三倍金币卡',  desc:'使用后下场战斗金币三倍', price:18000, icon:'💳', effect:{type:'inventory',realId:60010,count:1} },
  { cat:'经济', name:'掉落加成符',  desc:'使用后下场战斗掉落率翻倍', price:8000, icon:'🍀', effect:{type:'inventory',realId:60011,count:1} },

  { cat:'特殊', name:'藏宝图',      desc:'使用后获得随机珍贵物品×1', price:15000, icon:'🗺️', effect:{type:'inventory',realId:60012,count:1} },
  { cat:'特殊', name:'道具礼盒',    desc:'打开获得随机道具',     price:4000,  icon:'🎁', effect:{type:'inventory',realId:9,count:1} },
  { cat:'特殊', name:'装备礼盒',    desc:'打开获得随机装备',     price:7000,  icon:'🎁', effect:{type:'inventory',realId:10,count:1} },
  { cat:'特殊', name:'随机技能书',  desc:'打开后获得随机技能书一本', price:9000, icon:'📖', effect:{type:'inventory',realId:60015,count:1} },
  { cat:'特殊', name:'幸运符',      desc:'提高制作卡牌时的高品质概率', price:12000, icon:'🍀', effect:{type:'inventory',realId:60016,count:1} },
  { cat:'特殊', name:'远古召唤卷',  desc:'使用后获得随机2~4级卡牌，品质随机', price:40000, icon:'📯', effect:{type:'inventory',realId:60017,count:1} },
];

export class ShopView {
  constructor(itemDb, inventory, cardDb, cardInventory, player, { onPlayerUpdate, onNavigate } = {}) {
    this.itemDb = itemDb;
    this.inventory = inventory;
    this.cardDb = cardDb;
    this.cardInventory = cardInventory;
    this.player = player;
    this.onPlayerUpdate = onPlayerUpdate;
    this.onNavigate = onNavigate;
    this.tab = 'recharge';
    this.classicCategory = 'recommend';
    this.classicSubcategory = '';
    this.classicPage = 0;
    this.cart = new Map();
  }

  render(root) {
    root.innerHTML = `<div class="page shop-page classic-shop-screen">
      <header class="classic-shop-header">
        <h1>商城</h1>
        <nav class="classic-shop-categories" aria-label="商城分类">
          ${CLASSIC_SHOP_CATEGORIES.map((category) => `<button type="button" data-shop-category="${category.id}">${category.label}</button>`).join('')}
        </nav>
        <button type="button" class="classic-shop-close" aria-label="返回大厅">×</button>
      </header>
      <div class="classic-shop-layout">
        <aside class="classic-shop-profile">
          <div class="classic-shop-player-line"><strong>${this.player?.nickname ?? this.player?.name ?? '森林守卫'}</strong><span>排名 ${Math.max(1, Number(this.player?.rank) || 57334)}</span></div>
          <div class="classic-shop-avatar" data-character-empty="true" aria-label="人物形象预留区域">
            <button type="button" class="shop-equip shop-equip-hat">帽子</button>
            <button type="button" class="shop-equip shop-equip-glass">眼镜</button>
            <button type="button" class="shop-equip shop-equip-cloth">衣服</button>
            <button type="button" class="shop-equip shop-equip-suit">套装</button>
            <button type="button" class="shop-equip shop-equip-eye">眼睛</button>
            <button type="button" class="shop-equip shop-equip-face">脸饰</button>
            <button type="button" class="shop-equip shop-equip-ring">戒指</button>
            <button type="button" class="shop-equip shop-equip-neck">项链</button>
          </div>
          <section class="classic-shop-cart">
            <div><strong>购物车中已有 <b data-cart-count>0</b> 件商品</strong><span>目前拥有</span></div>
            <ul data-cart-list><li>购物车为空</li></ul>
            <div class="classic-shop-wallet">
              <span>${this.renderCurrencyIcon('gem')}<b data-shop-gem>${Math.max(0, Number(this.player?.gem) || 0)}</b></span>
              <span>${this.renderCurrencyIcon('gold')}<b data-shop-gold>${Math.max(0, Number(this.player?.gold) || 0)}</b></span>
            </div>
            <button type="button" class="classic-shop-checkout" data-shop-checkout>结算购物车</button>
          </section>
        </aside>
        <main class="classic-shop-catalog">
          <div class="classic-shop-subcategories" data-shop-subcategories></div>
          <div class="classic-shop-title"><h2 data-shop-title>推荐商品</h2><span>点击商品加入购物车</span></div>
          <div class="classic-shop-products" data-shop-products></div>
          <div class="classic-shop-pager"><button type="button">上一页</button><b>1 / 1</b><button type="button">下一页</button></div>
        </main>
      </div>
      <p id="shop-toast" class="bag-toast hidden"></p>
    </div>`;

    const cartCost = root.querySelector('.classic-shop-wallet');
    if (cartCost) {
      cartCost.classList.add('classic-shop-cart-cost');
      cartCost.dataset.shopCartCost = '';
      cartCost.innerHTML = '<span>' + this.renderCurrencyIcon('gem')
        + '<b data-cart-required-gem>0</b></span><span>' + this.renderCurrencyIcon('gold')
        + '<b data-cart-required-gold>0</b></span>';
    }
    const cartCaption = root.querySelector('.classic-shop-cart > div:first-child span');
    if (cartCaption) cartCaption.textContent = '购物车所需';
    root.querySelector('.classic-shop-screen')?.insertAdjacentHTML(
      'beforeend',
      '<div class=classic-shop-player-wallet data-shop-player-wallet><strong>当前货币</strong><span>'
        + this.renderCurrencyIcon('gem') + '<b data-shop-gem>'
        + Math.max(0, Number(this.player?.gem) || 0) + '</b></span><span>'
        + this.renderCurrencyIcon('gold') + '<b data-shop-gold>'
        + Math.max(0, Number(this.player?.gold) || 0) + '</b></span></div>',
    );

    root.querySelector('.classic-shop-close')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('main');
    });
    root.querySelectorAll('[data-shop-category]').forEach((button) => button.addEventListener('click', () => {
      audio.playSfx('click');
      this.classicCategory = button.dataset.shopCategory;
      this.classicSubcategory = CLASSIC_SHOP_SUBCATEGORIES[this.classicCategory]?.[0] ?? '';
      this.classicPage = 0;
      this.renderClassicCatalog(root);
    }));
    root.querySelector('[data-shop-checkout]')?.addEventListener('click', () => this.checkoutClassicCart(root));
    this.renderClassicCatalog(root);
  }

  getClassicProducts() {
    const packs = packData.map((pack, index) => ({
      key: `pack:${index}`,
      kind: 'pack',
      name: pack.item_name,
      desc: `随机${[pack.firstQuality, pack.secondQuality, pack.thirdQuality].filter(Boolean).map((quality) => QUALITY_NAMES[quality] || quality).join('~')}卡牌`,
      icon: '🃏',
      category: 'recommend',
      data: pack,
    }));
    const items = SHOP_ITEMS.map((item, index) => ({
      key: `item:${index}`,
      kind: 'item',
      name: item.name,
      desc: item.desc,
      icon: item.icon,
      realId: item.effect?.realId,
      materialSprite: getCraftMaterialSprite(item.effect?.realId),
      shopIndex: index,
      category: item.cat === '货币' ? 'coupon' : 'item',
      subcategory: item.cat,
      data: item,
    }));
    const dnaMaterials = (this.itemDb?.items ?? [])
      .filter((item) => Number(item.id) >= 50031 && Number(item.id) <= 50034)
      .map((item) => ({
        key: 'dna:' + item.id,
        kind: 'item',
        name: item.name,
        desc: item.desc || '卡牌制造材料',
        icon: '',
        realId: item.id,
        materialImage: getCraftMaterialImage(item.id),
        category: 'item',
        subcategory: '材料',
        data: {
          price: Math.max(1000, (Number(item.sellPrice) || 200) * 5),
          effect: { type: 'inventory', realId: item.id, count: 1 },
        },
      }));
    const fashionType = (showType) => {
      if (showType === '头盔') return '帽子';
      if (showType === '护甲') return '衣服';
      if (showType === '套装') return '套装';
      if (showType === '眼镜') return '眼镜';
      return '饰品';
    };
    const fashions = (this.itemDb?.items ?? [])
      .filter((item) => Number(item.type) === 3
        && ['头盔', '护甲', '披肩', '武器', '翅膀', '套装', '首饰', '眼镜'].includes(item.showType))
      .map((item) => ({
        key: `fashion:${item.id}`,
        kind: 'item',
        name: item.name,
        desc: item.desc || item.showType || '服饰',
        icon: '',
        realId: item.id,
        category: 'fashion',
        subcategory: fashionType(item.showType),
        sex: Number(item.sex) || 0,
        data: {
          price: Math.max(800, (Number(item.sellPrice) || 200) * 5),
          effect: { type: 'inventory', realId: item.id, count: 1 },
        },
      }));
    const recharge = payData.map((pay, index) => ({
      key: `recharge:${index}`,
      kind: 'recharge',
      name: `${pay.pay_value}钻石`,
      desc: pay.pay_give > 0 ? `额外赠送 ${pay.pay_give} 钻石` : '钻石充值券',
      icon: '◆',
      category: 'coupon',
      data: pay,
    }));
    return [...packs, ...items, ...dnaMaterials, ...fashions, ...recharge];
  }

  getClassicVisibleProducts() {
    const products = this.getClassicProducts();
    if (this.classicCategory === 'cart') return [...this.cart.values()].map((entry) => entry.product);
    if (this.classicCategory === 'recommend') return [...products.filter((product) => product.kind === 'pack').slice(0, 4), ...products.filter((product) => product.kind === 'item').slice(0, 8)];
    if (this.classicCategory === 'fitting') return products.filter((product) => product.category === 'fashion').slice(0, 12);
    let visible = products.filter((product) => product.category === this.classicCategory);
    if (this.classicCategory === 'item' && this.classicSubcategory && this.classicSubcategory !== '全部') {
      visible = visible.filter((product) => product.subcategory === this.classicSubcategory);
    } else if (this.classicCategory === 'fashion' && this.classicSubcategory) {
      if (this.classicSubcategory === 'GG') visible = visible.filter((product) => product.sex === 0 || product.sex === 1);
      else if (this.classicSubcategory === 'MM') visible = visible.filter((product) => product.sex === 0 || product.sex === 2);
      else visible = visible.filter((product) => product.subcategory === this.classicSubcategory);
    }
    return visible;
  }

  renderClassicSubcategories(root) {
    const host = root.querySelector('[data-shop-subcategories]');
    if (!host) return;
    const labels = CLASSIC_SHOP_SUBCATEGORIES[this.classicCategory] ?? [];
    host.classList.toggle('empty', labels.length === 0);
    host.innerHTML = labels.map((label) =>
      `<button type="button" data-shop-subcategory="${label}" class="${label === this.classicSubcategory ? 'active' : ''}">${label}</button>`,
    ).join('');
    host.querySelectorAll('[data-shop-subcategory]').forEach((button) => button.addEventListener('click', () => {
      audio.playSfx('click');
      this.classicSubcategory = button.dataset.shopSubcategory;
      this.classicPage = 0;
      this.renderClassicCatalog(root);
    }));
  }

  renderClassicProductIcon(product) {
    if (product.materialSprite) {
      const sprite = product.materialSprite;
      const rect = [sprite.x, sprite.y, sprite.width, sprite.height].join(',');
      return '<span class=classic-shop-material data-shop-gem-tier=' + sprite.level
        + ' data-sprite-rect=' + rect + ' style="' + getCraftMaterialSpriteStyle(sprite) + '"></span>';
    }
    if (product.materialImage) {
      const level = Number(product.realId) - 50030;
      return '<span class=classic-shop-material data-shop-dna-level=' + level
        + '><img src=' + product.materialImage + ' alt></span>';
    }
    const extension = getShopExtensionSprite(product.shopIndex, product.realId);
    if (extension) {
      const scale = Math.min(0.62, 74 / Math.max(extension.width, extension.height));
      return `<span class="classic-shop-extension"><i style="width:${extension.width}px;height:${extension.height}px;background-image:url('${ITEM_EXTENSION_URL}');background-position:-${extension.x}px -${extension.y}px;transform:translate(-50%,-50%) scale(${scale.toFixed(4)})"></i></span>`;
    }
    const effectIcon = {
      gold: 'gold_icon',
      gem: 'blueDiamond_icon',
      honor: 'honor_icon',
      exp: 'exp_icon',
      stamina: 'power_icon',
    }[product.data?.effect?.type];
    // 商品图标优先用 item 图集(与背包同源, 数据来自 item.json)，其次货币类型图，最后 emoji 兜底
    const itemImg = this.itemDb?.getById?.(Number(product.realId))?.img;
    const sprite = SHOP_ITEM_ATLAS.get(effectIcon ?? String(itemImg ?? product.realId))
      ?? (itemImg ? SHOP_ITEM_ATLAS.get(String(itemImg)) : null);
    if (!sprite) {
      // 合成材料(羊皮纸/宝石等)：与背包同源，用 Smithy 材料图（atlas 无 50001 等键）
      const craftImg = getCraftMaterialImage?.(Number(product.realId));
      if (craftImg) return `<span class="classic-shop-material"><img src="${craftImg}" alt="" draggable="false"></span>`;
      const craftSpr = getCraftMaterialSprite?.(Number(product.realId));
      if (craftSpr) {
        const rect = [craftSpr.x, craftSpr.y, craftSpr.width, craftSpr.height].join(',');
        return `<span class="classic-shop-material" data-sprite-rect="${rect}" style="${getCraftMaterialSpriteStyle(craftSpr)}"></span>`;
      }
      return `<span class="classic-shop-emoji">${product.icon}</span>`;
    }
    const width = Math.max(1, Number(sprite.width) || 45);
    const height = Math.max(1, Number(sprite.height) || 45);
    const scale = Math.min(1, 76 / Math.max(width, height));
    return `<span class="classic-shop-atlas"><i style="width:${width}px;height:${height}px;background-position:-${sprite.x}px -${sprite.y}px;transform:translate(-50%,-50%) scale(${scale.toFixed(4)})"></i></span>`;
  }

  renderCurrencyIcon(currency) {
    const spriteName = currency === 'gem' ? 'blue-diamond' : 'gold';
    const sprite = SHOP_ITEM_ATLAS.get(spriteName);
    if (!sprite) return '';
    return `<span class="classic-currency-icon" data-currency="${currency}" aria-hidden="true"><i style="width:${sprite.width}px;height:${sprite.height}px;background-position:-${sprite.x}px -${sprite.y}px"></i></span>`;
  }

  formatClassicPrice(product) {
    if (product.kind === 'recharge') return `¥${product.data.pay_price}`;
    if (product.kind === 'pack') {
      if (Number(product.data.redDiamond) > 0) return `${this.renderCurrencyIcon('gem')} ${product.data.redDiamond}`;
      return `${this.renderCurrencyIcon('gold')} ${Math.max(0, Number(product.data.gold) || 0)}`;
    }
    return `${this.renderCurrencyIcon('gold')} ${Math.max(0, Number(product.data.price) || 0)}`;
  }

  renderClassicCatalog(root) {
    root.querySelectorAll('[data-shop-category]').forEach((button) => button.classList.toggle('active', button.dataset.shopCategory === this.classicCategory));
    this.renderClassicSubcategories(root);
    const category = CLASSIC_SHOP_CATEGORIES.find((entry) => entry.id === this.classicCategory);
    const title = root.querySelector('[data-shop-title]');
    if (title) title.textContent = category?.label ?? '推荐商品';
    const allProducts = this.getClassicVisibleProducts();
    const totalPages = Math.max(1, Math.ceil(allProducts.length / CLASSIC_SHOP_PAGE_SIZE));
    this.classicPage = Math.max(0, Math.min(this.classicPage, totalPages - 1));
    const pageStart = this.classicPage * CLASSIC_SHOP_PAGE_SIZE;
    const products = allProducts.slice(pageStart, pageStart + CLASSIC_SHOP_PAGE_SIZE);
    const catalog = root.querySelector('[data-shop-products]');
    catalog.innerHTML = products.length ? products.map((product) => `<article class="classic-shop-product">
      <div class="classic-shop-product-art">${this.renderClassicProductIcon(product)}</div>
      <div class="classic-shop-product-copy"><h3>${product.name}</h3><p>${product.desc}</p><span>${this.formatClassicPrice(product)}</span></div>
      <button type="button" class="shop-buy-btn" data-add-cart="${product.key}" aria-label="加入购物车：${product.name}">加入购物车</button>
    </article>`).join('') : '<p class="classic-shop-empty">当前分类暂无商品。</p>';
    catalog.querySelectorAll('.classic-shop-product').forEach((article, index) => {
      const product = products[index];
      article.dataset.shopItemId = String(product?.realId ?? '');
      const extension = getShopExtensionSprite(product?.shopIndex, product?.realId);
      const extensionNode = article.querySelector('.classic-shop-extension');
      if (extensionNode && extension) {
        extensionNode.dataset.spriteRect = [
          extension.x,
          extension.y,
          extension.width,
          extension.height,
        ].join(',');
      }
    });
    catalog.querySelectorAll('[data-add-cart]').forEach((button) => button.addEventListener('click', () => {
      const product = this.getClassicProducts().find((entry) => entry.key === button.dataset.addCart);
      if (!product) return;
      const current = this.cart.get(product.key);
      this.cart.set(product.key, { product, quantity: (current?.quantity ?? 0) + 1 });
      audio.playSfx('click');
      this.renderClassicCart(root);
      this.toast(root, `已加入购物车：${product.name}`);
    }));
    const pager = root.querySelector('.classic-shop-pager');
    const pagerButtons = pager ? [...pager.querySelectorAll('button')] : [];
    const previousButton = pagerButtons[0];
    const nextButton = pagerButtons[1];
    const pageLabel = pager?.querySelector('b');
    if (pageLabel) pageLabel.textContent = `${this.classicPage + 1} / ${totalPages}`;
    if (previousButton) {
      previousButton.disabled = this.classicPage === 0;
      previousButton.onclick = () => {
        if (this.classicPage <= 0) return;
        this.classicPage -= 1;
        this.renderClassicCatalog(root);
      };
    }
    if (nextButton) {
      nextButton.disabled = this.classicPage >= totalPages - 1;
      nextButton.onclick = () => {
        if (this.classicPage >= totalPages - 1) return;
        this.classicPage += 1;
        this.renderClassicCatalog(root);
      };
    }
    catalog.scrollTop = 0;
    this.renderClassicCart(root);
  }

  resolveClassicCartCost(entries = [...this.cart.values()]) {
    return entries.reduce((sum, entry) => {
      const quantity = Math.max(0, Number(entry.quantity) || 0);
      if (entry.product.kind === 'pack') {
        sum.gem += Math.max(0, Number(entry.product.data.redDiamond) || 0) * quantity;
        sum.gold += Math.max(0, Number(entry.product.data.gold) || 0) * quantity;
      } else if (entry.product.kind === 'item') {
        sum.gold += Math.max(0, Number(entry.product.data.price) || 0) * quantity;
      }
      return sum;
    }, { gem: 0, gold: 0 });
  }

  renderClassicCart(root) {
    const entries = [...this.cart.values()];
    const count = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const required = this.resolveClassicCartCost(entries);
    const countEl = root.querySelector('[data-cart-count]');
    if (countEl) countEl.textContent = count;
    const list = root.querySelector('[data-cart-list]');
    if (list) list.innerHTML = entries.length ? entries.slice(0, 5).map((entry) => `<li><span>${entry.product.name}</span><b>×${entry.quantity}</b></li>`).join('') : '<li>购物车为空</li>';
    const gem = root.querySelector('[data-shop-gem]');
    const gold = root.querySelector('[data-shop-gold]');
    const requiredGem = root.querySelector('[data-cart-required-gem]');
    const requiredGold = root.querySelector('[data-cart-required-gold]');
    if (gem) gem.textContent = Math.max(0, Number(this.player?.gem) || 0);
    if (gold) gold.textContent = Math.max(0, Number(this.player?.gold) || 0);
    if (requiredGem) requiredGem.textContent = required.gem;
    if (requiredGold) requiredGold.textContent = required.gold;
    const checkout = root.querySelector('[data-shop-checkout]');
    if (checkout) checkout.disabled = entries.length === 0;
  }

  checkoutClassicCart(root) {
    const entries = [...this.cart.values()];
    if (!entries.length) return;
    const required = this.resolveClassicCartCost(entries);
    if (Math.max(0, Number(this.player.gem) || 0) < required.gem) {
      this.toast(root, '\u94bb\u77f3\u4e0d\u8db3\uff0c\u8d2d\u7269\u8f66\u672a\u6263\u6b3e');
      return;
    }
    if (Math.max(0, Number(this.player.gold) || 0) < required.gold) {
      this.toast(root, '\u91d1\u5e01\u4e0d\u8db3\uff0c\u8d2d\u7269\u8f66\u672a\u6263\u6b3e');
      return;
    }
    let purchased = 0;
    const remaining = new Map(this.cart);
    let stopped = false;
    for (const entry of entries) {
      let bought = 0;
      for (let index = 0; index < entry.quantity; index += 1) {
        if (!this.purchaseClassicProduct(entry.product, root)) {
          stopped = true;
          break;
        }
        bought += 1;
        purchased += 1;
      }
      if (bought >= entry.quantity) remaining.delete(entry.product.key);
      else if (bought > 0) remaining.set(entry.product.key, { ...entry, quantity: entry.quantity - bought });
      if (stopped) break;
    }
    this.cart = remaining;
    if (purchased > 0) {
      this.onPlayerUpdate?.();
      this.renderClassicCatalog(root);
      this.toast(root, remaining.size
        ? `成功购买 ${purchased} 件商品，其余商品保留在购物车`
        : `成功购买 ${purchased} 件商品`);
    }
  }

  purchaseClassicProduct(product, root) {
    if (product.kind === 'recharge') {
      this.player.gem = (this.player.gem || 0) + product.data.pay_value + (product.data.pay_give || 0);
      return true;
    }
    if (product.kind === 'pack') {
      const gemCost = Math.max(0, Number(product.data.redDiamond) || 0);
      const goldCost = Math.max(0, Number(product.data.gold) || 0);
      if (gemCost > 0 && (this.player.gem || 0) < gemCost) { this.toast(root, '钻石不足'); return false; }
      if (goldCost > 0 && (this.player.gold || 0) < goldCost) { this.toast(root, '金币不足'); return false; }
      const qualities = [product.data.firstQuality, product.data.secondQuality, product.data.thirdQuality].filter(Boolean);
      const quality = qualities[Math.floor(Math.random() * qualities.length)];
      const cards = this.cardDb.getCollectibleCards().filter((card) => card.quality === quality);
      const card = cards[Math.floor(Math.random() * cards.length)];
      if (!card || !this.cardInventory.addCard(card.id, 0, { craftQuality: 1 }).ok) { this.toast(root, '卡牌背包已满'); return false; }
      if (gemCost > 0) this.player.gem -= gemCost;
      if (goldCost > 0) this.player.gold -= goldCost;
      return true;
    }
    const item = product.data;
    const price = Math.max(0, Number(item.price) || 0);
    if ((this.player.gold || 0) < price) { this.toast(root, '金币不足'); return false; }
    const effect = item.effect;
    if (effect.type === 'inventory') {
      if (!this.inventory || !this.itemDb?.getById(effect.realId)) { this.toast(root, '道具配置缺失'); return false; }
      if (!this.inventory.addItem(effect.realId, effect.count)) { this.toast(root, '背包已满'); return false; }
    }
    this.player.gold -= price;
    if (effect.type === 'gold') this.player.gold += effect.amount;
    else if (effect.type === 'gem') this.player.gem = (this.player.gem || 0) + effect.amount;
    else if (effect.type === 'honor') this.player.honor = (this.player.honor || 0) + effect.amount;
    else if (effect.type === 'exp') this.player.exp = (this.player.exp || 0) + effect.amount;
    else if (effect.type === 'stamina') this.player.stamina = Math.min(200, (this.player.stamina || 0) + effect.amount);
    else if (effect.type === 'buff') this._applyBuff(effect);
    return true;
  }

  renderBody(root) {
    root.querySelectorAll('.shop-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===this.tab));
    const body=root.querySelector('#shop-body');
    if(this.tab==='recharge')this.renderRecharge(body,root);
    else if(this.tab==='pack')this.renderPack(body,root);
    else this.renderItem(body,root);
  }

  renderRecharge(body,root){
    body.innerHTML=`<p class="shop-section-title">💎钻石充值</p><div class="shop-grid">${payData.map(p=>`<div class="shop-card"><div class="shop-card-icon">💎</div><div class="shop-card-body"><h3>${p.pay_value}钻石</h3><p>${p.pay_give>0?'赠送'+p.pay_give:'无赠送'}</p></div><div class="shop-card-footer"><span class="shop-price">¥${p.pay_price}</span><button type="button" class="shop-buy-btn" data-type="recharge" data-id="${p.pay_id}">${p.pay_give>0?'🔥热卖':'购买'}</button></div></div>`).join('')}</div>`;
    body.querySelectorAll('[data-type=recharge]').forEach(btn=>{btn.addEventListener('click',()=>{audio.playSfx('click');const p=payData.find(x=>x.pay_id===Number(btn.dataset.id));if(!p)return;this.player.gem=(this.player.gem||0)+p.pay_value+(p.pay_give||0);this.onPlayerUpdate?.();this.toast(root,'充值成功！');});});
  }

  renderPack(body,root){
    body.innerHTML=`<p class="shop-section-title">🃏卡牌包</p><div class="shop-grid">${packData.map(p=>{const qs=[p.firstQuality,p.secondQuality,p.thirdQuality].filter(Boolean);const qd=qs.map(q=>QUALITY_NAMES[q]||q).join('~');const gp=p.redDiamond>0?p.redDiamond:null;const gop=p.gold>0?p.gold:null;return`<div class="shop-card"><div class="shop-card-icon">🃏</div><div class="shop-card-body"><h3>${p.item_name}</h3><p>随机${qd}卡牌</p><span class="shop-pack-badge">${qd}</span></div><div class="shop-card-footer"><span class="shop-price">${gp?'💎'+gp:''}${gop?'💰'+gop:''}</span><button type="button" class="shop-buy-btn" data-type="pack" data-id="${p.item_id}" data-gem="${gp||0}" data-gold="${gop||0}">购买</button></div></div>`;}).join('')}</div>`;
    body.querySelectorAll('[data-type=pack]').forEach(btn=>{btn.addEventListener('click',()=>{audio.playSfx('click');const pk=packData.find(x=>x.item_id===Number(btn.dataset.id));if(!pk)return;const gm=Number(btn.dataset.gem),go=Number(btn.dataset.gold);if(gm>0&&(this.player.gem||0)<gm){this.toast(root,'钻石不足');return;}if(go>0&&(this.player.gold||0)<go){this.toast(root,'金币不足');return;}if(gm>0)this.player.gem-=gm;else if(go>0)this.player.gold-=go;const qs=[pk.firstQuality,pk.secondQuality,pk.thirdQuality].filter(Boolean);const q=qs[Math.floor(Math.random()*qs.length)];const cs=this.cardDb.getCollectibleCards().filter(c=>c.quality===q);if(!cs.length){this.toast(root,'无可用卡牌');return;}const c=cs[Math.floor(Math.random()*cs.length)];const r=this.cardInventory.addCard(c.id,0,{craftQuality:1});if(!r.ok){this.toast(root,'背包已满');return;}this.onPlayerUpdate?.();this.toast(root,'🎉抽到「'+c.name+'」');});});
  }

  renderItem(body,root){
    const cats=[...new Set(SHOP_ITEMS.map(i=>i.cat))];
    let h=`<p class="shop-section-title">📦道具商店(${SHOP_ITEMS.length}种)</p>`;
    const map={}; let idx=0;
    for(const cat of cats){const items=SHOP_ITEMS.filter(i=>i.cat===cat);for(const it of items){map[idx]=it;idx++;}}
    for(const cat of cats){
      const items=SHOP_ITEMS.filter(i=>i.cat===cat);
      h+=`<div class="shop-category-block"><h3 class="shop-cat-head">${this._catIcon(cat)}${cat}</h3><div class="shop-grid">`;
      for(let j=0;j<items.length;j++){
        const it=items[j]; const id=Object.keys(map).find(k=>map[k]===it);
        h+=`<div class="shop-card"><div class="shop-card-icon">${it.icon}</div><div class="shop-card-body"><h3>${it.name}</h3><p>${it.desc}</p></div><div class="shop-card-footer"><span class="shop-price">💰${it.price}</span><button type="button" class="shop-buy-btn" data-type="item" data-idx="${id}" data-price="${it.price}">购买</button></div></div>`;
      }
      h+='</div></div>';
    }
    body.innerHTML=h;
    body.querySelectorAll('[data-type=item]').forEach(btn=>{btn.addEventListener('click',()=>{
      audio.playSfx('click');
      const it=map[Number(btn.dataset.idx)];
      if(!it)return;
      const price=Number(btn.dataset.price);
      if((this.player.gold||0)<price){this.toast(root,'金币不足');return;}
      const inventoryEffect=it.effect;
      if(inventoryEffect.type==='inventory'){
        if(!this.inventory||!this.itemDb?.getById(inventoryEffect.realId)){
          this.toast(root,'道具配置缺失，未扣除金币');
          return;
        }
        if(!this.inventory.addItem(inventoryEffect.realId,inventoryEffect.count)){
          this.toast(root,'背包已满，未扣除金币');
          return;
        }
        this.player.gold-=price;
        this.toast(root,'购买成功：'+it.name);
        this.onPlayerUpdate?.();
        return;
      }
      this.player.gold-=price;
      const e=it.effect;
      switch(e.type){
        case'gold':this.player.gold=(this.player.gold||0)+e.amount;this.toast(root,'获得'+e.amount+'金币！');break;
        case'gem':this.player.gem=(this.player.gem||0)+e.amount;this.toast(root,'获得'+e.amount+'钻石！');break;
        case'honor':this.player.honor=(this.player.honor||0)+e.amount;this.toast(root,'获得'+e.amount+'荣誉！');break;
        case'exp':this.player.exp=(this.player.exp||0)+e.amount;this.toast(root,'获得大量经验！');break;
        case'stamina':this.player.stamina=Math.min(200,(this.player.stamina||0)+e.amount);this.toast(root,'体力恢复'+e.amount+'！');break;
        case'inventory':if(this.inventory)this.inventory.addItem(e.realId,e.count);this.toast(root,'获得'+it.name+'！');break;
        case'buff':this._applyBuff(e);this.toast(root,it.name+'已生效！');break;
      }
      this.onPlayerUpdate?.();
    });});
  }

  _applyBuff(e){
    if(!this.player.buffs)this.player.buffs={};
    if(['gold2x','gold3x','drop2x','revive'].includes(e.key))this.player.buffs[e.key]=(this.player.buffs[e.key]||0)+e.val;
    else this.player.buffs[e.key]=e.val;
  }

  _catIcon(c){const m={'货币':'💰','强化':'✦','材料':'💎','功能':'🔧','战斗':'⚔️','经济':'📈','特殊':'🌟'};return m[c]||'📦';}

  toast(root,msg){const el=root.querySelector('#shop-toast');if(!el)return;el.textContent=msg;el.classList.remove('hidden');clearTimeout(this._t);this._t=setTimeout(()=>el.classList.add('hidden'),2200);}
}
