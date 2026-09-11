import { audio } from '../core/AudioManager.js';
import { CARD_QUALITY, CARD_TYPE } from '../core/constants.js';
import { formatBattleAmount } from '../battle/BattleConfig.js';
import { gameSettings } from '../core/GameSettingsStore20260910.js';

const PAGE_SIZE = 24;
/**
 * 图鉴展示全部可见卡（92 张；经验卡不进图鉴）。
 *
 * 注意：CardDatabase 里的 Card.quality 会被 clamp 到 1~5（Card.js: `Math.min(5, ...)`），
 * 所以 card.json 里那几张 card_quality=6 的卡在图鉴里就是「5 级卡」，图鉴不存在 6 级分组。
 * 要额外隐藏哪些卡，填 GALLERY_HIDDEN_CARD_IDS（用户圈选后由这里过滤）。
 */
const GALLERY_MAX_QUALITY = 5;
/** 手动屏蔽的卡（用户圈选），默认空。 */
const GALLERY_HIDDEN_CARD_IDS = new Set([]);
/** 图鉴里品质从低到高分组显示：1 级卡在最前。 */
const GALLERY_QUALITY_ORDER = [1, 2, 3, 4, 5];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** 数据里存在没登记的 card_type（例如 #1 花生射手是 0），图鉴里统一兜底成「其他」，不然筛不出来。 */
const typeLabelOf = (type) => CARD_TYPE[Number(type)] ?? '其他';

const qualityInfoOf = (quality) => CARD_QUALITY[Number(quality)] ?? { name: `${quality} 级卡`, color: '#9e9e9e' };

