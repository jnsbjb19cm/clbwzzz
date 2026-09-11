import { AuctionView } from './AuctionView.js';
import { economyItemIcon, economyItemDb } from './EconomyItemIcon.js';
import { CardDatabase } from '../core/CardDatabase.js';
import { formatCraftCardName } from '../core/constants.js';
import { authStore } from '../core/AuthStore.js';
import './EconomyGridUi.css';
import './AuctionTradingHall.css';

const PATCH_FLAG = Symbol.for('clbwzzz.auctionGrid20260905');
const cards = new CardDatabase();
const PAGE_SIZE = 6;
const CATEGORIES = [['all', '全部商品'], ['item', '道具'], ['card', '卡牌']];
const STATUS = { active: '寄售中', sold: '已售出', cancelled: '已取回' };
const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const kind = (row) => row.kind === 'card' ? 'card' : 'item';
function name(row) {
  return kind(row) === 'card'
    ? formatCraftCardName(row.craftQuality, cards.getById(row.cardId)?.name ?? `卡牌#${row.cardId}`, row.customName)
    : economyItemDb.getById(Number(row.itemId))?.name ?? `道具#${row.itemId}`;
}
function icon(row, size = 52) {
  if (kind(row) !== 'card') return economyItemIcon(row.itemId, size);
  const card = cards.getById(row.cardId);
  return `<span class="auction-card-art" style="width:${size}px;height:${size}px"><img src="/sprites/cards/${esc(card?.spriteRes ?? row.cardId)}.png" alt=""><small>${Number(row.star) || 0}★</small></span>`;
}
function notice(view, text, error = false) {
  const el = view.root?.querySelector('[data-auction-notice]');
  if (el) { el.textContent = text; el.classList.toggle('is-error', error); }
}
function selectRows(view, rows) {
  const query = view._query.trim().toLowerCase();
  return rows.filter((row) => (view._category === 'all' || kind(row) === view._category) && (!query || name(row).toLowerCase().includes(query)));
}
function paint(view) {
  const root = view.root;
  if (!root?.querySelector('.auction-trading-hall')) return;
  root.querySelectorAll('[data-auction-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.auctionTab === view._tab); b.setAttribute('aria-selected', String(b.dataset.auctionTab === view._tab)); });
  root.querySelectorAll('[data-auction-category]').forEach((b) => { b.classList.toggle('active', b.dataset.auctionCategory === view._category); b.setAttribute('aria-pressed', String(b.dataset.auctionCategory === view._category)); });
  const rows = selectRows(view, view._tab === 'browse' ? view._market : view._mine);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  view._page = Math.min(pages, Math.max(1, view._page));
  const visible = rows.slice((view._page - 1) * PAGE_SIZE, view._page * PAGE_SIZE);
  const panel = root.querySelector('[data-auction-results]');
  panel.innerHTML = `${view._tab === 'consign' ? '<h3 class="auction-record-heading">我的寄售</h3>' : ''}<div class="auction-table-wrap"><table class="auction-table"><thead><tr><th>名称</th><th>数量</th><th>${view._tab === 'browse' ? '出售者' : '状态'}</th><th>当前总价</th><th>操作</th></tr></thead><tbody>${visible.map((row) => {
    const mine = Number(row.sellerId) === Number(authStore.user?.id ?? authStore.snapshot?.profile?.userId);
    return `<tr><td><div class="auction-product">${icon(row)}<span>${esc(name(row))}<small>${kind(row) === 'card' ? '卡牌 · ' + (Number(row.star) || 0) + '星' : '道具 · 非绑定'}</small></span></div></td><td>${Number(row.count)}</td><td>${esc(view._tab === 'browse' ? row.sellerName || '玩家' : STATUS[row.status] || row.status)}</td><td class="auction-price">${Number(row.price).toLocaleString()} <small>金币</small></td><td>${view._tab === 'browse' ? `<button data-auction-buy="${row.listingId}" ${mine || view._busy ? 'disabled' : ''}>${mine ? '本人寄售' : '购买'}</button>` : row.status === 'active' ? `<button data-auction-cancel="${row.listingId}" ${view._busy ? 'disabled' : ''}>取回</button>` : '—'}</td></tr>`;
  }).join('') || `<tr><td colspan="5" class="auction-empty">${view._loading ? '正在加载商品…' : view._tab === 'browse' ? '当前分类暂无商品' : '当前分类暂无寄售记录'}</td></tr>`}</tbody></table></div>`;
  root.querySelector('[data-auction-page]').textContent = `${view._page} / ${pages}`;
  root.querySelector('[data-auction-prev]').disabled = view._page <= 1;
  root.querySelector('[data-auction-next]').disabled = view._page >= pages;
  root.querySelector('[data-auction-gold]').textContent = Number(authStore.snapshot?.profile?.gold || 0).toLocaleString();
  const consign = root.querySelector('[data-auction-consign]');
  consign.hidden = view._tab !== 'consign';
  if (view._tab === 'consign') {
    const available = selectRows(view, [...view._items.map((row) => ({ ...row, kind: 'item' })), ...view._cards]);
    consign.innerHTML = `<h3>我的可寄售背包 <small>仅显示非绑定物品；卡牌按单张寄售</small></h3><div class="auction-consign-work"><div class="auction-stock">${available.map((row, index) => `<button data-auction-stock="${index}" class="auction-stock-slot" title="${esc(name(row))}">${icon(row, 52)}<span>${esc(name(row))}</span><small>×${kind(row) === 'card' ? 1 : Number(row.count)}</small></button>`).join('') || '<p class="auction-empty">当前分类没有可寄售物品</p>'}</div><form data-auction-form><h4>上架寄售</h4><div data-auction-picked>从左侧背包选择物品</div><label>数量<input name="count" type="number" min="1" step="1" value="1" required disabled></label><label>总价（金币）<input name="price" type="number" min="1" max="1000000000" step="1" value="100" required></label><button type="submit" disabled>确认寄售</button></form></div>`;
    view._available = available;
    view._picked = null;
    consign.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!view._picked || view._busy) return;
      const form = event.currentTarget;
      const row = view._picked;
      const count = Number(form.elements.count.value), price = Number(form.elements.price.value);
      if (!Number.isInteger(count) || count < 1 || count > Math.min(10000, row.count || 1) || !Number.isInteger(price) || price < 1 || price > 1e9) return notice(view, '请填写有效数量和总价', true);
      const payload = kind(row) === 'card' ? { kind: 'card', slotIndex: row.slotIndex, saleKey: row.saleKey, price } : { itemId: row.itemId, count, price };
      void mutate(view, () => view.api.post('/auction', payload), '寄售成功');
    });
  }
}
async function mutate(view, operation, message) {
  if (view._busy) return;
  view._busy = true;
  view.root.querySelectorAll('[data-auction-buy],[data-auction-cancel],[data-auction-form] button').forEach((b) => { b.disabled = true; });
  try { await operation(); const refreshed = await view.load(); notice(view, refreshed ? message : `${message}，列表刷新失败，请点击刷新`, !refreshed); }
  catch (error) { notice(view, error.message || '操作失败', true); }
  finally { view._busy = false; paint(view); }
}

