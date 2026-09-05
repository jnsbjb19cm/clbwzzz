import { AuctionView } from './AuctionView.js';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { getCraftMaterialImage } from './SmithyMaterialArtwork.js';
import './EconomyGridUi.css';

const PATCH_FLAG = Symbol.for('clbwzzz.auctionGrid20260905');
const itemDb = new ItemDatabase();

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function itemName(id) { return itemDb.getById(Number(id))?.name ?? `道具#${id}`; }
function iconMarkup(id, size = 48) {
  const src = getCraftMaterialImage(Number(id));
  if (src) return `<img src="${src}" alt="" style="width:${size}px;height:${size}px" draggable="false">`;
  return `<span class="fallback-icon" style="width:${size}px;height:${size}px">${Number(id) || '?'}</span>`;
}
function bagSlots(items) {
  if (!items?.length) return '<div class="economy-empty">暂无可上架的非绑定物品</div>';
  return items.map((it) => `
    <button type="button" class="economy-item-slot" data-auction-item="${Number(it.itemId)}" data-count="${Number(it.count) || 0}">
      ${iconMarkup(it.itemId)}
      <span class="name">${esc(itemName(it.itemId))}</span>
      <span class="count">×${Number(it.count) || 0}</span>
    </button>`).join('');
}

export function installAuctionGridPatch() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  AuctionView.prototype.render = async function renderGridAuction(root) {
    this.root = root;
    this._gridSelected = null;
    root.innerHTML = `
      <section class="economy-grid-shell auction-grid-shell">
        <h2 class="economy-grid-title">拍卖行</h2>
        <div class="economy-grid-workbench">
          <div class="economy-grid-panel">
            <h3>我的背包 <span class="muted">仅显示可交易的非绑定物品</span></h3>
            <div id="auction-grid-bag" class="economy-item-grid"></div>
          </div>
          <div class="economy-grid-panel">
            <h3>待上架物品</h3>
            <div id="auction-grid-target" class="economy-transfer-card">
              <div class="empty">从左侧背包点击一个物品，放到这里设置数量与价格。</div>
            </div>
          </div>
        </div>
        <div class="economy-grid-panel" style="margin-bottom:14px">
          <h3>正在拍卖</h3>
          <div id="auction-grid-market" class="economy-market-grid"></div>
        </div>
        <div class="economy-grid-panel">
          <h3>我的上架</h3>
          <div id="auction-grid-mine" class="economy-market-grid"></div>
        </div>
      </section>`;
    await this.load();
  };

  AuctionView.prototype.load = async function loadGridAuction() {
    const [market, mine, myItems] = await Promise.all([
      this.api.get('/auction').catch(() => ({ listings: [] })),
      this.api.get('/auction/mine').catch(() => ({ listings: [] })),
      this.api.get('/auction/my-items').catch(() => ({ items: [] })),
    ]);
    const bag = this.root.querySelector('#auction-grid-bag');
    const marketEl = this.root.querySelector('#auction-grid-market');
    const mineEl = this.root.querySelector('#auction-grid-mine');
    if (!bag || !marketEl || !mineEl) return;

    bag.innerHTML = bagSlots(myItems.items ?? []);
    marketEl.innerHTML = (market.listings ?? []).map((a) => `
      <article class="economy-market-card">
        <div class="head">${iconMarkup(a.itemId, 42)}<div><strong>${esc(itemName(a.itemId))}</strong><br><small>×${Number(a.count) || 1}</small></div></div>
        <div class="price">${Number(a.price) || 0} 金币</div>
        <small>${esc(a.sellerName || '玩家')} · Lv.${Number(a.sellerLevel) || 1}${a.sellerOnline ? ' · 在线' : ''}</small>
        <button type="button" data-auction-buy="${Number(a.listingId)}">购买</button>
      </article>`).join('') || '<div class="economy-empty">暂无拍卖品</div>';

    mineEl.innerHTML = (mine.listings ?? []).map((a) => `
      <article class="economy-market-card">
        <div class="head">${iconMarkup(a.itemId, 42)}<div><strong>${esc(itemName(a.itemId))}</strong><br><small>×${Number(a.count) || 1}</small></div></div>
        <div class="price">${Number(a.price) || 0} 金币</div>
        <small>状态：${esc(a.status || '')}</small>
        ${a.status === 'active' ? `<button type="button" data-auction-cancel="${Number(a.listingId)}" style="background:#764239">取消上架</button>` : ''}
      </article>`).join('') || '<div class="economy-empty">你还没有上架物品</div>';

    const renderTarget = () => {
      const target = this.root.querySelector('#auction-grid-target');
      if (!target) return;
      this.root.querySelectorAll('[data-auction-item]').forEach((slot) => {
        slot.classList.toggle('selected', Number(slot.dataset.auctionItem) === Number(this._gridSelected?.itemId));
      });
      if (!this._gridSelected) {
        target.innerHTML = '<div class="empty">从左侧背包点击一个物品，放到这里设置数量与价格。</div>';
        return;
      }
      const s = this._gridSelected;
      target.innerHTML = `
        ${iconMarkup(s.itemId, 72)}
        <strong>${esc(itemName(s.itemId))}</strong>
        <span class="muted">背包可用 ×${s.maxCount}</span>
        <div class="economy-transfer-form">
          <label>上架数量<input id="auction-grid-count" type="number" min="1" max="${s.maxCount}" value="1"></label>
          <label>总价金币<input id="auction-grid-price" type="number" min="1" value="100"></label>
        </div>
        <div class="economy-transfer-actions">
          <button type="button" id="auction-grid-post">确认上架</button>
          <button type="button" class="alt" id="auction-grid-all">全部数量</button>
        </div>`;
      target.querySelector('#auction-grid-all')?.addEventListener('click', () => {
        const input = target.querySelector('#auction-grid-count');
        if (input) input.value = String(s.maxCount);
      });
      target.querySelector('#auction-grid-post')?.addEventListener('click', async () => {
        const count = Math.max(1, Math.min(s.maxCount, Number(target.querySelector('#auction-grid-count')?.value) || 1));
        const price = Math.max(1, Math.floor(Number(target.querySelector('#auction-grid-price')?.value) || 0));
        try {
          await this.api.post('/auction', { itemId: s.itemId, count, price });
          this._gridSelected = null;
          await this.load();
        } catch (error) { alert(error.message || '上架失败'); }
      });
    };

    bag.querySelectorAll('[data-auction-item]').forEach((slot) => {
      slot.addEventListener('click', () => {
        this._gridSelected = {
          itemId: Number(slot.dataset.auctionItem),
          maxCount: Math.max(1, Number(slot.dataset.count) || 1),
        };
        renderTarget();
      });
    });
    marketEl.querySelectorAll('[data-auction-buy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await this.api.post('/auction/buy', { listingId: Number(btn.dataset.auctionBuy) });
          await this.load();
        } catch (error) { alert(error.message || '购买失败'); }
      });
    });
    mineEl.querySelectorAll('[data-auction-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await this.api.delete(`/auction/${Number(btn.dataset.auctionCancel)}`);
          await this.load();
        } catch (error) { alert(error.message || '取消失败'); }
      });
    });
    renderTarget();
  };
}
