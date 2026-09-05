import { authStore } from '../core/AuthStore.js';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { App } from './App.js';
import { BagView } from './BagView.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpDropNotice20260905');
const APP_FLAG = Symbol.for('clbwzzz.pveDropNotice20260905');
const itemDb = new ItemDatabase();

function itemCounts(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = Number(row?.itemId);
    const count = Math.max(0, Number(row?.count) || 0);
    if (id > 0 && count > 0) map.set(id, (map.get(id) ?? 0) + count);
  }
  return map;
}

function diffCounts(before, after) {
  const result = [];
  for (const [itemId, count] of after) {
    const delta = Math.max(0, count - (before.get(itemId) ?? 0));
    if (delta > 0) result.push({ itemId, count: delta });
  }
  return result;
}

function iconHtml(itemId) {
  const item = itemDb.getById(itemId);
  if (!item) return '<span class="battle-drop-fallback">物</span>';
  try {
    return BagView.prototype.itemIcon.call({}, item);
  } catch {
    return '<span class="battle-drop-fallback">物</span>';
  }
}

function publishLocalSystemDrop(drops) {
  if (!drops.length) return;
  const text = drops.map(({ itemId, count }) => {
    const item = itemDb.getById(itemId);
    return `${item?.name ?? `道具#${itemId}`} ×${count}`;
  }).join('、');
  const data = {
    id: `battle-drop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: 'battle-drop',
    title: '战斗掉落',
    text: `获得 ${text}（非绑定）`,
    at: Date.now(),
  };
  globalThis.__clbwzLastSystemAnnouncement = data;

  for (const root of document.querySelectorAll('.classic-system-broadcast')) {
    root.dataset.systemKind = 'battle-drop';
    root.classList.remove('is-idle');
    const label = root.querySelector('.classic-broadcast-label');
    if (label) label.textContent = '📣 战斗掉落';
    const track = root.querySelector('.classic-broadcast-track');
    if (track) {
      track.replaceChildren();
      const first = document.createElement('b');
      first.className = 'classic-broadcast-item';
      first.textContent = data.text;
      const dot = document.createElement('i');
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = '◆';
      track.append(first, dot, first.cloneNode(true));
    }
  }

  for (const log of document.querySelectorAll('[data-classic-chat-log]')) {
    const line = document.createElement('p');
    line.className = 'is-system';
    line.textContent = `[系统] 战斗掉落：${data.text}`;
    log.append(line);
    log.scrollTop = log.scrollHeight;
  }
  window.dispatchEvent(new CustomEvent('clbwz:system-announcement', { detail: data }));
}

function ensureNoticeStyle() {
  if (document.getElementById('battle-drop-notice-style')) return;
  const style = document.createElement('style');
  style.id = 'battle-drop-notice-style';
  style.textContent = `
    .battle-drop-notice{position:fixed;left:50%;top:148px;z-index:24000;transform:translateX(-50%);min-width:320px;max-width:min(720px,90vw);padding:10px 14px;border:2px solid #d9bd55;border-radius:12px;background:rgba(11,46,34,.95);box-shadow:0 8px 28px rgba(0,0,0,.38);color:#f7f3cf;pointer-events:none;animation:battle-drop-in .22s ease-out}
    .battle-drop-notice__title{font-weight:900;color:#ffe66e;margin-bottom:7px;text-align:center}
    .battle-drop-notice__items{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
    .battle-drop-notice__item{display:flex;align-items:center;gap:7px;min-width:126px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.07)}
    .battle-drop-notice__icon{position:relative;width:42px;height:42px;display:grid;place-items:center;overflow:hidden;flex:0 0 42px}
    .battle-drop-notice__icon .bag-item-material img{max-width:38px;max-height:38px;object-fit:contain}
    .battle-drop-notice__icon .bag-item-atlas{transform:scale(.62);transform-origin:center}
    .battle-drop-notice__name{font-size:12px;line-height:1.3}.battle-drop-notice__name b{display:block;color:#fff}.battle-drop-notice__name small{color:#a8e1b5}
    .battle-drop-fallback{display:grid;place-items:center;width:34px;height:34px;border-radius:6px;background:#5e7640;color:#fff;font-weight:900}
    @keyframes battle-drop-in{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}
  `;
  document.head.append(style);
}

function showDropNotice(drops, { addToLocalBag = false } = {}) {
  if (!Array.isArray(drops) || !drops.length) return;
  const normalized = drops
    .map((drop) => ({
      itemId: Number(drop?.itemId),
      count: Math.max(1, Math.floor(Number(drop?.count) || 1)),
    }))
    .filter((drop) => drop.itemId > 0 && itemDb.getById(drop.itemId));
  if (!normalized.length) return;

  const app = globalThis.__clbwzAppInstance;
  if (addToLocalBag && app?.inventory?.addItem) {
    for (const drop of normalized) {
      app.inventory.addItem(drop.itemId, drop.count, { isBound: false });
    }
  }

  ensureNoticeStyle();
  document.querySelector('.battle-drop-notice')?.remove();
  const notice = document.createElement('section');
  notice.className = 'battle-drop-notice';
  notice.innerHTML = `
    <div class="battle-drop-notice__title">🎁 战斗掉落 · 非绑定物品</div>
    <div class="battle-drop-notice__items">
      ${normalized.map(({ itemId, count }) => {
        const item = itemDb.getById(itemId);
        return `<div class="battle-drop-notice__item">
          <div class="battle-drop-notice__icon">${iconHtml(itemId)}</div>
          <div class="battle-drop-notice__name"><b>${item?.name ?? `道具#${itemId}`}</b><small>×${count} · 可交易</small></div>
        </div>`;
      }).join('')}
    </div>`;
  document.body.append(notice);
  setTimeout(() => notice.remove(), 6500);
  publishLocalSystemDrop(normalized);
}

async function fetchServerItems() {
  const snapshot = await authStore.api.get('/player/snapshot');
  authStore.snapshot = snapshot;
  return { snapshot, counts: itemCounts(snapshot?.items) };
}

async function detectAuthorityDrops(view) {
  if (!view?.pvp || view.pvp.spectator) return;
  const before = view.__pvpDropBaseline ?? itemCounts(authStore.snapshot?.items);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 220));
    try {
      const { counts } = await fetchServerItems();
      const drops = diffCounts(before, counts);
      if (!drops.length) continue;
      view.__pvpDropBaseline = counts;
      showDropNotice(drops, { addToLocalBag: true });
      return;
    } catch {
      return;
    }
  }
}

function bindPvpDropNotice(view) {
  if (!view?.pvp || view.pvp.spectator || view.__pvpDropNoticeBound || !view.pvpSocket?.on) return;
  view.__pvpDropNoticeBound = true;
  void fetchServerItems().then(({ counts }) => {
    view.__pvpDropBaseline = counts;
  }).catch(() => {});
  view.__pvpDropNoticeUnsub = view.pvpSocket.on('pvp:authority:finished', () => {
    // 服务端先异步写入非绑定掉落，再广播 finished；稍后轮询快照直到能看到新增数量。
    setTimeout(() => void detectAuthorityDrops(view), 120);
  });
}

function install() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousBootstrap = App.prototype.bootstrap;
  App.prototype.bootstrap = function bootstrapWithDropInventoryBridge(...args) {
    globalThis.__clbwzAppInstance = this;
    return previousBootstrap.apply(this, args);
  };

  const previousHandleBattleResult = App.prototype.handleBattleResult;
  App.prototype.handleBattleResult = function handlePveResultWithDropNotice(payload = {}) {
    const result = previousHandleBattleResult.call(this, payload);
    if (Array.isArray(payload?.drops) && payload.drops.length) {
      showDropNotice(payload.drops, { addToLocalBag: false });
    }
    return result;
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithAuthorityDropNotice(...args) {
    const result = await previousRenderBattle.apply(this, args);
    if (this.pvp) bindPvpDropNotice(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyDropNoticeBridge(...args) {
    try { this.__pvpDropNoticeUnsub?.(); } catch {}
    this.__pvpDropNoticeUnsub = null;
    this.__pvpDropNoticeBound = false;
    return previousDestroy.apply(this, args);
  };
}

install();
