import {
  CARD_QUALITY,
  CARD_TYPE,
  formatCraftCardName,
  getInstanceStatMultiplier,
  resolveCraftQuality,
  sanitizeCustomCardName,
} from '../core/constants.js';
import { roundBattleAmount } from '../battle/BattleConfig.js';
import { audio } from '../core/AudioManager.js';
import { ItemUseSystem } from '../systems/ItemUseSystem.js';
import itemAtlasData from '../data/atlas/preload_items.json';
import {
  getItemExtensionSprite,
  ITEM_EXTENSION_URL,
} from './ItemExtensionSprites.js';
import {
  getCraftMaterialImage,
  getCraftMaterialSprite,
  getCraftMaterialSpriteStyle,
} from './SmithyMaterialArtwork.js';

const MODE_TABS = [
  { id: 'item', label: '背包' },
  { id: 'card', label: '卡牌' },
];

const ITEM_ATLAS = new Map(itemAtlasData.sprites.map((sprite) => [String(sprite.name), sprite]));

const ITEM_TABS = [
  { id: 'all', label: '全部' },
  { id: '1', label: '道具' },
  { id: '3', label: '强化' },
  { id: '2', label: '其他' },
];

const CARD_TYPE_TABS = [
  { id: 'all', label: '全部' },
  ...Object.entries(CARD_TYPE).map(([k, v]) => ({ id: k, label: v })),
];

export class BagView {
  constructor(itemDb, inventory, cardDb, cardInventory, player, { onPlayerUpdate, onNavigate } = {}) {
    this.itemDb = itemDb;
    this.inventory = inventory;
    this.cardDb = cardDb;
    this.cardInventory = cardInventory;
    this.player = player;
    this.onPlayerUpdate = onPlayerUpdate;
    this.onNavigate = onNavigate;
    this.itemUse = new ItemUseSystem(cardDb, itemDb);
    this.mode = 'item';
    this.tab = 'all';
    this.cardKeyword = '';
    this.cardQuality = '';
    this.selectedIndex = -1;
    this._imeComposing = false;
  }

  render(root) {
    root.innerHTML = `
      <div class="page bag-page jungle-bag-workbench classic-bag-screen">
        <header class="bag-header">
          <nav class="classic-bag-section-tabs" aria-label="角色页面">
            <button type="button" class="active" data-bag-section="profile">资料</button>
            <button type="button" data-bag-section="talent">天赋</button>
          </nav>
          <h1>背包</h1>
          <button type="button" id="bag-debug-btn" title="测试补发道具">🧪补发</button>
          <p class="bag-capacity" id="bag-capacity-text">已用 <b id="bag-used">0</b> / <b id="bag-max">0</b> 格</p>
          <button type="button" class="classic-bag-close" aria-label="返回大厅">×</button>
        </header>
        <div class="bag-mode-tabs classic-bag-tabs">
          ${MODE_TABS.map(
            (t) =>
              `<button type="button" class="bag-mode-tab" data-mode="${t.id}" data-bag-page="${t.id === 'item' ? 'items' : 'cards'}">${t.label}</button>`,
          ).join('')}
        </div>
        <div class="bag-toolbar" id="bag-toolbar"></div>
        <div class="bag-body">
          <aside class="bag-profile-panel classic-bag-profile" aria-label="角色资料">
            <div class="bag-profile-title"><span id="bag-profile-name">${this.player?.nickname ?? this.player?.name ?? '森林守卫'}</span><b id="bag-profile-level"></b></div>
            <div class="bag-profile-lines"><span>公会：${this.player?.guildName ?? '无'}</span><span>排名 <b>${Math.max(1, Number(this.player?.rank) || 4044)}</b></span></div>
            <div class="bag-role-frame">
              <span class="bag-role-mark" aria-hidden="true"><i></i><b>森林守卫</b></span>
              <button type="button" class="bag-equip-slot bag-equip-hat">帽子</button>
              <button type="button" class="bag-equip-slot bag-equip-hair">头发</button>
              <button type="button" class="bag-equip-slot bag-equip-glass">眼镜</button>
              <button type="button" class="bag-equip-slot bag-equip-eye">眼睛</button>
              <button type="button" class="bag-equip-slot bag-equip-cloth">衣服</button>
              <button type="button" class="bag-equip-slot bag-equip-face">脸饰</button>
              <button type="button" class="bag-equip-slot bag-equip-suit">套装</button>
              <button type="button" class="bag-equip-slot bag-equip-ring">戒指</button>
              <button type="button" class="bag-equip-slot bag-equip-neck">项链</button>
              <button type="button" class="bag-equip-slot bag-equip-badge">翅膀</button>
            </div>
            <dl class="bag-profile-stats">
              <div><dt>竞技积分</dt><dd id="bag-profile-arena"></dd></div><div><dt>经验</dt><dd>${Math.max(0, Number(this.player?.exp) || 0)}%</dd></div>
              <div><dt>生命</dt><dd id="bag-profile-hp"></dd></div><div><dt>荣誉</dt><dd id="bag-profile-honor"></dd></div>
              <div><dt>卡数</dt><dd>${this.cardInventory.getUsedCount()}</dd></div><div><dt>金币</dt><dd id="bag-profile-gold"></dd></div>
            </dl>
          </aside>
          <div id="bag-grid" class="bag-grid classic-bag-grid"></div>
          <aside id="bag-detail" class="bag-detail empty">
            <p id="bag-detail-hint">点击物品查看详情</p>
          </aside>
        </div>
        <footer class="classic-bag-footer">
          <span class="bag-currency bag-currency-gem">◆ ${Math.max(0, Number(this.player?.gem) || 0)}</span>
          <span class="bag-currency bag-currency-coupon">♢ ${Math.max(0, Number(this.player?.coupon) || 0)}</span>
          <span class="bag-currency bag-currency-gold">● ${Math.max(0, Number(this.player?.gold) || 0)}</span>
          <button type="button" id="bag-footer-sell">出售物品</button>
          <button type="button" id="bag-footer-organize">背包整理</button>
          <button type="button" id="bag-footer-split">拆分物品</button>
        </footer>
        <p id="bag-toast" class="bag-toast hidden"></p>
      </div>
    `;

    root.querySelector('#bag-profile-level').textContent = `Lv.${Math.max(1, Number(this.player?.level) || 1)}`;
    root.querySelector('#bag-profile-hp').textContent = Math.max(1, Number(this.player?.hp) || 1000);
    root.querySelector('#bag-profile-honor').textContent = Math.max(0, Number(this.player?.honor) || 0);
    root.querySelector('#bag-profile-arena').textContent = Math.max(0, Number(this.player?.arena) || 0);
    root.querySelector('#bag-profile-gold').textContent = Math.max(0, Number(this.player?.gold) || 0);

    this.bindModeEvents(root);
    this.refresh(root);
  }

