import { authStore } from '../core/AuthStore.js';
import { ItemDatabase } from '../core/ItemDatabase.js';

const itemDb = new ItemDatabase();

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function itemName(id) {
  return itemDb?.getById?.(Number(id))?.name || `道具#${id}`;
}

export class AuctionView {
  constructor() {
    this.api = authStore.api;
  }

  async render(root) {
    root.innerHTML = `
      <div style="max-width:1000px;margin:10px auto;padding:16px;color:#fff;">
        <h2 style="margin:0 0 12px;">拍卖行</h2>
        <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <input id="auction-item" type="number" min="1" placeholder="道具ID" style="width:120px;padding:8px;border-radius:8px;border:1px solid #7aa75a;background:#1c2a1c;color:#fff;" />
          <input id="auction-count" type="number" min="1" value="1" placeholder="数量" style="width:100px;padding:8px;border-radius:8px;border:1px solid #7aa75a;background:#1c2a1c;color:#fff;" />
          <input id="auction-price" type="number" min="1" placeholder="总价金币" style="width:140px;padding:8px;border-radius:8px;border:1px solid #7aa75a;background:#1c2a1c;color:#fff;" />
          <button id="auction-post" type="button" style="padding:8px 16px;border-radius:8px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">上架</button>
        </div>
        <div id="auction-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;"></div>
        <div id="auction-my" style="margin-top:16px;"></div>
      </div>`;
    this.root = root;
    await this.load();
    root.querySelector('#auction-post').addEventListener('click', () => this.post());
  }

  async load() {
    const data = await this.api.get('/auction').catch(() => ({ listings: [] }));
    const my = await this.api.get('/auction/mine').catch(() => ({ listings: [] }));
    const list = this.root.querySelector('#auction-list');
    const myEl = this.root.querySelector('#auction-my');
    list.innerHTML = (data.listings ?? []).map((a) => `
      <div style="background:#14261a;border:1px solid #4a7a3a;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;">
        <div><strong>${esc(itemName(a.itemId))}</strong> ×${a.count}</div>
        <div style="font-size:12px;color:#bbb;">${esc(a.sellerName || '玩家')} · Lv.${a.sellerLevel ?? 1}</div>
        <div style="font-size:14px;color:#ffd97a;">${a.price} 金币</div>
        <button type="button" data-buy="${a.listingId}" style="padding:5px;border-radius:6px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">购买</button>
      </div>`).join('') || '<div style="grid-column:1/-1;color:#999;">暂无拍卖品</div>';
    myEl.innerHTML = `
      <h3 style="margin:0 0 6px;">我的上架</h3>
      ${(my.listings ?? []).map((a) => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #223322;">
          <span>${esc(itemName(a.itemId))} ×${a.count} · ${a.price}金币 <small style="color:#888;">${a.status}</small></span>
          ${a.status === 'active' ? `<button type="button" data-cancel="${a.listingId}" style="padding:3px 8px;border-radius:6px;border:0;background:#6a3a3a;color:#fff;cursor:pointer;">取消</button>` : ''}
        </div>`).join('') || '<div style="color:#888;">你没有上架物品</div>'}`;
    list.querySelectorAll('[data-buy]').forEach((btn) => btn.addEventListener('click', () => this.buy(Number(btn.dataset.buy))));
    myEl.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', () => this.cancel(Number(btn.dataset.cancel))));
  }

  async post() {
    const itemId = Number(this.root.querySelector('#auction-item').value);
    const count = Number(this.root.querySelector('#auction-count').value);
    const price = Number(this.root.querySelector('#auction-price').value);
    if (!itemId || !price) return alert('请填写道具ID和价格');
    try {
      await this.api.post('/auction', { itemId, count: count || 1, price });
      alert('上架成功');
      await this.load();
    } catch (e) { alert(e.message); }
  }

  async buy(listingId) {
    try {
      await this.api.post('/auction/buy', { listingId });
      alert('购买成功');
      await this.load();
    } catch (e) { alert(e.message); }
  }

  async cancel(listingId) {
    try {
      await this.api.delete(`/auction/${listingId}`);
      await this.load();
    } catch (e) { alert(e.message); }
  }
}