export class CardGallery {
  /**
   * @param {import('../core/CardDatabase.js').CardDatabase} db
   * @param {{ inventory?: { ownsCard?: (id: number) => boolean, getOwnershipMap?: () => Map<number, number> } }} [options]
   */
  constructor(db, options = {}) {
    this.db = db;
    this.inventory = options.inventory ?? null;
    this.filters = { quality: '', type: '', keyword: '' };
    this.stats = db.getStats();
    this.page = 0;
    this.unsubscribe = gameSettings.subscribe((key) => {
      // 设置里改了「未获得卡剪影」要立刻反映到已经打开的图鉴上。
      if (key === 'gallerySilhouetteUnowned' && this.root) this.renderCardGrid(this.root);
    });
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** 图鉴实际要显示的卡：1~6 级、可见、非经验卡，再扣掉手动屏蔽的。 */
  baseCards() {
    return this.db.getVisibleCards().filter((card) => {
      if (GALLERY_HIDDEN_CARD_IDS.has(Number(card.id))) return false;
      const quality = Number(card.quality);
      return Number.isFinite(quality) && quality >= 1 && quality <= GALLERY_MAX_QUALITY;
    });
  }

  ownedIdSet() {
    try {
      const ids = this.inventory?.getOwnershipMap?.();
      if (ids instanceof Map) return new Set(ids.keys());
      const list = this.inventory?.getOwnedCardIds?.();
      if (Array.isArray(list)) return new Set(list.map((id) => Number(id)));
    } catch {
      // 拿不到背包数据就当作全部已拥有（图鉴默认也是显示立绘）。
    }
    return null;
  }

  ownsCard(cardId, owned = null) {
    if (!this.inventory) return true;
    try {
      if (typeof this.inventory.ownsCard === 'function') return this.inventory.ownsCard(cardId);
    } catch {
      return true;
    }
    return owned ? owned.has(Number(cardId)) : true;
  }

  render(root) {
    this.root = root;
    root.innerHTML = `
      <div class="page gallery-page gallery-chrome-v2">
        <aside class="gallery-categories">
          <h2 class="gallery-plaque">图鉴</h2>
          <section class="gallery-group">
            <h3>分类</h3>
            <div class="gallery-chips" id="gallery-type-chips"></div>
          </section>
          <section class="gallery-group">
            <h3>品质</h3>
            <div class="gallery-chips" id="gallery-quality-chips"></div>
          </section>
          <section class="gallery-group">
            <h3>搜索</h3>
            <input id="search" class="gallery-search" type="search" placeholder="名称 / 编号" />
          </section>
          <section class="gallery-group gallery-collect">
            <h3>收集度</h3>
            <p><b id="gallery-owned-count">0</b> / <span id="gallery-total-count">0</span></p>
            <p class="gallery-collect-hint">未获得的卡在设置里可切换剪影</p>
          </section>
        </aside>
        <section class="gallery-main">
          <header class="gallery-main-head">
            <strong id="gallery-title">全部卡牌</strong>
            <span id="gallery-count"></span>
          </header>
          <div class="gallery-scroll" id="gallery-scroll"></div>
          <div class="gallery-pagination">
            <button type="button" id="page-prev" class="page-btn">上一页</button>
            <span id="page-info" class="page-info">第 1 页</span>
            <button type="button" id="page-next" class="page-btn">下一页</button>
          </div>
        </section>
        <aside id="detail" class="gallery-detail empty"><p>点击卡牌查看详情</p></aside>
      </div>`;
    this.bindEvents(root);
    this.renderChips(root);
    this.renderCardGrid(root);
  }

  renderChips(root) {
    const cards = this.baseCards();
    const types = [...new Set(cards.map((card) => Number(card.type)))].sort((a, b) => a - b);
    const typeChips = root.querySelector('#gallery-type-chips');
    if (typeChips) {
      typeChips.innerHTML = [
        `<button type="button" class="gallery-chip${this.filters.type === '' ? ' active' : ''}" data-type="">全部</button>`,
        ...types.map((type) => `<button type="button" class="gallery-chip${String(this.filters.type) === String(type) ? ' active' : ''}" data-type="${type}">${escapeHtml(typeLabelOf(type))}</button>`),
      ].join('');
    }
    const qualityChips = root.querySelector('#gallery-quality-chips');
    if (qualityChips) {
      // 只列出真的还有卡的等级，避免出现「6级卡 0」这种点进去是空的按钮。
      const presentQualities = GALLERY_QUALITY_ORDER.filter((quality) => cards.some((card) => Number(card.quality) === quality));
      qualityChips.innerHTML = [
        `<button type="button" class="gallery-chip${this.filters.quality === '' ? ' active' : ''}" data-quality="">全部</button>`,
        ...presentQualities.map((quality) => {
          const info = qualityInfoOf(quality);
          const count = cards.filter((card) => Number(card.quality) === quality).length;
          return `<button type="button" class="gallery-chip${String(this.filters.quality) === String(quality) ? ' active' : ''}" data-quality="${quality}" style="--chip:${info.color}">${info.name}<small>${count}</small></button>`;
        }),
      ].join('');
    }
    const owned = this.ownedIdSet();
    const ownedCount = owned ? cards.filter((card) => owned.has(Number(card.id))).length : cards.length;
    const ownedEl = root.querySelector('#gallery-owned-count');
    if (ownedEl) ownedEl.textContent = String(ownedCount);
    const totalEl = root.querySelector('#gallery-total-count');
    if (totalEl) totalEl.textContent = String(cards.length);
  }

  getFilteredCards() {
    let cards = this.baseCards();
    const keyword = this.filters.keyword.trim().toLowerCase();
    if (keyword) {
      cards = cards.filter((card) => (
        card.name.toLowerCase().includes(keyword)
        || String(card.id).includes(keyword)
        || (card.desc && card.desc.includes(this.filters.keyword.trim()))
      ));
    }
    if (this.filters.quality !== '') cards = cards.filter((card) => Number(card.quality) === Number(this.filters.quality));
    if (this.filters.type !== '') cards = cards.filter((card) => Number(card.type) === Number(this.filters.type));
    // 品质从低到高（1 级卡在前）；同品质按编号。
    return cards.sort((a, b) => Number(a.quality) - Number(b.quality) || a.id - b.id);
  }

  getPageCards() {
    const all = this.getFilteredCards();
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (this.page >= totalPages) this.page = totalPages - 1;
    if (this.page < 0) this.page = 0;
    const start = this.page * PAGE_SIZE;
    return { cards: all.slice(start, start + PAGE_SIZE), totalPages, total: all.length };
  }

  renderCardGrid(root) {
    const { cards, totalPages, total } = this.getPageCards();
    const owned = this.ownedIdSet();
    const silhouette = gameSettings.get('gallerySilhouetteUnowned') === true;
    const scroll = root.querySelector('#gallery-scroll');
    const title = root.querySelector('#gallery-title');
    const countEl = root.querySelector('#gallery-count');

    if (title) {
      const parts = [];
      if (this.filters.type !== '') parts.push(typeLabelOf(this.filters.type));
      if (this.filters.quality !== '') parts.push(qualityInfoOf(this.filters.quality).name);
      title.textContent = parts.length ? parts.join(' · ') : '全部卡牌';
    }
    if (countEl) countEl.textContent = `${total} 张`;

    if (!cards.length) {
      scroll.innerHTML = '<p class="gallery-empty">没有匹配的卡牌</p>';
    } else {
      // 按品质分组（同页内），6→1 反过来就是 5→1。
      const groups = new Map();
      for (const card of cards) {
        const quality = Number(card.quality);
        if (!groups.has(quality)) groups.set(quality, []);
        groups.get(quality).push(card);
      }
      scroll.innerHTML = [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([quality, groupCards]) => {
          const info = qualityInfoOf(quality);
          return `<section class="gallery-quality-group" data-quality="${quality}" style="--quality:${info.color}">
            <h3 class="gallery-quality-title"><span class="gallery-quality-dot"></span>${escapeHtml(info.name)}<small>${groupCards.length} 张</small></h3>
            <div class="card-grid">${groupCards.map((card) => this.cardMarkup(card, { owned, silhouette })).join('')}</div>
          </section>`;
        }).join('');
    }

    root.querySelector('#page-info').textContent = `第 ${this.page + 1} / ${totalPages} 页（共 ${total} 张）`;
    root.querySelector('#page-prev').disabled = this.page <= 0;
    root.querySelector('#page-next').disabled = this.page >= totalPages - 1;
  }

  cardMarkup(card, { owned, silhouette }) {
    const info = qualityInfoOf(card.quality);
    const isOwned = this.ownsCard(card.id, owned);
    const locked = silhouette && !isOwned;
    return `<button type="button" class="card-item${locked ? ' is-unowned' : ''}" data-id="${card.id}" style="--quality:${info.color}">
      <span class="card-thumb"><img class="card-thumb-img" src="/sprites/cards/${card.spriteRes}.png" alt="" loading="lazy" />${locked ? '<i class="card-lock">?</i>' : ''}</span>
      <span class="card-meta"><strong>${escapeHtml(card.name)}</strong><small>#${card.id} · ${escapeHtml(info.name)}</small></span>
    </button>`;
  }

  renderDetail(root, card) {
    const panel = root.querySelector('#detail');
    if (!card) {
      panel.classList.add('empty');
      panel.innerHTML = '<p>点击卡牌查看详情</p>';
      return;
    }
    panel.classList.remove('empty');
    const ownedMap = (() => {
      try {
        return this.inventory?.getOwnershipMap?.() ?? null;
      } catch {
        return null;
      }
    })();
    const ownedCount = ownedMap instanceof Map ? (ownedMap.get(Number(card.id)) ?? 0) : null;
    const info = qualityInfoOf(card.quality);
    const stats = [
      ['攻击', formatBattleAmount(card.atk)],
      ['生命', formatBattleAmount(card.hp)],
      ['费用', card.cost],
      ['冷却', `${card.cooldown}s`],
      ['攻速', card.atkSpeed || '-'],
      ['移速', card.moveSpeed || '-'],
      ['攻击方式', card.atkStyleLabel ?? '-'],
    ];
    panel.innerHTML = `
      <div class="gallery-detail-head" style="--quality:${info.color}">
        <div class="gallery-detail-art"><img src="/sprites/cards/${card.spriteRes}.png" alt="" /></div>
        <div class="gallery-detail-title">
          <h2>${escapeHtml(card.name)}</h2>
          <p class="gallery-detail-tags">
            <span style="--tag:${info.color}">${escapeHtml(info.name)}</span>
            <span>${escapeHtml(typeLabelOf(card.type))}</span>
            <span>${escapeHtml(card.viewTypeLabel)}</span>
          </p>
          <p class="gallery-detail-owned">${ownedCount === null ? '—' : (ownedCount > 0 ? `已拥有 ×${ownedCount}` : '未获得')}</p>
        </div>
      </div>
      <dl class="gallery-detail-stats">
        ${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>
      <p class="gallery-detail-desc">${escapeHtml(card.desc || '暂无描述')}</p>
      ${card.intro ? `<section class="gallery-detail-lore"><h3>卡牌故事</h3><p>${escapeHtml(card.intro)}</p></section>` : ''}`;
    panel.scrollTop = 0;
  }

  bindEvents(root) {
    root.querySelector('#search')?.addEventListener('input', (e) => {
      this.filters.keyword = e.target.value;
      this.page = 0;
      this.renderCardGrid(root);
    });
    root.querySelector('#gallery-type-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-type]');
      if (!chip) return;
      audio.playButton('tab');
      this.filters.type = chip.dataset.type;
      this.page = 0;
      this.renderChips(root);
      this.renderCardGrid(root);
    });
    root.querySelector('#gallery-quality-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-quality]');
      if (!chip) return;
      audio.playButton('tab');
      this.filters.quality = chip.dataset.quality;
      this.page = 0;
      this.renderChips(root);
      this.renderCardGrid(root);
    });
    root.querySelector('#page-prev').addEventListener('click', () => {
      if (this.page <= 0) return;
      audio.playButton('page');
      this.page -= 1;
      this.renderCardGrid(root);
    });
    root.querySelector('#page-next').addEventListener('click', () => {
      const { totalPages } = this.getPageCards();
      if (this.page >= totalPages - 1) return;
      audio.playButton('page');
      this.page += 1;
      this.renderCardGrid(root);
    });
    root.querySelector('#gallery-scroll').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      audio.playClickCard();
      this.renderDetail(root, this.db.getById(btn.dataset.id));
      root.querySelectorAll('.card-item').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
    });
  }
}
