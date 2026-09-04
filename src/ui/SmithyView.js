import {
  formatCraftCardName,
  getInstanceStatMultiplier,
  resolveCraftQuality,
} from '../core/constants.js';
import { CraftStateStore } from '../core/CraftStateStore.js';
import { CardCraftSystem } from '../systems/CardCraftSystem.js';
import { CardStrengthenSystem } from '../systems/CardStrengthenSystem.js';
import { REVERSE_CARD_ID, StarUpgradeSystem } from '../systems/StarUpgradeSystem.js';
import { CardDecomposeSystem } from '../systems/CardDecomposeSystem.js';
import { MaterialCombineSystem } from '../systems/MaterialCombineSystem.js';
import { audio } from '../core/AudioManager.js';
import { bindClassicChat, classicBroadcastMarkup, classicChatMarkup } from './ClassicCityChrome.js';
import {
  getCraftMaterialSprite,
  getCraftMaterialSpriteStyle,
  SMITHY_MATERIAL_ART,
} from './SmithyMaterialArtwork.js';

function renderSmithyMaterialArt(type, level = 1, className = '') {
  const tier = Math.max(1, Math.min(4, Number(level) || 1));
  if (type === 'gem') {
    const sprite = getCraftMaterialSprite(50010 + tier);
    const rect = [sprite.x, sprite.y, sprite.width, sprite.height].join(',');
    return '<span class="smithy-material-art ' + className + '" data-smithy-art="gem" data-tier="'
      + tier + '" data-sprite-rect="' + rect + '" style="'
      + getCraftMaterialSpriteStyle(sprite) + '"></span>';
  }
  const individual = SMITHY_MATERIAL_ART[type];
  if (Array.isArray(individual)) {
    const src = individual[tier - 1];
    if (!src) return '';
    return '<span class="smithy-material-art ' + className + '" data-smithy-art="' + type
      + '" data-tier="' + tier + '"><img src="' + src + '" alt="" /></span>';
  }
  if (!individual) return '';
  const vertical = type === 'powder';
  const offset = ((tier - 1) / 3) * 100;
  const style = vertical
    ? 'background-image:url(' + individual + ');background-size:100% 400%;background-position:50% ' + offset + '%'
    : 'background-image:url(' + individual + ');background-size:400% 100%;background-position:' + offset + '% 50%';
  return '<span class="smithy-material-art ' + className + '" data-smithy-art="' + type
    + '" data-tier="' + tier + '" style="' + style + '"></span>';
}

const TABS = [
  { id: 'craft', label: '造卡' },
  { id: 'strengthen', label: '强化' },
  { id: 'material', label: '加工' },
  { id: 'decompose', label: '拆解' },
];

const MAT_TYPES = [
  { id: 'parchment', label: '羊皮纸' },
  { id: 'gem', label: '宝石' },
  { id: 'charm', label: '保护符' },
];

