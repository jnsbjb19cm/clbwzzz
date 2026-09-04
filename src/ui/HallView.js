import { authStore } from '../core/AuthStore.js';

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fmtTime(ms) {
  const n = Number(ms) || 0;
  const s = (n / 1000).toFixed(2);
  return `${s}s`;
}

function medal(index) {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `${index + 1}`;
}

export class HallView {
  constructor() {
    this.api = authStore.api;
  }

  async render(root) {
    root.innerHTML = `
      <div style="max-width:1000px;margin:10px auto;padding:16px;color:#fff;">
        <h2 style="margin:0 0 12px;">名人堂</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
          <section style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;">
            <h3 style="margin:0 0 8px;">荣誉值排行</h3>
            <div id="hall-honor"></div>
          </section>
          <section style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;">
            <h3 style="margin:0 0 8px;">关卡最快通关</h3>
            <div id="hall-fastest"></div>
          </section>
          <section style="background:#101d10;border:1px solid #3a5a3a;border-radius:12px;padding:14px;">
            <h3 style="margin:0 0 8px;">冒险进度最大</h3>
            <div id="hall-adventure"></div>
          </section>
        </div>
      </div>`;
    this.root = root;
    this.load();
  }

  async load() {
    const data = await this.api.get('/social/hall-of-fame').catch(() => ({ honor: [], fastest: [], adventure: [] }));
    const honor = data.honor ?? [];
    const fastest = data.fastest ?? [];
    const adventure = data.adventure ?? [];

    this.root.querySelector('#hall-honor').innerHTML = honor.length
      ? honor.map((row, i) => `
        <div style="padding:5px 0;border-bottom:1px solid #223322;display:flex;justify-content:space-between;">
          <span>${medal(i)} ${esc(row.nickname || '玩家')} <small style="color:#888;">Lv.${row.level ?? 1}</small></span>
          <b style="color:#ffd97a;">${row.honor}</b>
        </div>`).join('')
      : '<div style="color:#888;">暂无荣誉数据</div>';

    this.root.querySelector('#hall-fastest').innerHTML = fastest.length
      ? fastest.map((row, i) => `
        <div style="padding:5px 0;border-bottom:1px solid #223322;display:flex;justify-content:space-between;align-items:center;">
          <span>${medal(i)} ${esc(row.stageId)}<br><small style="color:#888;">${esc(row.nickname || '玩家')}</small></span>
          <b style="color:#8bff9b;">${fmtTime(row.bestTimeMs)}</b>
        </div>`).join('')
      : '<div style="color:#888;">暂无通关时间记录</div>';

    this.root.querySelector('#hall-adventure').innerHTML = adventure.length
      ? adventure.map((row, i) => `
        <div style="padding:5px 0;border-bottom:1px solid #223322;display:flex;justify-content:space-between;">
          <span>${medal(i)} ${esc(row.nickname || '玩家')} <small style="color:#888;">Lv.${row.level ?? 1}</small></span>
          <b style="color:#ffd97a;">${row.clearedStages} 关</b>
        </div>`).join('')
      : '<div style="color:#888;">暂无冒险进度数据</div>';
  }
}