export function installAuctionGridPatch() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  AuctionView.prototype.render = async function (root) {
    this.root?.removeEventListener('click', this._auctionClick);
    this.root = root; this._tab = 'browse'; this._category = 'all'; this._query = ''; this._page = 1;
    this._market = []; this._mine = []; this._items = []; this._cards = []; this._busy = false;
    root.innerHTML = `<section class="auction-trading-hall" aria-label="交易场"><header class="auction-hall-header"><h2>交易场</h2><button data-auction-help>交易说明</button></header><nav class="auction-tabs" role="tablist"><button role="tab" data-auction-tab="browse">浏览</button><button role="tab" data-auction-tab="consign">寄售</button></nav><form class="auction-search" data-auction-search><input name="keyword" aria-label="商品名称" placeholder="请输入物品名称" maxlength="80"><button>搜索</button></form><div class="auction-hall-body"><aside class="auction-categories" aria-label="商品分类">${CATEGORIES.map(([id, label]) => `<button data-auction-category="${id}"><span>＋</span>${label}</button>`).join('')}</aside><main class="auction-main"><div data-auction-results></div><div class="auction-pagination"><button data-auction-prev aria-label="上一页">◀</button><span data-auction-page></span><button data-auction-next aria-label="下一页">▶</button></div><section data-auction-consign hidden></section></main></div><footer class="auction-footer"><span>金币 <b data-auction-gold>0</b></span><p data-auction-notice role="status" aria-live="polite"></p><button data-auction-refresh>刷新</button></footer></section>`;
    root.querySelector('[data-auction-search]').addEventListener('submit', (e) => { e.preventDefault(); this._query = e.currentTarget.elements.keyword.value; this._page = 1; paint(this); });
    root.addEventListener('click', this._auctionClick = (event) => {
      const button = event.target.closest('button');
      if (!button || !root.contains(button) || button.disabled) return;
      const d = button.dataset;
      if (d.auctionTab) { this._tab = d.auctionTab; this._page = 1; paint(this); }
      else if (d.auctionCategory) { this._category = d.auctionCategory; this._page = 1; paint(this); }
      else if ('auctionPrev' in d || 'auctionNext' in d) { this._page += 'auctionNext' in d ? 1 : -1; paint(this); }
      else if ('auctionRefresh' in d) void this.load();
      else if ('auctionHelp' in d) notice(this, '使用金币按总价购买。仅支持非绑定道具和卡牌；卡牌星级、品质和附加属性保留。寄售无到期时间，可在“寄售”中取回。');
      else if ('auctionStock' in d) {
        const row = this._available[Number(d.auctionStock)]; if (!row) return;
        this._picked = row;
        root.querySelectorAll('[data-auction-stock]').forEach((b) => b.classList.toggle('selected', b === button));
        const form = root.querySelector('[data-auction-form]');
        form.querySelector('[data-auction-picked]').innerHTML = `${icon(row, 64)}<strong>${esc(name(row))}</strong>`;
        form.elements.count.disabled = false; form.elements.count.readOnly = kind(row) === 'card'; form.elements.count.max = String(Math.min(10000, row.count || 1)); form.elements.count.value = '1';
        form.querySelector('button').disabled = this._busy;
      } else if (d.auctionBuy) {
        const row = this._market.find((a) => Number(a.listingId) === Number(d.auctionBuy));
        if (row && confirm(`花费 ${row.price} 金币购买「${name(row)}」×${row.count}？`)) void mutate(this, () => this.api.post('/auction/buy', { listingId: row.listingId }), '购买成功');
      } else if (d.auctionCancel) void mutate(this, () => this.api.delete(`/auction/${Number(d.auctionCancel)}`), '已取回寄售物品');
    });
    await this.load();
  };
  AuctionView.prototype.load = async function () {
    const version = this._loadVersion = (this._loadVersion || 0) + 1;
    this._loading = true; paint(this);
    try {
      const [market, mine, items, cardStock] = await Promise.all([this.api.get('/auction'), this.api.get('/auction/mine'), this.api.get('/auction/my-items'), this.api.get('/auction/my-cards')]);
      if (version !== this._loadVersion) return;
      this._market = market.listings ?? []; this._mine = mine.listings ?? []; this._items = items.items ?? []; this._cards = cardStock.cards ?? [];
      notice(this, '');
      return true;
    } catch (error) { if (version === this._loadVersion) notice(this, error.message || '加载失败，请刷新重试', true); }
    finally { if (version === this._loadVersion) { this._loading = false; paint(this); } }
  };
  const previousDestroy = AuctionView.prototype.destroy;
  AuctionView.prototype.destroy = function () { this._loadVersion = (this._loadVersion || 0) + 1; this.root?.removeEventListener('click', this._auctionClick); previousDestroy?.call(this); };
}