const SMITHY_RULES = Object.freeze({
  craft: [
    '\u5728\u53f3\u4fa7\u9009\u62e9\u8981\u5236\u9020\u7684\u5361\u724c\uff0c\u5361\u724c\u80cc\u5305\u5fc5\u987b\u6709\u7a7a\u4f4d\u3002',
    '\u4e2d\u592e\u53ef\u653e\u5165\u7f8a\u76ae\u7eb8\u3001\u5b9d\u77f3\u3001\u4fdd\u62a4\u7b26\u3001\u5e78\u8fd0\u8349\u548c DNA\u3002',
    '\u4fdd\u62a4\u7b26\u5728\u5931\u8d25\u65f6\u4fdd\u7559\u5df2\u653e\u5165\u7684\u5236\u9020\u6750\u6599\u3002',
    'DNA \u4f1a\u4fdd\u8bc1\u5236\u9020\u51fa\u76ee\u6807\u5361\uff0c\u82e5\u53d1\u751f\u5347\u53d8\u5219\u8fd4\u8fd8\u3002',
    '\u5e78\u8fd0\u8349\u53c2\u4e0e\u9ad8\u9636\u5408\u6210\uff0c\u4f1a\u63d0\u9ad8\u5347\u53d8\u6982\u7387\u5e76\u964d\u4f4e\u7578\u53d8\u6982\u7387\u3002',
    '\u5236\u4f5c\u6210\u529f\u540e\u6309\u5f53\u524d\u663e\u793a\u7684\u54c1\u8d28\u6982\u7387\u62bd\u53d6\u5361\u724c\u5e95\u5ea7\u54c1\u8d28\u3002',
    '\u786e\u8ba4\u6210\u529f\u7387\u548c\u6750\u6599\u6d88\u8017\u540e\uff0c\u70b9\u51fb\u201c\u5236\u9020\u5361\u724c\u201d\u3002',
  ],
  strengthen: [
    '\u4ece\u53f3\u4fa7\u9009\u62e9\u4e3b\u5361\uff0c\u4e3b\u5361\u4e0e\u526f\u5361\u5fc5\u987b\u662f\u540c\u4e00\u5f20\u5361\u4e14\u661f\u7ea7\u76f8\u540c\u3002',
    '\u53ef\u9009\u62e9\u5f3a\u5316\u7c89\u6216\u526f\u5361\u8def\u7ebf\uff0c\u4e24\u6761\u8def\u7ebf\u5747\u63d0\u5347\u4e3b\u5361\u661f\u7ea7\u3002',
    '\u5f3a\u5316\u7c89\u7684\u7b49\u7ea7\u548c\u6570\u91cf\u5fc5\u987b\u6ee1\u8db3\u5f53\u524d\u661f\u7ea7\u9700\u6c42\u3002',
    '\u56db\u661f\u540e\u5f3a\u5316\u5931\u8d25\u53ef\u80fd\u964d\u661f\uff0c\u5bf9\u5e94\u7b49\u7ea7\u7684\u5b88\u62a4\u7b26\u53ef\u9632\u6b62\u964d\u661f\u3002',
    '\u526f\u5361\u4f1a\u5728\u5931\u8d25\u540e\u8fdb\u5165\u9500\u6bc1\u5c42\uff0c\u53ef\u5728\u6709\u6548\u671f\u5185\u4f7f\u7528\u9006\u8f6c\u5361\u8fd8\u539f\u3002',
    '\u754c\u9762\u663e\u793a\u7684\u6210\u529f\u3001\u53cc\u661f\u548c\u5931\u8d25\u6982\u7387\u4e4b\u548c\u59cb\u7ec8\u4e3a 100%\u3002',
  ],
  material: [
    '\u4ece\u53f3\u4fa7\u9009\u62e9\u5f3a\u5316\u7c89\u3001\u7f8a\u76ae\u7eb8\u6216\u5b9d\u77f3\u7684\u76ee\u6807\u7b49\u7ea7\u3002',
    '\u4e2d\u592e\u6750\u6599\u69fd\u5fc5\u987b\u6ee1\u8db3\u914d\u65b9\u6570\u91cf\u624d\u80fd\u52a0\u5de5\u3002',
    '\u7cbe\u70bc\u77f3\u53ef\u4ee5\u63d0\u9ad8\u52a0\u5de5\u6210\u529f\u7387\uff0c\u4e0a\u9650\u4e3a 100%\u3002',
    '\u52a0\u5de5\u7ed1\u5b9a\u6750\u6599\u65f6\uff0c\u7ed3\u679c\u4f1a\u4fdd\u7559\u5bf9\u5e94\u7ed1\u5b9a\u72b6\u6001\u3002',
    '\u786e\u8ba4\u76ee\u6807\u3001\u6570\u91cf\u548c\u6210\u529f\u7387\u540e\u518d\u6267\u884c\u52a0\u5de5\u3002',
  ],
  decompose: [
    '\u4ece\u53f3\u4fa7\u5361\u724c\u80cc\u5305\u4e2d\u9009\u62e9\u8981\u62c6\u89e3\u7684\u5361\u724c\u3002',
    '\u4e2d\u592e\u4f1a\u5728\u786e\u8ba4\u524d\u5c55\u793a\u53ef\u8fd4\u8fd8\u7684\u6750\u6599\u4e0e\u6570\u91cf\u3002',
    '\u5361\u724c\u54c1\u8d28\u3001\u661f\u7ea7\u548c\u5f3a\u5316\u72b6\u6001\u4f1a\u5f71\u54cd\u62c6\u89e3\u8fd4\u8fd8\u3002',
    '\u7ed1\u5b9a\u5361\u62c6\u89e3\u540e\u8fd4\u8fd8\u7684\u6750\u6599\u4ecd\u6309\u7ed1\u5b9a\u89c4\u5219\u5904\u7406\u3002',
    '\u62c6\u89e3\u540e\u65e0\u6cd5\u64a4\u9500\uff0c\u8bf7\u5728\u786e\u8ba4\u540e\u518d\u6267\u884c\u3002',
  ],
});

export class SmithyView {
  constructor(db, itemDb, inventory, cardInventory, player, { onPlayerUpdate, onQuestEvent, initialTab, initialCardIndex } = {}) {
    this.db = db;
    this.itemDb = itemDb;
    this.inventory = inventory;
    this.cardInventory = cardInventory;
    this.player = player;
    this.onPlayerUpdate = onPlayerUpdate;
    this.onQuestEvent = onQuestEvent;
    this.tab = initialTab === 'starup' ? 'strengthen' : (initialTab ?? 'craft');
    this.craftState = new CraftStateStore();
    this.craftSys = new CardCraftSystem(db, itemDb.craftRegistry);
    this.strengthenSys = new CardStrengthenSystem(db);
    this.starUpgradeSys = new StarUpgradeSystem(db, inventory, cardInventory);
    this.decomposeSys = new CardDecomposeSystem(db, itemDb.craftRegistry);
    this.materialSys = new MaterialCombineSystem(itemDb.craftRegistry);
    this.targetCardId = this.craftSys.getCraftableCards()[0]?.id ?? null;
    this.cardIndex = initialCardIndex ?? -1;
    this._starMainIdx = -1;
    this._starSubIdxs = [];
    this._starConsecFails = 0;
    this._starCharmId = null;
    this.useCharm = false;
    this.useDna = false;
    this.highTier = false;
    this.matType = 'gem';
    this.matFromLevel = 1;
  }

