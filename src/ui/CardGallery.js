import { audio } from '../core/AudioManager.js';
import { CARD_QUALITY, CARD_TYPE } from '../core/constants.js';
import { formatBattleAmount } from '../battle/BattleConfig.js';
import { CardEvoSystem } from '../systems/CardEvoSystem.js';
import { CombineSystem } from '../systems/CombineSystem.js';

const PAGE_SIZE = 24;

export class CardGallery {
  constructor(db) {
    this.db = db;
    this.evo = new CardEvoSystem(db);
    this.combine = new CombineSystem(db);
    this.filters = { quality: '', type: '', keyword: '' };
    this.stats = db.getStats();
    this.page = 0;
  }

  render(root) {
    root.innerHTML = `
      <div class="page gallery-page">
        <aside class="sidebar">
          <section class="panel">
            <h2>筛选</h2>
            <label>搜索<input id="search" type="search" placeholder="名称 / ID" /></label>
            <label>品质
              <select id="filter-quality">
                <option value="">全部</option>
                ${Object.entries(CARD_QUALITY).filter(([k]) => Number(k) <= 6).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
              </select>
            </label>
            <label>类型
              <select id="filter-type">
                <option value="">全部</option>
                ${Object.entries(CARD_TYPE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
              </select>
            </label>
          </section>
          <section class="panel">
            <h2>品质分布</h2>
            <ul class="dist-list">
              ${Object.entries(this.stats.byQuality).map(([q, n]) => {
                const quality = CARD_QUALITY[q] ?? CARD_QUALITY[1];
                return `<li><span class="dot" style="background:${quality.color}"></span>${quality.name} <b>${n}</b></li>`;
              }).join('')}
            </ul>
          </section>
        </aside>
        <section class="content">
          <div class="gallery-main">
            <div id="card-grid" class="card-grid"></div>
            <div class="gallery-pagination">
              <button type="button" id="page-prev" class="page-btn">上一页</button>
              <span id="page-info" class="page-info">第 1 页</span>
              <button type="button" id="page-next" class="page-btn">下一页</button>
            </div>
          </div>
          <aside id="detail" class="detail empty"><p>点击卡牌查看详情</p></aside>
        </section>
      </div>`;
    this.bindEvents(root);
    this.renderCardGrid(root);
  }

  getFilteredCards() {
    let cards = this.db.search(this.filters.keyword);
    if (this.filters.quality) cards = cards.filter((c) => c.quality === Number(this.filters.quality));
    if (this.filters.type) cards = cards.filter((c) => c.type === Number(this.filters.type));
    return cards.sort((a, b) => a.quality - b.quality || a.id - b.id);
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
    const grid = root.querySelector('#card-grid');
    grid.innerHTML = cards.length ? cards.map((card) => {
      const q = card.qualityInfo;
      return `<button type="button" class="card-item" data-id="${card.id}" style="--quality:${q.color}">
        <img class="card-thumb-img" src="/sprites/cards/${card.spriteRes}.png" alt="" loading="lazy" />
        <div class="card-meta"><strong>${card.name}</strong><small>#${card.id} · ${q.name}</small></div>
      </button>`;
    }).join('') : '<p class="gallery-empty">没有匹配的卡牌</p>';

    root.querySelector('#page-info').textContent = `第 ${this.page + 1} / ${totalPages} 页(共 ${total} 张)`;
    root.querySelector('#page-prev').disabled = this.page <= 0;
    root.querySelector('#page-next').disabled = this.page >= totalPages - 1;
  }

  renderDetail(root, card) {
    const panel = root.querySelector('#detail');
    panel.classList.remove('empty');
    const evo0 = this.evo.getExpGainOnFeed(card.quality, 0);
    const combineOpts = this.combine.getOptions(card.quality).slice(0, 3);
    const battleAtk = formatBattleAmount(card.atk);
    const battleHp = formatBattleAmount(card.hp);

    panel.innerHTML = `
      <div class="detail-header" style="--quality:${card.qualityInfo.color}">
        <img class="detail-thumb-img" src="/sprites/cards/${card.spriteRes}.png" alt="" />
        <div><h2>${card.name}</h2><p class="tags"><span>${card.qualityInfo.name}</span><span>${card.typeLabel}</span><span>${card.viewTypeLabel}</span></p></div>
      </div>
      <dl class="detail-stats">
        <div><dt>攻击</dt><dd>${battleAtk}</dd></div>
        <div><dt>生命</dt><dd>${battleHp}</dd></div>
        <div><dt>费用</dt><dd>${card.cost}</dd></div>
        <div><dt>冷却</dt><dd>${card.cooldown}s</dd></div>
        <div><dt>攻速</dt><dd>${card.atkSpeed || '-'}</dd></div>
        <div><dt>移速</dt><dd>${card.moveSpeed || '-'}</dd></div>
        <div><dt>攻击方式</dt><dd>${card.atkStyleLabel}</dd></div>
        <div><dt>立绘资源</dt><dd>res/${card.spriteRes}</dd></div>
      </dl>
      <p class="desc">${card.desc || '无描述'}</p>
      <section class="sub-panel"><h3>进化经验</h3><p>每张卡提供 <b>${evo0}</b> 经验</p></section>
      <section class="sub-panel"><h3>合成规则(${card.qualityInfo.name})</h3><ul>${combineOpts.map((o) => `<li>${o.num} 张材料 → 成功率 ${o.rate}% · 银币 ${o.consume_silver}</li>`).join('')}</ul></section>`;
  }

  bindEvents(root) {
    root.querySelector('#search').addEventListener('input', (e) => { this.filters.keyword = e.target.value; this.page = 0; this.renderCardGrid(root); });
    root.querySelector('#filter-quality').addEventListener('change', (e) => { this.filters.quality = e.target.value; this.page = 0; this.renderCardGrid(root); });
    root.querySelector('#filter-type').addEventListener('change', (e) => { this.filters.type = e.target.value; this.page = 0; this.renderCardGrid(root); });
    root.querySelector('#page-prev').addEventListener('click', () => { if (this.page > 0) { audio.playButton('page'); this.page -= 1; this.renderCardGrid(root); } });
    root.querySelector('#page-next').addEventListener('click', () => { const { totalPages } = this.getPageCards(); if (this.page < totalPages - 1) { audio.playButton('page'); this.page += 1; this.renderCardGrid(root); } });
    root.querySelector('#card-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      audio.playClickCard();
      this.renderDetail(root, this.db.getById(btn.dataset.id));
      root.querySelectorAll('.card-item').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
    });
  }
}