  bindModeEvents(root) {
    root.querySelector('.classic-bag-close')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('main');
    });
    root.querySelector('[data-bag-section="talent"]')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('talent');
    });
    root.querySelector('#bag-footer-organize')?.addEventListener('click', () => this.handleOrganize(root));
    root.querySelector('#bag-footer-sell')?.addEventListener('click', () => {
      root.querySelector('#bag-sell, #bag-card-drop')?.click();
    });
    root.querySelector('#bag-footer-split')?.addEventListener('click', () => {
      this.toast(root, '请选择可堆叠物品；拆分数量功能将在物品详情中开放。');
    });
    root.querySelector('#bag-debug-btn')?.addEventListener('click', () => {
      audio.playSfx('click');
      const testItems = [1,1,1, 2,2, 3, 5, 9, 15, 10001,10001,10002,10003, 30055,30055, 31055, 80,81,82,84,92];
      for (const id of testItems) this.inventory.addItem(id, 1);
      this.player.gold = (this.player.gold||0) + 100000;
      this.player.gem = (this.player.gem||0) + 500;
      this.onPlayerUpdate?.();
      this.refresh(root);
      this.toast(root, `补发 ${testItems.length} 个测试道具 + 100k金币 + 500钻`);
    });
    root.querySelectorAll('.bag-mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playSfx('click');
        if (btn.dataset.mode === 'talent') {
          this.onNavigate?.('talent');
          return;
        }
        this.mode = btn.dataset.mode;
        this.tab = 'all';
        this.cardKeyword = '';
        this.cardQuality = '';
        this.selectedIndex = -1;
        this.refresh(root);
      });
    });
  }

  getActiveStore() {
    return this.mode === 'card' ? this.cardInventory : this.inventory;
  }

  renderToolbar(root) {
    const toolbar = root.querySelector('#bag-toolbar');
    if (this.mode === 'item') {
      toolbar.innerHTML = `
        <div class="bag-tabs">
          ${ITEM_TABS.map(
            (t) =>
              `<button type="button" class="bag-tab" data-tab="${t.id}">${t.label}</button>`,
          ).join('')}
        </div>
        <button type="button" id="bag-organize" class="bag-deck-btn">整理背包</button>
        <button type="button" id="bag-expand" class="bag-expand-btn">扩容背包</button>
        <button type="button" id="bag-test-gem" class="bag-deck-btn" title="测试用">测试+红钻</button>
        <button type="button" id="bag-grant-mat" class="bag-deck-btn" title="补发羊皮纸/宝石/保护符等">补发材料</button>
        <button type="button" id="bag-grant-powder" class="bag-deck-btn" title="补发一级~五级强化粉">补发强化粉</button>
        <button type="button" id="bag-reset" class="bag-reset-btn" title="重置试玩数据">重置</button>
      `;
      toolbar.querySelector('#bag-grant-mat')?.addEventListener('click', () => {
        const res = this.inventory.grantStarterMaterials();
        this.refresh(root);
        if (res.ok) {
          this.toast(root, '已补发制作材料各 1000(羊皮纸/宝石/保护符/DNA)');
        } else {
          const names = res.failed.map((f) => f.name).join('、');
          this.toast(root, `背包仍满，未能放入：${names}。请先整理或扩容`);
        }
      });
      toolbar.querySelector('#bag-grant-powder')?.addEventListener('click', () => {
        const res = this.inventory.grantStrengthenPowders();
        this.refresh(root);
        if (res.ok) {
          this.toast(root, '已补发强化粉(一级~五级)');
        } else {
          this.toast(root, '背包已满，强化粉未能全部放入，请先整理或扩容');
        }
      });
      toolbar.querySelectorAll('.bag-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          audio.playSfx('click');
          this.tab = btn.dataset.tab;
          this.selectedIndex = -1;
          this.refresh(root, { rebuildToolbar: false });
        });
      });
      toolbar.querySelector('#bag-organize')?.addEventListener('click', () => this.handleOrganize(root));
      toolbar.querySelector('#bag-expand').addEventListener('click', () => this.handleExpand(root));
      toolbar.querySelector('#bag-test-gem')?.addEventListener('click', () => this.handleTestGem(root));
      toolbar.querySelector('#bag-reset').addEventListener('click', () => this.handleReset(root));
      return;
    }

    toolbar.innerHTML = `
      <div class="bag-tabs">
        ${CARD_TYPE_TABS.map(
          (t) =>
            `<button type="button" class="bag-tab" data-tab="${t.id}">${t.label}</button>`,
        ).join('')}
      </div>
      <label class="bag-card-search">搜索
        <input id="bag-card-search" type="text" placeholder="输入中文名称或ID" value="${this.cardKeyword}" autocomplete="off" spellcheck="false" />
      </label>
      <label class="bag-card-quality">品质
        <select id="bag-card-quality">
          <option value="">全部</option>
          ${Object.entries(CARD_QUALITY)
            .filter(([k]) => Number(k) <= 6)
            .map(([k, v]) => `<option value="${k}" ${this.cardQuality === k ? 'selected' : ''}>${v.name}</option>`)
            .join('')}
        </select>
      </label>
      <button type="button" id="bag-organize" class="bag-deck-btn">整理背包</button>
      <button type="button" id="bag-expand" class="bag-expand-btn">扩容卡牌背包</button>
      <button type="button" id="bag-test-gem" class="bag-deck-btn" title="测试用">测试+红钻</button>
      <button type="button" id="bag-grant-all" class="bag-deck-btn" title="补齐当前缺少的可战斗卡牌">补全卡</button>
      <button type="button" id="bag-deck" class="bag-deck-btn">编辑卡组</button>
      <button type="button" id="bag-smithy" class="bag-deck-btn">铁匠铺</button>
      <button type="button" id="bag-reset" class="bag-reset-btn" title="重置试玩数据">重置</button>
    `;

    toolbar.querySelectorAll('.bag-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playSfx('click');
        this.tab = btn.dataset.tab;
        this.selectedIndex = -1;
        this.refresh(root, { rebuildToolbar: false });
      });
    });
    const searchInput = toolbar.querySelector('#bag-card-search');
    searchInput.addEventListener('compositionstart', () => {
      this._imeComposing = true;
    });
    searchInput.addEventListener('compositionend', (e) => {
      this._imeComposing = false;
      this.cardKeyword = e.target.value;
      this.selectedIndex = -1;
      this.refresh(root, { rebuildToolbar: false });
    });
    searchInput.addEventListener('input', (e) => {
      this.cardKeyword = e.target.value;
      if (this._imeComposing) return;
      this.selectedIndex = -1;
      this.refresh(root, { rebuildToolbar: false });
    });
    toolbar.querySelector('#bag-card-quality').addEventListener('change', (e) => {
      this.cardQuality = e.target.value;
      this.selectedIndex = -1;
      this.refresh(root, { rebuildToolbar: false });
    });
    toolbar.querySelector('#bag-organize')?.addEventListener('click', () => this.handleOrganize(root));
    toolbar.querySelector('#bag-expand').addEventListener('click', () => this.handleExpand(root));
    toolbar.querySelector('#bag-test-gem')?.addEventListener('click', () => this.handleTestGem(root));
    toolbar.querySelector('#bag-grant-all')?.addEventListener('click', () => {
      const res = this.cardInventory.grantAllCollectibleCards();
      this.refresh(root);
      const skipNote = res.skipped ? '，背包已满部分未领取' : '';
      this.toast(root, `已补全 ${res.added} 张卡，共 ${res.total} 张${skipNote}`);
    });
    toolbar.querySelector('#bag-deck').addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('battle');
    });
    toolbar.querySelector('#bag-smithy')?.addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('smithy');
    });
    toolbar.querySelector('#bag-reset').addEventListener('click', () => this.handleReset(root));
  }

  handleOrganize(root) {
    audio.playSfx('click');
    const store = this.getActiveStore();
    const res = store.organize();
    this.selectedIndex = -1;
    this.refresh(root);
    const unit = this.mode === 'card' ? '张卡牌' : '格物品';
    this.toast(root, `已整理 ${res.count} ${unit}`);
  }

  handleTestGem(root) {
    audio.playSfx('click');
    this.player.gem = (this.player.gem ?? 0) + 1000;
    this.onPlayerUpdate?.();
    this.toast(root, '已增加 1000 红钻(测试)');
  }

  handleExpand(root) {
    audio.playSfx('click');
    const store = this.getActiveStore();
    const info = store.getExpandInfo();
    if (!info) {
      this.toast(root, '背包已达最大容量');
      return;
    }
    if (this.player.gem < info.gemCost) {
      this.toast(root, `红钻不足，扩容需要 ${info.gemCost} 红钻`);
      return;
    }
    const res = store.expand();
    if (res.ok) {
      this.player.gem -= res.gemCost;
      this.onPlayerUpdate?.();
      this.toast(root, `扩容成功！当前 ${res.slotCount} 格`);
      this.refresh(root);
    }
  }

  handleReset(root) {
    const label = this.mode === 'card' ? '卡牌背包' : '道具背包';
    if (!confirm(`重置${label}试玩数据？`)) return;
    this.getActiveStore().reset();
    this.selectedIndex = -1;
    this.refresh(root);
    this.toast(root, '已恢复默认数据');
  }

  getVisibleItemSlots() {
    const slots = this.inventory.getSlots();
    if (this.tab === 'all') {
      return slots.map((slot, index) => ({ slot, index }));
    }
    const type = Number(this.tab);
    return slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => {
        if (!slot) return true;
        const item = this.itemDb.getById(slot.itemId);
        return item?.type === type;
      });
  }

  getVisibleCardSlots() {
    const kwRaw = this.cardKeyword.trim();
    const quality = this.cardQuality ? Number(this.cardQuality) : null;
    const type = this.tab === 'all' ? null : Number(this.tab);

    return this.cardInventory
      .getSlots()
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => {
        if (!slot) return true;
        const card = this.cardDb.getById(slot.cardId);
        if (!card) return false;
        if (type != null && card.type !== type) return false;
        if (quality != null && card.quality !== quality) return false;
        if (kwRaw) {
          const label = formatCraftCardName(slot.craftQuality, card.name, slot.customName);
          return (
            card.name.includes(kwRaw) ||
            label.includes(kwRaw) ||
            String(card.id).includes(kwRaw)
          );
        }
        return true;
      });
  }

  refresh(root, { rebuildToolbar = true } = {}) {
    root.querySelectorAll('.bag-mode-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
    });

    if (rebuildToolbar) {
      this.renderToolbar(root);
    }

    const store = this.getActiveStore();
    const used = store.getUsedCount();
    const max = store.getSlotCount();
    root.querySelector('#bag-used').textContent = used;
    root.querySelector('#bag-max').textContent = max;
    root.querySelector('#bag-capacity-text').childNodes[0].textContent =
      this.mode === 'card' ? '卡牌 ' : '已用 ';

    const expandBtn = root.querySelector('#bag-expand');
    if (expandBtn) {
      const expandInfo = store.getExpandInfo();
      if (expandInfo) {
        expandBtn.textContent = `扩容至 ${expandInfo.nextSlots} 格(💎${expandInfo.gemCost})`;
        expandBtn.disabled = false;
      } else {
        expandBtn.textContent = '已达容量上限';
        expandBtn.disabled = true;
      }
    }

    root.querySelectorAll('.bag-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.tab);
    });

    const grid = root.querySelector('#bag-grid');
    grid.className = `bag-grid classic-bag-grid${this.mode === 'card' ? ' bag-grid-cards' : ''}`;
    this.bindGridWheel(grid);

    if (this.mode === 'item') {
      this.renderItemGrid(root, grid);
    } else {
      this.renderCardGrid(root, grid);
    }

    const hint = root.querySelector('#bag-detail-hint');
    if (hint) {
      hint.textContent = this.mode === 'card' ? '点击卡牌查看详情' : '点击物品查看详情';
    }

    if (this.selectedIndex >= 0) {
      if (this.mode === 'item') this.renderItemDetail(root);
      else this.renderCardDetail(root);
    } else {
      const detail = root.querySelector('#bag-detail');
      detail.className = 'bag-detail empty';
      detail.innerHTML = `<p>${hint?.textContent ?? '点击查看详情'}</p>`;
    }
  }

  renderItemGrid(root, grid) {
    const entries = this.getVisibleItemSlots();
    grid.innerHTML = entries
      .map(({ slot, index }) => {
        if (!slot) {
          return `<button type="button" class="bag-slot empty" data-index="${index}" aria-label="空格子"></button>`;
        }
        const item = this.itemDb.getById(slot.itemId);
        const q = item?.qualityInfo ?? CARD_QUALITY[1];
        const icon = this.itemIcon(item);
        return `
          <button type="button" class="bag-slot${this.selectedIndex === index ? ' selected' : ''}"
            data-index="${index}" style="--quality:${q.color}" title="${item?.name ?? ''}">
            <span class="bag-slot-icon">${icon}</span>
            <span class="bag-slot-count">${slot.count > 1 ? slot.count : ''}</span>
          </button>`;
      })
      .join('');

    grid.querySelectorAll('.bag-slot:not(.empty)').forEach((btn) => {
      const itemSlot = this.inventory.getSlots()[Number(btn.dataset.index)];
      btn.dataset.itemId = String(itemSlot?.itemId ?? '');
      btn.addEventListener('click', () => {
        audio.playButton('click');
        this.selectedIndex = Number(btn.dataset.index);
        this.refresh(root, { rebuildToolbar: false });
      });
    });
  }

  renderCardGrid(root, grid) {
    const entries = this.getVisibleCardSlots();
    grid.innerHTML = entries
      .map(({ slot, index }) => {
        if (!slot) {
          return `<button type="button" class="bag-slot empty" data-index="${index}" aria-label="空格子"></button>`;
        }
        const card = this.cardDb.getById(slot.cardId);
        const cq = resolveCraftQuality(slot.craftQuality);
        const label = formatCraftCardName(slot.craftQuality, card.name, slot.customName);
        return `
          <button type="button" class="bag-slot card-bag-slot${this.selectedIndex === index ? ' selected' : ''}"
            data-index="${index}" style="--quality:${cq.color}" title="${label}">
            <img src="/sprites/cards/${card.spriteRes}.png" alt="" loading="lazy" />
            <span class="bag-slot-card-name" style="color:${cq.color}">${label}</span>
            ${(slot.strengthLv ?? 0) > 0 ? `<span class="bag-slot-star">+${slot.strengthLv}</span>` : ''}
            ${slot.star > 0 ? `<span class="bag-slot-count">${slot.star}★</span>` : ''}
          </button>`;
      })
      .join('');

    grid.querySelectorAll('.bag-slot:not(.empty)').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playClickCard();
        this.selectedIndex = Number(btn.dataset.index);
        this.refresh(root, { rebuildToolbar: false });
      });
    });
  }

  itemIcon(item) {
    const materialImage = getCraftMaterialImage(item?.id);
    if (materialImage) {
      return '<span class=bag-item-material data-material-item-id=' + item.id
        + '><img src=' + materialImage + ' alt></span>';
    }
    const materialSprite = getCraftMaterialSprite(item?.id);
    if (materialSprite) {
      const rect = [materialSprite.x, materialSprite.y, materialSprite.width, materialSprite.height].join(',');
      return `<span class='bag-item-material' data-bag-gem-tier='${materialSprite.level}'
        data-sprite-rect='${rect}' style='${getCraftMaterialSpriteStyle(materialSprite)}'></span>`;
    }
    const extension = getItemExtensionSprite(item?.id);
    if (extension) {
      const scale = Math.min(0.5, 62 / Math.max(extension.width, extension.height));
      const rect = [extension.x, extension.y, extension.width, extension.height].join(',');
      return `<span class='bag-item-atlas bag-item-extension' data-sprite-rect='${rect}' aria-hidden='true'><i style='width:${extension.width}px;height:${extension.height}px;background-image:url(${ITEM_EXTENSION_URL});background-position:-${extension.x}px -${extension.y}px;transform:translate(-50%,-50%) scale(${scale.toFixed(4)})'></i></span>`;
    }
    const sprite = ITEM_ATLAS.get(String(item?.img ?? item?.id))
      ?? ITEM_ATLAS.get(String(item?.id))
      ?? ITEM_ATLAS.get('-1');
    if (!sprite) return '<span class="bag-item-fallback">物</span>';
    const width = Math.max(1, Number(sprite.width) || 45);
    const height = Math.max(1, Number(sprite.height) || 45);
    const scale = Math.min(1, 62 / Math.max(width, height));
    return `<span class="bag-item-atlas" aria-hidden="true"><i style="width:${width}px;height:${height}px;background-position:-${sprite.x}px -${sprite.y}px;transform:translate(-50%,-50%) scale(${scale.toFixed(4)})"></i></span>`;
  }

  bindGridWheel(grid) {
    if (!grid || grid.dataset.wheelScrollBound === 'true') return;
    grid.dataset.wheelScrollBound = 'true';
    grid.addEventListener('wheel', (event) => {
      if (grid.scrollHeight <= grid.clientHeight || !Number.isFinite(event.deltaY)) return;
      const before = grid.scrollTop;
      grid.scrollTop = Math.max(0, Math.min(
        grid.scrollHeight - grid.clientHeight,
        before + event.deltaY,
      ));
      if (grid.scrollTop !== before) event.preventDefault();
    }, { passive: false });
  }

  renderItemDetail(root) {
    const detail = root.querySelector('#bag-detail');
    const slot = this.inventory.getSlots()[this.selectedIndex];
    if (!slot) return;

    const item = this.itemDb.getById(slot.itemId);
    if (!item) return;

    const q = item.qualityInfo;
    const canUse = this.itemUse.isUsable(item);
    detail.className = 'bag-detail';
    detail.innerHTML = `
      <div class="bag-detail-icon" style="--quality:${q.color}">${this.itemIcon(item)}</div>
      <h2 style="color:${q.color}">${item.name}</h2>
      <p class="bag-detail-meta">${item.showType || '物品'} · ${q.name}</p>
      <p class="bag-detail-desc">${item.desc || '暂无描述'}</p>
      <p class="bag-detail-count">数量：<b>${slot.count}</b> / 堆叠上限 ${item.maxStack}</p>
      <p class="bag-detail-sell">出售价格：${item.sellPrice} 金币</p>
      <div class="bag-detail-actions">
        <button type="button" id="bag-use" class="bag-action primary" ${canUse ? '' : 'disabled'}>${canUse ? '打开/使用' : '不可使用'}</button>
        <button type="button" id="bag-sell" class="bag-action">出售</button>
        <button type="button" id="bag-drop" class="bag-action danger">丢弃 1 个</button>
      </div>
    `;

    detail.querySelector('#bag-use').addEventListener('click', () => {
      if (!canUse) return;
      const res = this.itemUse.use(item, this.selectedIndex, this.inventory, this.cardInventory, this.player);
      if (res.picker) {
        this._showCardPicker(item.id, this.selectedIndex, item, root);
        return;
      }
      if (res.ok) {
        this.onPlayerUpdate?.();
        if (!this.inventory.getSlots()[this.selectedIndex]) this.selectedIndex = -1;
        this.refresh(root);
      }
      this.toast(root, res.message ?? res.error ?? '完成');
    });

    detail.querySelector('#bag-sell').addEventListener('click', () => {
      const gain = item.sellPrice;
      this.inventory.removeAt(this.selectedIndex, 1);
      this.player.gold += gain;
      this.onPlayerUpdate?.();
      if (!this.inventory.getSlots()[this.selectedIndex]) this.selectedIndex = -1;
      this.refresh(root);
      this.toast(root, `出售获得 ${gain} 金币`);
    });

    detail.querySelector('#bag-drop').addEventListener('click', () => {
      this.inventory.removeAt(this.selectedIndex, 1);
      if (!this.inventory.getSlots()[this.selectedIndex]) this.selectedIndex = -1;
      this.refresh(root);
      this.toast(root, '已丢弃 1 个');
    });
  }

  renderCardDetail(root) {
    const detail = root.querySelector('#bag-detail');
    const slot = this.cardInventory.getSlots()[this.selectedIndex];
    if (!slot) return;

    const card = this.cardDb.getById(slot.cardId);
    if (!card) return;

    const q = card.qualityInfo;
    const cq = resolveCraftQuality(slot.craftQuality);
    const displayName = card.isExperienceCard
      ? card.name
      : formatCraftCardName(slot.craftQuality, card.name, slot.customName);
    const statMult = getInstanceStatMultiplier(slot.craftQuality, slot.strengthLv);
    const atk = roundBattleAmount(card.atk * statMult);
    const hp = Math.round(card.hp * statMult);
    const owned = this.cardInventory.getOwnershipMap().get(card.id) ?? 1;
    const noCraft = card.isExperienceCard
      ? ' · 经验材料 · 不可出战'
      : card.quality >= 5 ? ' · 不可制作' : '';

    detail.className = 'bag-detail';
    detail.innerHTML = `
      <div class="bag-detail-card-thumb" style="--quality:${cq.color}">
        <img src="/sprites/cards/${card.spriteRes}.png" alt="" />
      </div>
      <h2 style="color:${cq.color}">${displayName}</h2>
      <p class="bag-detail-meta">#${card.id} · ${card.typeLabel} · 卡牌品质 ${q.name} · ${cq.baseLabel}底座(${cq.name}) · 属性 x${statMult.toFixed(2)}${noCraft}${slot.star > 0 ? ` · ${slot.star}星` : ''}${(slot.strengthLv ?? 0) > 0 ? ` · 强化+${slot.strengthLv}` : ''}</p>
      <dl class="bag-card-stats">
        <div><dt>攻击</dt><dd>${atk}</dd></div>
        <div><dt>生命</dt><dd>${hp}</dd></div>
        <div><dt>费用</dt><dd>${card.cost}</dd></div>
        <div><dt>冷却</dt><dd>${card.cooldown}s</dd></div>
      </dl>
      <p class="bag-detail-desc">${card.desc || '暂无描述'}</p>
      <p class="bag-detail-count">背包内拥有 <b>${owned}</b> 张</p>
      <div class="bag-detail-actions">
        ${card.isExperienceCard ? '' : '<button type="button" id="bag-deck-go" class="bag-action primary">编辑卡组</button><button type="button" id="bag-strengthen" class="bag-action">去强化</button><button type="button" id="bag-decompose" class="bag-action">去分解</button>'}
        <button type="button" id="bag-card-drop" class="bag-action danger">移除 1 张</button>
      </div>
    `;

    detail.querySelector('#bag-deck-go').addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('battle');
    });

    detail.querySelector('#bag-strengthen').addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('smithy', { tab: 'strengthen', cardIndex: this.selectedIndex });
    });

    detail.querySelector('#bag-decompose').addEventListener('click', () => {
      audio.playSfx('click');
      this.onNavigate?.('smithy', { tab: 'decompose', cardIndex: this.selectedIndex });
    });

    detail.querySelector('#bag-card-drop').addEventListener('click', () => {
      this.cardInventory.removeAt(this.selectedIndex);
      this.selectedIndex = -1;
      this.refresh(root);
      this.toast(root, `已移除 1 张「${displayName}」`);
    });
  }

  _showCardPicker(itemId, slotIndex, item, root) {
    const slots = this.cardInventory.getSlots().filter(s => s && s.cardId);
    const cardQualityNames = {1:'劣质',2:'普通',3:'优秀',4:'精良',5:'完美',6:'逆天'};
    const craftQualityNames = {1:'劣质',2:'普通',3:'优秀',4:'精良',5:'完美'};
    const cardQColors = {1:'#aaa',2:'#6BFF00',3:'#00BFFF',4:'#C040FF',5:'#FF8C00',6:'#FF0040'};
    const craftQColors = {1:'#888',2:'#aaa',3:'#6BFF00',4:'#00BFFF',5:'#C040FF'};
    const tierColor = {1:'#959565',2:'#238A1A',3:'#106198',4:'#7B368E',5:'#BE6C3C',6:'#CC0033'};
    const maxStars = {1:5,2:7,3:9,4:11,5:13,6:15};
    const isStarItem = itemId === 81;
    const descMap = {80:'随机改变品质(劣质/普通/优秀/精良/完美各有概率)',81:'随机升1-2星或降1星(满星不可选)',88:'重置为0星并返还强化粉',90:'为卡牌重新命名'};

    const cardGrid = slots.map((s,i)=>{
      const card = this.cardDb.getById(s.cardId);
      if(!card)return'';
      const q=s.craftQuality||1, tq=card.quality||1, star=s.strengthLv||0, ms=maxStars[tq]||5;
      const ss='★'.repeat(Math.min(5,star))+(star>5?'+'+ (star-5):'');
      const maxed=isStarItem&&star>=ms;
      const color=tierColor[card.quality||1]||'#aaa';
      // hover tooltip
      const tip=`品质:${craftQualityNames[q]||q} | ${star}/${ms}星`;
      return`<button type="button" class="picker-card-slot${maxed?' locked':''}" data-idx="${i}" title="${tip}"
        style="position:relative;width:72px;height:78px;background:${color}33;border:2px solid ${color};border-radius:6px;cursor:${maxed?'not-allowed':'pointer'};opacity:${maxed?'0.4':'1'};overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px;transition:transform 0.15s,box-shadow 0.15s;">
        ${card.spriteRes?`<img src="/sprites/cards/${card.spriteRes}.png" style="width:44px;height:44px;object-fit:contain;">`:''}
        <span style="color:${color};font-size:9px;font-weight:700;line-height:1.1;text-align:center;max-width:100%;">${craftQualityNames[q]||q}的${(s.customName||card.name||'卡')}</span>
        <span style="color:#ffd700;font-size:8px;">${ss||'0★'}</span>
        ${maxed?'<span style="position:absolute;top:2px;right:2px;color:#f44;font-size:9px;">满</span>':''}
      </button>`;
    }).join('');

    document.getElementById('card-picker-overlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='card-picker-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML=`<div class="picker-panel" style="position:absolute;top:10%;left:20%;width:700px;background:#1a1a2e;border:2px solid #8b6914;border-radius:8px;color:#fff;font-size:13px;box-shadow:0 0 30px rgba(0,0,0,0.8);display:flex;flex-direction:column;">
      <div class="picker-header" style="padding:10px 16px;background:#2a2a3e;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;cursor:move;"><span style="font-weight:700;">使用「${item.name}」</span><button id="picker-close" style="background:none;border:none;color:#ff6b6b;font-size:18px;cursor:pointer;">✕</button></div>
      <div style="display:flex;flex:1;min-height:0;">
        <div style="flex:1;padding:10px;overflow-y:auto;max-height:420px;"><p style="color:#aaa;margin:0 0 8px 0;">${descMap[itemId]||'选择一张卡牌'}</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-start;">${cardGrid}</div></div>
        <div id="picker-card-info" style="width:240px;border-left:1px solid #333;padding:10px;overflow-y:auto;max-height:420px;color:#ccc;font-size:12px;">
          <p style="color:#666;text-align:center;">点击左侧卡牌查看详情</p></div>
      </div>
      <div id="picker-msg" style="color:#ff6b6b;font-size:12px;min-height:18px;padding:0 10px;text-align:center;"></div>
      <div style="padding:8px 16px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #333;">
        <button id="picker-cancel" style="padding:6px 18px;background:#555;border:none;color:#fff;border-radius:4px;cursor:pointer;">取消</button>
        <button id="picker-confirm" style="padding:6px 18px;background:#c8960c;border:none;color:#000;font-weight:700;border-radius:4px;cursor:pointer;">确认使用</button></div></div>`;
    document.body.appendChild(overlay);
    if(itemId===90){
      // 命名框放在独立区域（picker-msg 上方），点击卡牌刷新详情时不会被 innerHTML 覆盖
      const nameBox=document.createElement('div');
      nameBox.id='picker-name-box';
      nameBox.style.cssText='padding:8px 16px;border-top:1px solid #333;';
      nameBox.innerHTML=`<label style='display:block'>新名称<input id='picker-name-input' maxlength='18' style='display:block;width:100%;margin-top:6px;padding:4px 8px;box-sizing:border-box;'></label>`;
      overlay.querySelector('#picker-msg').insertAdjacentElement('beforebegin',nameBox);
    }

    const panel=overlay.querySelector('.picker-panel');let d=!1,ox=0,oy=0;
    panel.addEventListener('mousedown',e=>{if(!['BUTTON','INPUT','LABEL'].includes(e.target.tagName)){d=!0;ox=e.clientX-panel.offsetLeft;oy=e.clientY-panel.offsetTop;}});
    document.addEventListener('mousemove',e=>{if(d){panel.style.left=(e.clientX-ox)+'px';panel.style.top=(e.clientY-oy)+'px';}});
    document.addEventListener('mouseup',()=>{d=!1;});
    let selectedIdx = -1;
    let transferSourceIdx = -1;
    overlay.querySelectorAll('.picker-card-slot:not(.locked)').forEach((btn,i) => {
      btn.addEventListener('click', () => {
        const clickedIdx = Number(btn.dataset.idx);
        if(itemId===89&&transferSourceIdx<0){
          transferSourceIdx=clickedIdx;
          selectedIdx=-1;
          overlay.querySelector('#picker-msg').textContent='已选择经验来源，请再选择接收经验的卡牌';
        }else{
          selectedIdx=clickedIdx;
        }
        overlay.querySelectorAll('.picker-card-slot').forEach(b => b.style.boxShadow = '');
        btn.style.boxShadow = '0 0 12px ' + (cardQColors[slots[Number(btn.dataset.idx)].craftQuality||1] || '#ffd700');
        // 更新右侧卡牌详情
        const info=overlay.querySelector('#picker-card-info'),s2=slots[Number(btn.dataset.idx)],c2=this.cardDb.getById(s2.cardId);
        if(info&&c2){const cq2=s2.craftQuality||1,ss2=s2.strengthLv||0,cc=craftQColors[cq2]||'#aaa';
          const m = getInstanceStatMultiplier(cq2, ss2);
          const a = roundBattleAmount(c2.atk * m);
          const h = Math.round(c2.hp * m);
          info.innerHTML='<div style="text-align:center;"><img src="/sprites/cards/'+c2.spriteRes+'.png" style="width:80px;height:80px;object-fit:contain;border:2px solid '+cc+';border-radius:6px;"></div>'
            +'<p style="color:'+cc+';font-weight:700;font-size:14px;text-align:center;margin:6px 0 2px;">'+(craftQualityNames[cq2]||cq2)+'的'+ (c2.name||'卡牌') +'</p>'
            +'<p style="color:#ffd700;text-align:center;font-size:12px;margin:2px 0;">'+ ('★'.repeat(Math.min(5,ss2))+(ss2>5?'+'+ (ss2-5):'0★'))+' / '+(maxStars[c2.quality||1]||5)+'★</p>'
            +'<div style="margin-top:8px;border-top:1px solid #333;padding-top:6px;">'
            +'<div style="display:flex;justify-content:space-between;"><span>攻击</span><span style="color:#f66;">'+ a +'</span></div>'
            +'<div style="display:flex;justify-content:space-between;"><span>生命</span><span style="color:#6f6;">'+ h +'</span></div>'
            +'<div style="display:flex;justify-content:space-between;"><span>冷却</span><span style="color:#6bf;">'+ (c2.cooldown||0) +'s</span></div>'
            +'<div style="display:flex;justify-content:space-between;"><span>费用</span><span>'+ (c2.cost||0) +'</span></div></div>'
            +'<p style="margin-top:8px;color:#aaa;font-size:11px;">'+ (c2.desc||'暂无简介') +'</p>'
            +(c2.flavor?'<p style="color:#777;font-size:11px;font-style:italic;">「'+c2.flavor+'」</p>':'');
        }
      });
    });
    const close=()=>overlay.remove();
    overlay.querySelector('#picker-close').onclick=close;
    overlay.querySelector('#picker-cancel').onclick=close;
    overlay.querySelector('#picker-confirm').onclick=()=>{
      if(selectedIdx<0){overlay.querySelector('#picker-msg').textContent='请选择一张卡牌';return;}
      const slot=slots[selectedIdx];if(!slot)return;
      const card=this.cardDb.getById(slot.cardId);
      const extra = itemId === 90 ? { name: (overlay.querySelector('#picker-name-input') || {}).value || card.name } : null;
      const functionalExtra=itemId===89?{sourceSlot:slots[transferSourceIdx]}:extra;
      const msg=this._applyCardEffect(itemId,slotIndex,slot,card,functionalExtra);
      close();this.onPlayerUpdate?.();
      if(!this.inventory.getSlots()[this.selectedIndex])this.selectedIndex=-1;
      this.refresh(root);this.toast(root,msg);
    };
  }
  _applyCardEffect(itemId,slotIndex,slot,card,extra){
    const maxStars={1:5,2:7,3:9,4:11,5:13,6:15},cqN={1:'劣质',2:'普通',3:'优秀',4:'精良',5:'完美'};let m='';
    const tq=card.quality||1;
    switch(itemId){
      case 82:{slot.craftQuality=Math.min(5,(slot.craftQuality||1)+1);m='品质已提升一阶';break;}
      case 83:{slot.craftQuality=5;slot.awakened=true;m='卡牌已觉醒为逆天品质';break;}
      case 84:{slot.learnedSkill='attack';m='已学习攻击技能';break;}
      case 85:{slot.learnedSkill='defense';m='已学习防御技能';break;}
      case 86:{slot.learnedSkill='support';m='已学习辅助技能';break;}
      case 87:{delete slot.learnedSkill;m='已遗忘卡牌技能';break;}
      case 89:{const source=extra?.sourceSlot;if(!source||source===slot)return '请选择两张不同的卡牌';const moved=source.strengthLv||0;slot.strengthLv=Math.min(maxStars[tq]||5,(slot.strengthLv||0)+moved);slot.star=slot.strengthLv;source.strengthLv=0;source.star=0;m='已转移 '+moved+' 点强化经验';break;}
      case 90:{
        // 命名笔：空名/纯空格不消耗物品
        const rawName=sanitizeCustomCardName(extra?.name);
        if(!rawName) return '请输入新名称';
        slot.customName=rawName;
        m='卡牌已更名为「'+slot.customName+'」';break;
      }
      case 91:{slot.awakened=true;m='卡牌羁绊已觉醒';break;}
      case 80:{const r=Math.random();slot.craftQuality=r<0.08?5:r<0.23?4:r<0.43?3:r<0.68?2:1;m='「'+card.name+'」词条洗练为'+(cqN[slot.craftQuality]||slot.craftQuality);break;}
      case 81:{const d=Math.random()<0.35?2:Math.random()<0.70?1:-1,cur=slot.strengthLv||0,ms=maxStars[tq]||5,ns=Math.max(0,Math.min(ms,cur+d));slot.strengthLv=ns;m='「'+card.name+'」'+(d>0?'升'+d+'星':'降1星')+'，当前'+ns+'星';break;}
      case 88:{const ref=Math.floor((slot.strengthLv||0)*0.6);slot.strengthLv=0;if(ref>0)this.inventory.addItem(10001+Math.min(4,Math.floor(tq/2)),ref);m='「'+card.name+'」重置为0星，返还'+ref+'强化粉';break;}
    }
    // 消耗物品；失败则回滚本次效果（物品未扣、效果不生效）
    if(!this.inventory.consumeAt(slotIndex,1)){
      if(itemId===90){delete slot.customName;}
      return '使用失败：物品不可用';
    }
    this.cardInventory.save();
    return m||'已使用';
  }

  toast(root, msg) {
    const el = root.querySelector('#bag-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }
}
