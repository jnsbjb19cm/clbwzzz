import { authStore } from '../core/AuthStore.js';
import { CardDatabase } from '../core/CardDatabase.js';

const db = new CardDatabase();

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cardName(cardId) {
  const card = db?.getById?.(Number(cardId));
  return card?.name || card?.card_name || `卡牌${cardId}`;
}

export class FriendView {
  constructor() {
    this.api = authStore.api;
  }

  async render(root) {
    root.innerHTML = `
      <div class="friend-view" style="max-width:900px;margin:10px auto;padding:16px;color:#fff;font-family:inherit;">
        <h2 style="margin:0 0 12px;">好友</h2>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <input id="friend-search" type="text" placeholder="输入昵称/用户名查找玩家" style="flex:1;padding:8px;border-radius:8px;border:1px solid #7aa75a;background:#1c2a1c;color:#fff;" />
          <button id="friend-search-btn" type="button" style="padding:8px 16px;border-radius:8px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">搜索</button>
        </div>
        <div id="friend-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;"></div>
        <div id="friend-detail" style="margin-top:16px;"></div>
      </div>`;
    this.root = root;
    await this.refresh();
    root.querySelector('#friend-search-btn')?.addEventListener('click', () => this.searchFriend());
    root.querySelector('#friend-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.searchFriend();
    });
  }

  async apiGet(path) {
    return this.api.get(path);
  }

  async refresh() {
    const data = await this.apiGet('/social/friends').catch((e) => ({ ok: false, message: e.message, friends: [] }));
    const requests = await this.apiGet('/social/requests').catch(() => ({ requests: [] }));
    this.friends = data.friends ?? [];
    this.requests = requests.requests ?? [];
    this.renderFriends();
  }

  async renderFriends() {
    const list = this.root?.querySelector('#friend-list');
    if (!list) return;
    const friends = this.friends ?? [];
    const requests = this.requests ?? [];
    const rows = friends.map((f) => `
      <div style="background:#14261a;border:1px solid ${f.online ? '#7aa75a' : '#334d3a'};border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${esc(f.nickname || f.username || '玩家')}</strong>
          <span style="color:${f.online ? '#8bff9b' : '#888'};font-size:12px;">${f.online ? '在线' : '离线'}</span>
        </div>
        <div style="font-size:12px;color:#bbb;">Lv.${f.level ?? 1} · 荣誉 ${f.honor ?? 0}</div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-friend-profile="${f.userId}" style="flex:1;padding:5px;border-radius:6px;border:0;background:#3a5a3a;color:#fff;cursor:pointer;">名片</button>
          <button type="button" data-friend-remove="${f.userId}" style="flex:1;padding:5px;border-radius:6px;border:0;background:#6a3a3a;color:#fff;cursor:pointer;">删除</button>
        </div>
      </div>`).join('');

    const requestRows = requests.map((r) => `
      <div style="background:#241f12;border:1px solid #a58a4a;border-radius:10px;padding:10px;display:flex;justify-content:space-between;align-items:center;">
        <div><strong>${esc(r.nickname || r.username || '玩家')}</strong><span style="color:${r.online ? '#8bff9b' : '#888'};font-size:12px;margin-left:8px;">${r.online ? '在线' : '离线'}</span></div>
        <button type="button" data-friend-accept="${r.requestId}" style="padding:5px 12px;border-radius:6px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">接受</button>
      </div>`).join('');

    list.innerHTML = `
      ${requests.length ? `<div style="grid-column:1/-1;margin-bottom:6px;"><h3 style="margin:0 0 6px;">好友申请</h3>${requestRows}</div>` : ''}
      ${rows || '<div style="grid-column:1/-1;color:#999;">暂无好友，先用上方搜索添加。</div>'}
    `;

    list.querySelectorAll('[data-friend-profile]').forEach((btn) => btn.addEventListener('click', () => this.showProfile(Number(btn.dataset.friendProfile))));
    list.querySelectorAll('[data-friend-remove]').forEach((btn) => btn.addEventListener('click', () => this.removeFriend(Number(btn.dataset.friendRemove))));
    list.querySelectorAll('[data-friend-accept]').forEach((btn) => btn.addEventListener('click', () => this.acceptRequest(Number(btn.dataset.friendAccept))));
  }

  async searchFriend() {
    const input = this.root?.querySelector('#friend-search');
    const q = input?.value.trim();
    if (!q) return;
    const data = await this.apiGet(`/social/search?q=${encodeURIComponent(q)}`).catch((e) => ({ results: [] }));
    const list = this.root?.querySelector('#friend-list');
    if (!list) return;
    const results = data.results ?? [];
    list.innerHTML = results.length
      ? results.map((r) => `
        <div style="background:#14261a;border:1px solid #4a7a3a;border-radius:10px;padding:10px;">
          <div><strong>${esc(r.nickname || r.username || '玩家')}</strong>
            <span style="color:${r.online ? '#8bff9b' : '#888'};font-size:12px;margin-left:6px;">${r.online ? '在线' : '离线'}</span></div>
          <div style="font-size:12px;color:#bbb;">Lv.${r.level ?? 1} · 荣誉 ${r.honor ?? 0}</div>
          <button type="button" data-friend-add="${r.userId}" style="margin-top:6px;padding:5px 12px;border-radius:6px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">加好友</button>
        </div>`).join('')
      : '<div style="grid-column:1/-1;color:#999;">没有找到该玩家。</div>';
    list.querySelectorAll('[data-friend-add]').forEach((btn) => btn.addEventListener('click', () => this.addFriend(Number(btn.dataset.friendAdd))));
  }

  async addFriend(userId) {
    try {
      const res = await this.api.post('/social/friends/request', { userId });
      alert(res.accepted ? '你们已经是好友了' : '好友申请已发送');
      await this.refresh();
    } catch (e) {
      alert(e.message);
    }
  }

  async acceptRequest(requestId) {
    try {
      await this.api.post('/social/friends/accept', { requestId });
      await this.refresh();
    } catch (e) {
      alert(e.message);
    }
  }

  async removeFriend(userId) {
    try {
      await this.api.delete(`/social/friends/${userId}`);
      await this.refresh();
    } catch (e) {
      alert(e.message);
    }
  }

  async showProfile(userId) {
    const detail = this.root?.querySelector('#friend-detail');
    if (!detail) return;
    try {
      const data = await this.apiGet(`/social/players/${userId}`);
      const p = data.profile ?? {};
      const cards = data.cards ?? [];
      detail.innerHTML = `
        <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;">
          <h3 style="margin:0 0 8px;">${esc(p.nickname || p.username || '玩家')} <span style="color:${p.online ? '#8bff9b' : '#888'};font-size:12px;">${p.online ? '在线' : '离线'}</span></h3>
          <p style="margin:4px 0;color:#ccc;">等级 Lv.${p.level ?? 1} · 荣誉 ${p.honor ?? 0} · 竞技 ${p.arena ?? 0}</p>
          <p style="margin:4px 0;color:#ccc;">金币 ${p.gold ?? 0} · 钻石 ${p.diamond ?? 0}</p>
          <div style="margin-top:10px;"><strong>卡牌</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
            ${cards.map((c) => `<span style="background:#1c2a1c;padding:4px 8px;border-radius:6px;">${esc(cardName(c.cardId))}${Number(c.star) > 0 ? ` +${c.star}` : ''}</span>`).join('') || '<span style="color:#888;">对方未开放卡牌查看</span>'}
          </div></div>
        </div>`;
    } catch (e) {
      detail.innerHTML = `<div style="color:#f88;">${esc(e.message)}</div>`;
    }
  }
}
