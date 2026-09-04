import { authStore } from '../core/AuthStore.js';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { getCraftMaterialImage } from './SmithyMaterialArtwork.js';

const itemDb = new ItemDatabase();

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class GuildView {
  constructor() {
    this.api = authStore.api;
  }

  async render(root) {
    root.innerHTML = `
      <div style="max-width:1100px;margin:10px auto;padding:16px;color:#fff;">
        <h2 style="margin:0 0 12px;">公会</h2>
        <div id="guild-main"></div>
      </div>`;
    this.root = root;
    await this.load();
  }

  async load() {
    const data = await this.api.get('/guild/my').catch(() => ({ guild: null }));
    if (!data.guild) return this.renderNoGuild();
    this.renderGuild(data.guild);
  }

  async renderNoGuild() {
    const el = this.root.querySelector('#guild-main');
    const listData = await this.api.get('/guild/list').catch(() => ({ guilds: [] }));
    const guilds = listData.guilds ?? [];
    el.innerHTML = `
      <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;max-width:520px;margin-bottom:12px;">
        <p style="margin:0 0 10px;color:#ccc;">你还没有加入公会</p>
        <div style="display:flex;gap:8px;">
          <input id="guild-name" type="text" placeholder="公会名(2-16字)" style="flex:1;padding:8px;border-radius:8px;border:1px solid #7aa75a;background:#1c2a1c;color:#fff;" />
          <button id="guild-create" type="button" style="padding:8px 14px;border-radius:8px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">创建公会</button>
        </div>
        <p style="margin:10px 0 4px;font-size:13px;color:#888;">创建后你就是会长，公会等级1默认合成/强化概率+3%。</p>
      </div>
      <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;max-width:760px;">
        <h4 style="margin:0 0 8px;">加入已有公会</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
          ${guilds.map((g) => `
            <div style="background:#1c2a1c;border:1px solid #3a5a3a;border-radius:8px;padding:8px;">
              <div style="font-weight:700;">${esc(g.name)} <small style="color:#888;">Lv.${g.level}</small></div>
              <div style="font-size:12px;color:#aaa;">成员 ${g.memberCount ?? 0}</div>
              <button type="button" data-join-guild="${g.guildId}" style="margin-top:6px;padding:5px 10px;border-radius:6px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">加入</button>
            </div>`).join('') || '<div style="color:#888;">暂时没有公会可加入</div>'}
        </div>
      </div>`;

    el.querySelector('#guild-create').addEventListener('click', async () => {
      const name = el.querySelector('#guild-name').value.trim();
      try {
        await this.api.post('/guild/create', { name });
        this.load();
      } catch (e) { alert(e.message); }
    });
    el.querySelectorAll('[data-join-guild]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await this.api.post('/guild/join', { guildId: Number(btn.dataset.joinGuild) });
        alert('加入公会成功');
        this.load();
      } catch (e) { alert(e.message); }
    }));
  }

  renderGuild(g) {
    const el = this.root.querySelector('#guild-main');
    const bonus = Math.round((g.craftStrengthBonus ?? 0) * 100);
    el.innerHTML = `
      <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">${esc(g.guildName)} <small style="color:#888;">Lv.${g.level}</small></h3>
          <span style="color:#8bff9b;">合成/强化概率+${bonus}%</span>
        </div>
        <p style="color:#bbb;">你的职位：${ROLE_LABEL[g.role] || g.role}</p>
        <button id="guild-members-btn" type="button" style="padding:6px 12px;border-radius:6px;border:0;background:#3a5a3a;color:#fff;cursor:pointer;">成员</button>
        <button id="guild-warehouse-btn" type="button" style="padding:6px 12px;border-radius:6px;border:0;background:#3a5a3a;color:#fff;cursor:pointer;">仓库</button>
        ${['president', 'vice_president'].includes(g.role) ? `<button id="guild-approve-btn" type="button" style="padding:6px 12px;border-radius:6px;border:0;background:#5a4a8a;color:#fff;cursor:pointer;">审批</button>` : ''}
        ${g.role === 'president' && g.level < 5 ? `<button id="guild-upgrade-btn" type="button" style="padding:6px 12px;border-radius:6px;border:0;background:#6a5a2a;color:#fff;cursor:pointer;">升级公会</button>` : ''}
        <button id="guild-leave-btn" type="button" style="padding:6px 12px;border-radius:6px;border:0;background:#6a3a3a;color:#fff;cursor:pointer;">退出公会</button>
      </div>
      <div id="guild-detail"></div>`;

    el.querySelector('#guild-members-btn').addEventListener('click', () => this.showMembers(g.guildId));
    el.querySelector('#guild-upgrade-btn')?.addEventListener('click', async () => {
      try {
        const res = await this.api.post('/guild/upgrade', {});
        alert(`公会升级成功，当前 Lv.${res.level}`);
        this.load();
      } catch (e) { alert(e.message); }
    });
    el.querySelector('#guild-warehouse-btn').addEventListener('click', () => this.showWarehouse(g.guildId));
    el.querySelector('#guild-approve-btn')?.addEventListener('click', () => this.showJoinRequests(g.guildId));
    el.querySelector('#guild-leave-btn').addEventListener('click', async () => {
      if (!confirm('确定退出公会？')) return;
      const res = await this.api.post('/guild/leave', {}).catch((e) => { alert(e.message); return null; });
      if (res) this.load();
    });
  }

  async showMembers(guildId) {
    const data = await this.api.get(`/guild/${guildId}/members`).catch(() => ({ members: [] }));
    const el = this.root.querySelector('#guild-detail');
    el.innerHTML = `
      <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;">
        <h4 style="margin:0 0 8px;">公会成员</h4>
        ${data.members.map((m) => `
          <div style="padding:5px 0;border-bottom:1px solid #223322;display:flex;justify-content:space-between;">
            <span>${esc(m.nickname || '玩家')} <small style="color:#888;">${esc(m.roleLabel)}</small>
            <span style="color:${m.online ? '#8bff9b' : '#888'};font-size:12px;">${m.online ? '在线' : '离线'}</span></span>
            <span style="color:#bbb;">Lv.${m.level} · ${m.honor}荣誉</span>
          </div>`).join('')}
      </div>`;
  }

  async showJoinRequests(guildId) {
    const data = await this.api.get(`/guild/${guildId}/requests`).catch(() => ({ requests: [] }));
    const el = this.root.querySelector('#guild-detail');
    el.innerHTML = `
      <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;">
        <h4 style="margin:0 0 8px;">入会申请审批</h4>
        ${(data.requests ?? []).map((r) => `
          <div style="padding:6px 0;border-bottom:1px solid #223322;display:flex;justify-content:space-between;align-items:center;">
            <span>${esc(r.nickname || '玩家')} <small style="color:#888;">Lv.${r.level} · 荣誉${r.honor}</small></span>
            <span>
              <button type="button" data-guild-approve="${r.userId}" style="padding:4px 10px;border-radius:6px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">同意</button>
              <button type="button" data-guild-reject="${r.userId}" style="padding:4px 10px;border-radius:6px;border:0;background:#6a3a3a;color:#fff;cursor:pointer;">拒绝</button>
            </span>
          </div>`).join('') || '<div style="color:#888;">暂无待审批申请</div>'}
      </div>`;
    el.querySelectorAll('[data-guild-approve]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await this.api.post(`/guild/${guildId}/approve`, { userId: Number(btn.dataset.guildApprove), approve: true });
        this.showJoinRequests(guildId);
      } catch (e) { alert(e.message); }
    }));
    el.querySelectorAll('[data-guild-reject]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await this.api.post(`/guild/${guildId}/approve`, { userId: Number(btn.dataset.guildReject), approve: false });
        this.showJoinRequests(guildId);
      } catch (e) { alert(e.message); }
    }));
  }

  async showWarehouse(guildId) {
    const data = await this.api.get(`/guild/${guildId}/warehouse`).catch(() => ({ items: [] }));
    const el = this.root.querySelector('#guild-detail');
    el.innerHTML = `
      <div style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;">
        <h4 style="margin:0 0 8px;">公会仓库</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <input id="gh-item" type="number" min="1" placeholder="道具ID" style="width:110px;padding:6px;border-radius:6px;border:1px solid #7aa75a;background:#1c2a1c;color:#fff;" />
          <input id="gh-count" type="number" min="1" value="1" placeholder="数量" style="width:90px;padding:6px;border-radius:6px;border:1px solid #7aa75a;background:#1c2a1c;color:#fff;" />
          <button id="gh-deposit" type="button" style="padding:6px 12px;border-radius:6px;border:0;background:#4a7a3a;color:#fff;cursor:pointer;">存入仓库</button>
          <button id="gh-withdraw" type="button" style="padding:6px 12px;border-radius:6px;border:0;background:#6a5a2a;color:#fff;cursor:pointer;">取出仓库</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:320px;overflow-y:auto;">
          ${data.items.map((it) => `
            <div style="background:#1c2a1c;border:1px solid #3a5a3a;border-radius:8px;padding:6px;text-align:center;">
              ${itemIcon(it.itemId)}<div style="font-size:11px;margin-top:4px;">${esc(itemName(it.itemId))}</div>
              <div style="font-size:12px;color:#ffd97a;">×${it.count}</div>
            </div>`).join('') || '<div style="grid-column:1/-1;color:#888;">仓库为空</div>'}
        </div>
      </div>`;

    el.querySelector('#gh-deposit')?.addEventListener('click', async () => {
      const itemId = Number(el.querySelector('#gh-item').value);
      const count = Number(el.querySelector('#gh-count').value) || 1;
      try {
        await this.api.post(`/guild/${guildId}/warehouse/deposit`, { itemId, count });
        alert('已存入仓库');
        this.showWarehouse(guildId);
      } catch (e) { alert(e.message); }
    });
    el.querySelector('#gh-withdraw')?.addEventListener('click', async () => {
      const itemId = Number(el.querySelector('#gh-item').value);
      const count = Number(el.querySelector('#gh-count').value) || 1;
      try {
        await this.api.post(`/guild/${guildId}/warehouse/withdraw`, { itemId, count });
        alert('已从仓库取出');
        this.showWarehouse(guildId);
      } catch (e) { alert(e.message); }
    });
  }
}

const ROLE_LABEL = {
  president: '会长',
  vice_president: '副会长',
  elite: '长老',
  member: '会员',
};