  render(root) {
    root.innerHTML = `
      <div class="page smithy-page jungle-smithy-forge classic-smithy-screen">
        ${classicBroadcastMarkup(['铁匠铺开放中：选择上方木牌进行造卡、强化、加工或拆解。'])}
        <header class="smithy-header">
          <div><h1>铁匠铺</h1><p class="smithy-hint">炼造与强化中心</p></div>
          <button type="button" class="smithy-help" aria-label="帮助">?</button>
          <div class="smithy-wallet" aria-label="炼造资源"><span>金币 <b id="smithy-gold"></b></span><span>红钻 <b id="smithy-gem"></b></span></div>
        </header>
        <div class="smithy-tabs">
          ${TABS.map((t) => `<button type="button" class="smithy-tab" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <aside class="smithy-guide" aria-live="polite"></aside>
        <div id="smithy-body" class="smithy-body"></div>
        ${classicChatMarkup()}
        <button type="button" class="classic-recharge-btn smithy-stone-btn">钻石储值</button>
        <p id="smithy-toast" class="bag-toast hidden"></p>
      </div>
    `;
    root.querySelector('.classic-smithy-screen')?.insertAdjacentHTML('beforeend', `
      <div class='smithy-rules-dialog hidden' role='dialog' aria-modal='true' aria-labelledby='smithy-rules-title'>
        <section class='smithy-rules-card'>
          <button type='button' data-close-smithy-rules aria-label='\u5173\u95ed'>\u00d7</button>
          <h2 id='smithy-rules-title'></h2>
          <ol data-smithy-rule-list></ol>
        </section>
      </div>
    `);
    bindClassicChat(root);
    root.querySelector('.smithy-help')?.addEventListener('click', () => this.openRulesDialog(root));
    root.querySelector('[data-close-smithy-rules]')?.addEventListener('click', () => this.closeRulesDialog(root));
    root.querySelector('.smithy-rules-dialog')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this.closeRulesDialog(root);
    });
    root.querySelectorAll('.smithy-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playSfx('click');
        this.tab = btn.dataset.tab;
        this.renderBody(root);
      });
    });
    this.renderBody(root);
  }

  openRulesDialog(root) {
    const dialog = root.querySelector('.smithy-rules-dialog');
    const rules = SMITHY_RULES[this.tab] ?? SMITHY_RULES.craft;
    const title = TABS.find((tab) => tab.id === this.tab)?.label ?? '';
    if (!dialog) return;
    dialog.dataset.ruleCount = String(rules.length);
    dialog.querySelector('#smithy-rules-title').textContent = title + '\u5b8c\u6574\u89c4\u5219';
    dialog.querySelector('[data-smithy-rule-list]').innerHTML = rules.map((rule) => `<li>${rule}</li>`).join('');
    dialog.classList.remove('hidden');
  }

  closeRulesDialog(root) {
    root.querySelector('.smithy-rules-dialog')?.classList.add('hidden');
  }

  renderBody(root) {
    const gold = root.querySelector('#smithy-gold');
    const gem = root.querySelector('#smithy-gem');
    if (gold) gold.textContent = Math.max(0, Number(this.player?.gold) || 0);
    if (gem) gem.textContent = Math.max(0, Number(this.player?.gem) || 0);
    root.querySelectorAll('.smithy-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.tab);
    });
    const body = root.querySelector('#smithy-body');
    const guide = root.querySelector('.smithy-guide');
    if (guide) {
      const copy = {
        craft: ['造卡说明', '在右侧选择要制造的卡牌。', '在中央补充羊皮纸、宝石、保护符、幸运草或 DNA。', '调整成功率后点击制造卡牌。'],
        strengthen: ['强化说明', '在右侧选择要强化的卡牌。', '中央放入强化粉、副卡和保护符。', '四星后失败可能降星，保护符可避免降星。'],
        material: ['加工说明', '在右侧选择强化粉、羊皮纸或宝石。', '中央放入材料，精炼石可提高加工成功率。'],
        decompose: ['拆解说明', '从右侧背包中选择卡牌。', '中央会显示可返还的材料；分解后无法撤销。'],
      }[this.tab];
      guide.innerHTML = `<h2>${copy[0]}</h2>${copy.slice(1).map((line) => `<p>${line}</p>`).join('')}`;
    }
    root.querySelector('.classic-smithy-screen')?.setAttribute('data-smithy-mode', this.tab);
    if (this.tab === 'craft') this.renderCraft(root, body);
    else if (this.tab === 'strengthen') this.renderStrengthen(root, body);
    else if (this.tab === 'decompose') this.renderDecompose(root, body);
    else this.renderMaterial(root, body);
  }

  /** 升星系统 - 主卡(右) + 副卡(中) + 保护符选择 */
  renderStarUp(root, body) {
    this.renderUpgradeRoute(root, body, 'duplicate');
  }

  renderUpgradeRoute(root, body, route) {
    const slots = this.cardInventory.getSlots();
    const entries = slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot && !this.db.getById(slot.cardId)?.isExperienceCard);
    const main = this._starMainIdx >= 0 ? slots[this._starMainIdx] : null;
    const mainCard = main ? this.db.getById(main.cardId) : null;
    const star = Math.max(0, Number(main?.star ?? main?.strengthLv) || 0);
    this._starSubIdxs = (this._starSubIdxs || []).filter((index) => slots[index]);
    const selectedSubs = this._starSubIdxs;
    const selectedForRoute = route === 'powder' ? [] : selectedSubs;
    const preview = main ? this.starUpgradeSys.preview(this._starMainIdx, selectedForRoute, { charmId: this._starCharmId, route }) : null;
    const powderCheck = main && mainCard ? this.strengthenSys.canStrengthen(main, mainCard) : null;
    const powderNeed = route === 'powder' && powderCheck?.ok ? powderCheck.need : null;
    const routeTitle = route === 'powder' ? '强化粉升星' : '副卡升星';
    const validSub = (slot, index) => main && index !== this._starMainIdx
      && slot.cardId === main.cardId
      && Math.max(0, Number(slot.star ?? slot.strengthLv) || 0) === star;
    const charmIds = [50021, 50022, 50023, 50024];
    const escrow = this.starUpgradeSys.getEscrow();

    const cardButton = ({ slot, index }, mode) => {
      const card = this.db.getById(slot.cardId);
      const quality = resolveCraftQuality(slot.craftQuality);
      const selected = mode === 'main'
        ? index === this._starMainIdx
        : selectedSubs.includes(index);
      const disabled = mode === 'sub' && !validSub(slot, index);
      return `<button type="button" class="smithy-pick-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}" data-${mode}-idx="${index}" ${disabled ? 'disabled' : ''} style="--quality:${quality.color}" title="${formatCraftCardName(slot.craftQuality, card.name)}">
        <img src="/sprites/cards/${card.spriteRes}.png" alt="" />
        <span class="smithy-card-label">${formatCraftCardName(slot.craftQuality, card.name)}</span>
        <em>${star === Math.max(0, Number(slot.star ?? slot.strengthLv) || 0) ? Math.max(0, Number(slot.star ?? slot.strengthLv) || 0) : Math.max(0, Number(slot.star ?? slot.strengthLv) || 0)}星</em>
      </button>`;
    };

    body.innerHTML = `
      <div class="starup-page">
        <div class="starup-head"><div><h2>${routeTitle}</h2><p>主卡与副卡必须是同一卡牌且星级一致；两条路线提升同一个星级。</p></div><button type="button" id="star-grant-test" class="bag-deck-btn">补发测试道具</button></div>
        <div class="starup-layout">
          <aside class="smithy-panel starup-info">
            <h3>成功概率</h3>
            ${main ? `<p class="starup-rate"><b>${preview?.successRate?.toFixed(1) ?? '--'}%</b><span>成功</span></p>
              <p>升两星：<strong>${preview?.doubleRate?.toFixed(1) ?? '0.0'}%</strong></p>
              <p>失败：<strong>${preview?.failureRate?.toFixed(1) ?? '--'}%</strong></p>
              <p class="smithy-meta">基础${preview?.baseRate ?? '--'}% + 同卡${preview ? preview.sameCardBonus * preview.count : 0}% + 星数判定${preview?.formulaBonus ?? 0}%</p>
              <p class="smithy-meta">连续失败：${preview?.failures ?? 0}次${preview?.pityActive ? ' · 九败概率翻倍且不掉星' : ''}</p>` : '<p class="smithy-meta">先从右侧选择主卡。</p>'}
            ${route === 'powder' ? `<h3>强化粉</h3>${powderNeed ? `<p class="smithy-material-line">${renderSmithyMaterialArt('powder', Math.min(4, star + 1))}${CardStrengthenSystem.powderName(powderNeed.itemId)} ×${powderNeed.count}</p><p class="smithy-meta">背包：${this.inventory.countItem(powderNeed.itemId)}</p>` : '<p class="smithy-warn">当前星级无强化粉配置。</p>'}` : ''}
            <h3>保护符(只能选一个)</h3>
            <div class="star-charm-list">${charmIds.map((id) => {
              const item = this.itemDb.getById(id);
              return `<button type="button" class="star-charm${this._starCharmId === id ? ' selected' : ''}" data-charm-id="${id}">${renderSmithyMaterialArt('charm', Math.min(3, id - 50020))}<span>${item?.name ?? `${id}`}</span><b>×${this.inventory.countItem(id)}</b></button>`;
            }).join('')}</div>
          </aside>

          <main class="smithy-panel starup-center">
            <h3>放入卡牌</h3>
            <div class="star-main-drop">${mainCard ? `<img src="/sprites/cards/${mainCard.spriteRes}.png" alt=""/><strong>${formatCraftCardName(main.craftQuality, mainCard.name)}</strong><span>${star}星 → ${Math.min(15, star + 1)}星</span>` : '<span>主卡槽</span>'}</div>
            <div class="star-sub-drops">${Array.from({ length: 5 }, (_, index) => {
              const subIndex = selectedSubs[index];
              const sub = subIndex != null ? slots[subIndex] : null;
              const card = sub ? this.db.getById(sub.cardId) : null;
              return card ? `<button type="button" data-remove-sub="${subIndex}"><img src="/sprites/cards/${card.spriteRes}.png" alt=""/><small>副卡</small></button>` : '<i>副卡</i>';
            }).join('')}</div>
            <button type="button" id="do-star-upgrade" class="bag-action primary" ${!preview?.ok || (route === 'powder' && !powderNeed) ? 'disabled' : ''}>开始升星</button>
            <p class="smithy-meta">失败后副卡暂存3天；高品质副卡暂存5天，可使用逆转卡还原。</p>
          </main>

          <aside class="smithy-panel starup-card-list">
            <h3>主卡列表</h3><div class="smithy-card-pick-grid starup-scroll">${entries.map((entry) => cardButton(entry, 'main')).join('')}</div>
            <h3>可用副卡</h3><div class="smithy-card-pick-grid starup-scroll">${entries.map((entry) => cardButton(entry, 'sub')).join('')}</div>
          </aside>
        </div>

        <section class="smithy-panel starup-escrow"><h3>销毁层(右键卡牌还原)</h3><div class="starup-escrow-grid">${escrow.length ? escrow.map((entry) => {
          const card = this.db.getById(entry.slot.cardId);
          const leftHours = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 3600000));
          return `<button type="button" class="escrow-card" data-escrow-id="${entry.id}"><img src="/sprites/cards/${card.spriteRes}.png" alt=""/><strong>${card.name}</strong><span>${entry.slot.star ?? 0}星 · ${leftHours}小时</span></button>`;
        }).join('') : '<p class="smithy-meta">这里空空如也</p>'}</div></section>
        <div class="star-restore-modal hidden" id="star-restore-modal"><div><h3>确认还原吗？</h3><p id="star-restore-text"></p><div><button type="button" id="star-restore-cancel">取消</button><button type="button" id="star-restore-confirm" class="bag-action primary">确认还原</button></div></div></div>
      </div>`;

    body.querySelectorAll('[data-main-idx]').forEach((button) => button.addEventListener('click', () => {
      this._starMainIdx = Number(button.dataset.mainIdx);
      this._starSubIdxs = [];
      audio.playClickCard();
      this.renderBody(root);
    }));
    body.querySelectorAll('[data-sub-idx]').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.subIdx);
      if (selectedSubs.includes(index)) this._starSubIdxs = selectedSubs.filter((value) => value !== index);
      else if (selectedSubs.length < 5) this._starSubIdxs = [...selectedSubs, index];
      audio.playClickCard();
      this.renderBody(root);
    }));
    body.querySelectorAll('[data-remove-sub]').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.removeSub);
      this._starSubIdxs = selectedSubs.filter((value) => value !== index);
      this.renderBody(root);
    }));
    body.querySelectorAll('[data-charm-id]').forEach((button) => button.addEventListener('click', () => {
      const id = Number(button.dataset.charmId);
      this._starCharmId = this._starCharmId === id ? null : id;
      this.renderBody(root);
    }));
    body.querySelector('#star-grant-test')?.addEventListener('click', () => {
      this.inventory.grantStrengthenPowders();
      this.inventory.grantStarterMaterials();
      this.inventory.addItem?.(REVERSE_CARD_ID, 20);
      this.toast(root, '已补发强化粉、保护符和逆转卡。');
      this.renderBody(root);
    });
    body.querySelector('#do-star-upgrade')?.addEventListener('click', () => {
      const result = this.starUpgradeSys.upgrade(this._starMainIdx, selectedForRoute, {
        route,
        charmId: this._starCharmId,
        powderNeed,
      });
      audio.playSmithResult(Boolean(result.success));
      if (result.success) this.onQuestEvent?.('card_strengthen', { count: 1 });
      this._starSubIdxs = [];
      this.toast(root, result.message ?? result.error ?? '升星完成');
      this.renderBody(root);
    });

    let restoreId = null;
    const modal = body.querySelector('#star-restore-modal');
    body.querySelectorAll('[data-escrow-id]').forEach((button) => button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      restoreId = button.dataset.escrowId;
      const entry = escrow.find((item) => item.id === restoreId);
      const need = Number(entry?.slot?.craftQuality || 1) > 4 ? 2 : 1;
      body.querySelector('#star-restore-text').textContent = `将消耗逆转卡×${need}，当前拥有${this.inventory.countItem(REVERSE_CARD_ID)}张。`;
      modal.classList.remove('hidden');
    }));
    body.querySelector('#star-restore-cancel')?.addEventListener('click', () => modal.classList.add('hidden'));
    body.querySelector('#star-restore-confirm')?.addEventListener('click', () => {
      const result = this.starUpgradeSys.restoreEscrow(restoreId);
      this.toast(root, result.message ?? result.error ?? '还原完成');
      this.renderBody(root);
    });
  }
  renderCraft(root, body) {
    const cards = this.craftSys.getCraftableCards();
    const target = this.db.getById(this.targetCardId);
    const preview = target
      ? this.craftSys.getPreview(target.id, {
          useCharm: this.useCharm,
          useDna: this.useDna,
          highTier: this.highTier,
          craftState: this.craftState,
        })
      : null;
    const level = target ? Math.min(4, target.quality) : 1;
    const cfg = this.itemDb.craftRegistry.getLevelConfig(level);
    const qualityPreview = this.craftSys.getCraftQualityPreview(this.useCharm);
    const last = this.lastCraftResult;
    const cardBagFull = this.cardInventory.getFreeSlots() < 1;
    const cardBagHint = `卡牌背包 ${this.cardInventory.getUsedCount()}/${this.cardInventory.getSlotCount()}(空位 ${this.cardInventory.getFreeSlots()})`;

    body.innerHTML = `
      <div class="smithy-craft-layout">
        <section class="smithy-panel smithy-card-catalogue">
          <h2>选择目标卡(1~4 级品质)</h2>
          <div class="smithy-card-pick-grid">
            ${cards
              .map((c) => {
                const q = c.qualityInfo;
                return `
                  <button type="button" class="smithy-pick-card${c.id === this.targetCardId ? ' selected' : ''}"
                    data-id="${c.id}" data-battle-usable="${c.battleUsable !== false}" data-gallery-visible="${c.galleryVisible !== false}" style="--quality:${q.color}">
                    <img src="/sprites/cards/${c.spriteRes}.png" alt="" loading="lazy" />
                    <span>${c.name}</span>
                  </button>`;
              })
              .join('')}
          </div>
        </section>
        <aside class="smithy-panel smithy-craft-side">
          ${target ? `
            <div class="classic-forge-preview">
              <img src="/sprites/cards/${target.spriteRes}.png" alt="" />
              <strong>${target.name}</strong>
              <span>${target.qualityInfo.name}</span>
              <button type="button" id="do-craft" class="classic-forge-action" ${cardBagFull ? 'disabled' : ''}>制造卡牌</button>
            </div>
            <h2 style="color:${target.qualityInfo.color}">${target.name}</h2>
            <p class="smithy-meta">${target.qualityInfo.name} · 需 ${level} 级材料</p>
            <p class="smithy-meta">${cardBagHint}</p>
            ${cardBagFull ? '<p class="smithy-warn">卡牌背包已满，无法制作。请先到背包扩容或分解/移除卡牌。</p>' : ''}
            <ul class="smithy-mat-list">
              <li>${renderSmithyMaterialArt('parchment', level)}<span>羊皮纸 x1：背包 ${cfg ? this.inventory.countItem(cfg.parchment) : 0}</span></li>
              <li>${renderSmithyMaterialArt('gem', level)}<span>宝石 x2：背包 ${cfg ? this.inventory.countItem(cfg.gem) : 0}</span></li>
            </ul>
            <label class="smithy-check">${renderSmithyMaterialArt('charm', Math.min(3, level))}<input type="checkbox" id="use-charm" ${this.useCharm ? 'checked' : ''}/> 使用保护符(失败保留材料)</label>
            <label class="smithy-check">${renderSmithyMaterialArt('dna', level)}<input type="checkbox" id="use-dna" ${this.useDna ? 'checked' : ''}/> 使用 DNA(成功必出目标，升变时返还)</label>
            <label class="smithy-check">${renderSmithyMaterialArt('clover', level)}<input type="checkbox" id="high-tier" ${this.highTier ? 'checked' : ''}/> 使用幸运草进行高阶合成(升变+5%，从「歪」概率扣除)</label>
            ${preview ? `
              <div class="smithy-preview">
                <p>制作成功率 <b>${(preview.successRate * 100).toFixed(0)}%</b>${this.craftState.hasPity(target.id) ? '(保底)' : ''}</p>
                <p>成功后 → 目标 <b>${(preview.targetRate * 100).toFixed(0)}%</b> · 升变 <b>${(preview.ascendRate * 100).toFixed(0)}%</b>${preview.ascendToQuality ? `(→${preview.ascendToQuality}级)` : ''} · 歪 <b>${(preview.wrongRate * 100).toFixed(0)}%</b></p>
                <p class="smithy-meta">成功后三档合计 <b>${((preview.targetRate + preview.ascendRate + preview.wrongRate) * 100).toFixed(0)}%</b></p>
              </div>` : ''}
            <div class="smithy-craft-quality-panel">
              <h3>成功后底座品质(1~4 级制作均会 roll)</h3>
              <p class="smithy-meta">灰·劣质 / 白·普通 / 绿·优秀 / 蓝·精良 / 紫·完美${this.useCharm ? ' · 保护符已提升高品质权重' : ''}</p>
              <ul class="smithy-quality-odds">
                ${qualityPreview.map((q) => `
                  <li style="--qcolor:${q.color}">
                    <span class="smithy-quality-dot"></span>
                    <span>${q.name}</span>
                    <b>${(q.rate * 100).toFixed(1)}%</b>
                  </li>`).join('')}
              </ul>
            </div>
            ${last ? `
              <div class="smithy-last-craft" style="--quality:${last.craftQualityInfo?.color ?? '#fff'}">
                <p class="smithy-meta">上次制作</p>
                <p class="smithy-last-name">${last.displayName ?? last.cardName}</p>
              </div>` : ''}
          ` : '<p>暂无可制作卡牌</p>'}
        </aside>
      </div>
    `;

    const craftLayout = body.querySelector('.smithy-craft-layout');
    const craftSide = body.querySelector('.smithy-craft-side');
    if (craftLayout && craftSide) {
      const probabilityPanel = document.createElement('aside');
      probabilityPanel.className = 'smithy-panel smithy-craft-probability';
      probabilityPanel.dataset.smithyProbabilityPanel = '';
      const successPreview = craftSide.querySelector('.smithy-preview');
      const qualityPanel = craftSide.querySelector('.smithy-craft-quality-panel');
      if (successPreview) probabilityPanel.append(successPreview);
      if (qualityPanel) probabilityPanel.append(qualityPanel);
      craftLayout.insertBefore(probabilityPanel, craftLayout.firstElementChild);
    }

    body.querySelectorAll('.smithy-pick-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playClickCard();
        this.targetCardId = Number(btn.dataset.id);
        this.renderBody(root);
      });
    });
    const bindCheck = (id, key) => {
      const el = body.querySelector(id);
      if (el) el.addEventListener('change', () => { this[key] = el.checked; this.renderBody(root); });
    };
    bindCheck('#use-charm', 'useCharm');
    bindCheck('#use-dna', 'useDna');
    bindCheck('#high-tier', 'highTier');
    body.querySelector('#do-craft')?.addEventListener('click', () => {
      const res = this.craftSys.craft(this.targetCardId, this.inventory, this.cardInventory, this.craftState, {
        useCharm: this.useCharm,
        useDna: this.useDna,
        highTier: this.highTier,
      });
      if (res.ok && res.displayName) {
        this.lastCraftResult = res;
      }
      if (res.ok) {
        const failed = res.result === 'fail' || res.result === 'fail_protected';
        audio.playSmithResult(!failed);
        if (!failed && res.displayName) this.onQuestEvent?.('card_craft', { count: 1 });
      } else {
        audio.playButton('click');
      }
      this.toast(root, res.message ?? res.error ?? '完成');
      this.renderBody(root);
    });
  }

  renderStrengthen(root, body) {
    this.renderUpgradeRoute(root, body, 'powder');
  }
  renderDecompose(root, body) {
    const entries = this.cardInventory.getSlots()
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot && !this.db.getById(slot.cardId)?.isExperienceCard);
    const sel = this.cardIndex >= 0 ? this.cardInventory.getSlots()[this.cardIndex] : null;
    const card = sel ? this.db.getById(sel.cardId) : null;
    const pv = sel && card ? this.decomposeSys.preview(sel, card) : null;

    body.innerHTML = `
      <div class="smithy-craft-layout smithy-decompose-layout">
        <section class="smithy-panel smithy-card-catalogue">
          <h2>选择要分解的卡</h2>
          <div class="smithy-card-pick-grid">
            ${entries.map(({ slot, index }) => {
              const c = this.db.getById(slot.cardId);
              const cq = resolveCraftQuality(slot.craftQuality);
              const label = formatCraftCardName(slot.craftQuality, c.name);
              return `
                <button type="button" class="smithy-pick-card${index === this.cardIndex ? ' selected' : ''}" data-idx="${index}"
                  style="--quality:${cq.color}" title="${label}">
                  <img src="/sprites/cards/${c.spriteRes}.png" alt="" />
                  <span class="smithy-card-label">${label}</span>
                </button>`;
            }).join('')}
          </div>
        </section>
        <aside class="smithy-panel smithy-craft-side smithy-decompose-side">
          ${pv ? `
            <div class="classic-forge-preview">
              <img src="/sprites/cards/${card.spriteRes}.png" alt="" />
              <strong>${formatCraftCardName(sel.craftQuality, card.name)}</strong>
            </div>
            <h2 style="color:${resolveCraftQuality(sel.craftQuality).color}">${formatCraftCardName(sel.craftQuality, card.name)}</h2>
            <p>返还宝石 x${pv.gem}</p>
            <p>羊皮纸概率 ${(pv.parchmentChance * 100).toFixed(0)}%</p>
            ${pv.pieceItemId ? `<p> x${pv.pieceCount}</p>` : ''}
            <button type="button" id="do-decompose" class="bag-action danger">分解</button>
          ` : '<p>点击左侧卡牌</p>'}
        </aside>
      </div>
    `;

    body.querySelectorAll('[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playClickCard();
        this.cardIndex = Number(btn.dataset.idx);
        this.renderBody(root);
      });
    });
    body.querySelector('#do-decompose')?.addEventListener('click', () => {
      if (!confirm(`确定分解「${formatCraftCardName(sel.craftQuality, card?.name ?? '')}」？`)) return;
      const res = this.decomposeSys.decompose(this.inventory, this.cardInventory, this.cardIndex);
      this.cardIndex = -1;
      this.toast(root, res.message ?? res.error ?? '');
      this.renderBody(root);
    });
  }

  renderMaterial(root, body) {
    const ratio = this.itemDb.craftRegistry.getCombineRatio();
    const chain = this.itemDb.craftRegistry.getMaterialChain(this.matType);
    const from = chain.find((c) => c.level === this.matFromLevel);
    const to = chain.find((c) => c.level === this.matFromLevel + 1);
    const fromItem = from ? this.itemDb.getById(from.itemId) : null;
    const toItem = to ? this.itemDb.getById(to.itemId) : null;

    body.innerHTML = `
      <div class="smithy-material-layout">
        <main class="smithy-panel smithy-material-workbench">
          <div class="smithy-stat-board">
            <p>花费金币：<b>0</b></p>
            <p>公会加成：<b>0%</b></p>
            <p>总成功率：<b>100%</b></p>
          </div>
          <h2>加工材料</h2>
          ${fromItem && toItem ? `
            <div class="classic-material-preview">
              <div>${renderSmithyMaterialArt(this.matType, from.level, 'large')}<span>${from.level}级</span><strong>${fromItem.name}</strong><em>×${ratio}</em></div>
              <i>➜</i>
              <div>${renderSmithyMaterialArt(this.matType, to.level, 'large')}<span>${to.level}级</span><strong>${toItem.name}</strong><em>×1</em></div>
            </div>
            <p>背包拥有 ${fromItem.name}：<b>${this.inventory.countItem(from.itemId)}</b></p>
            <button type="button" id="do-combine" class="bag-action primary">加工材料</button>
          ` : '<p>已达最高等级</p>'}
        </main>
        <aside class="smithy-panel smithy-material-catalog">
          <h2>您要加工什么？</h2>
          <div class="smithy-mat-toolbar">
            ${MAT_TYPES.map((t) => `<button type="button" class="bag-tab${t.id === this.matType ? ' active' : ''}" data-mtype="${t.id}">${t.label}</button>`).join('')}
          </div>
          <div class="smithy-material-chain">
            ${chain.slice(0, -1).map((c) => {
              const source = this.itemDb.getById(c.itemId);
              const targetEntry = chain.find((entry) => entry.level === c.level + 1);
              const targetMaterial = targetEntry ? this.itemDb.getById(targetEntry.itemId) : null;
              return `<button type="button" class="smithy-material-row${c.level === this.matFromLevel ? ' active' : ''}" data-mlv="${c.level}">
                ${renderSmithyMaterialArt(this.matType, c.level)}
                <strong>${source?.name ?? c.level + '级材料'}</strong>
                <em>加工为 ${targetMaterial?.name ?? c.level + 1 + '级材料'}</em>
              </button>`;
            }).join('')}
          </div>
        </aside>
      </div>
    `;

    body.querySelectorAll('[data-mtype]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.matType = btn.dataset.mtype;
        this.matFromLevel = 1;
        this.renderBody(root);
      });
    });
    body.querySelectorAll('[data-mlv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.matFromLevel = Number(btn.dataset.mlv);
        this.renderBody(root);
      });
    });
    body.querySelector('#do-combine')?.addEventListener('click', () => {
      const res = this.materialSys.combine(this.inventory, this.matType, this.matFromLevel);
      this.toast(root, res.ok ? `获得 ${res.itemName}` : res.error);
      this.renderBody(root);
    });
  }

  toast(root, msg) {
    const el = root.querySelector('#smithy-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
  }
}
