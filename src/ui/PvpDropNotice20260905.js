import { authStore } from '../core/AuthStore.js';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { App } from './App.js';
import { BagView } from './BagView.js';
import { BattleView } from './BattleView.js';
import { cellCenterX, cellCenterY } from '../battle/BattleConfig.js';

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

function publishLocalSystemDrop(drops, { nickname = authStore.user?.nickname || authStore.user?.username || '玩家', pending = false } = {}) {
  if (!drops.length) return;
  const text = drops.map(({ itemId, count }) => {
    const item = itemDb.getById(itemId);
    return `${item?.name ?? `道具#${itemId}`} ×${count}`;
  }).join('、');
  const data = {
    id: `battle-drop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: 'battle-drop',
    title: '战斗掉落',
    text: `玩家 ${nickname} 获得了 ${text}${pending ? '（本局战利品，结算入包）' : '（非绑定）'}`,
    at: Date.now(),
  };
  window.dispatchEvent(new CustomEvent('clbwz:queue-system-announcement', { detail: data }));
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
      // fetchServerItems already applied the complete authoritative inventory.
      showDropNotice(drops, { addToLocalBag: false });
      return;
    } catch {
      return;
    }
  }
}

function bindLootInteraction(view) {
  view.__lootInteractionCleanup?.();
  const root = view.viewRoot;
  const canvas = root?.querySelector('#battle-canvas');
  if (!canvas) return;
  if (view.__lootInteractionEngine !== view.engine) view.__collectedLootIds = new Set();
  view.__lootInteractionEngine = view.engine;
  const collected = view.__collectedLootIds ??= new Set();
  let active = true;
  const pending = new Set();
  const announced = new Set();
  const receive = ({ drop, roomId } = {}) => {
    if (!active || !drop || (roomId != null && Number(roomId) !== Number(view.pvp?.roomId))) return;
    collected.add(Number(drop.id));
    const local = view.engine?.lootDrops?.find(item => Number(item.id) === Number(drop.id));
    if (local) local.collected = true;
    if (announced.has(Number(drop.id))) return;
    announced.add(Number(drop.id));
    publishLocalSystemDrop([drop], { nickname: drop.recipientNickname, pending: true });
  };
  const unsubscribe = view.pvpSocket?.on?.('pvp:authority:loot-collected', receive);
  const collect = async drop => {
    const id = Number(drop.id);
    if (drop.collected || collected.has(id) || pending.has(id) || view.pvp?.spectator) return;
    if (view.pvp) {
      const userId = Number(view.__pvpLatestSnapshot?.viewerUserId ?? authStore.user?.id);
      if (Number(drop.recipientUserId) !== userId || !view.pvpSocket?.emitAck) return;
      pending.add(id);
      try {
        const response = await view.pvpSocket.emitAck('pvp:authority:collect-loot', { roomId: view.pvp.roomId, dropId: id });
        receive(response);
      } catch { /* 原自动拾取仍会继续，失败不本地发奖。 */ }
      finally { pending.delete(id); }
    } else {
      drop.collected = true;
      collected.add(id);
      publishLocalSystemDrop([drop], { pending: true });
    }
  };
  const hover = event => {
    if (!view.engine || event.buttons || event.target.closest?.('button, input, .result-overlay, .settings-panel')) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const scale = view.renderer?.fieldScale || 1;
    const x = (event.clientX - rect.left) * canvas.width / (rect.width * scale);
    const y = (event.clientY - rect.top) * canvas.height / (rect.height * scale);
    for (const drop of view.engine.lootDrops ?? []) {
      const age = view.engine.time - Number(drop.createdAt || 0);
      if (age < 0 || age > 3.2) continue;
      const cx = cellCenterX(drop.col);
      const cy = cellCenterY(drop.lane) - 18 - Math.sin(age * 5.5) * 5 - Math.min(13, age * 5);
      if (Math.abs(x - cx) <= 30 && Math.abs(y - cy) <= 30) void collect(drop);
    }
  };
  root.addEventListener('pointermove', hover, { passive: true });
  // 本地冒险保留 3.2 秒自动收取；联网掉落由服务器自动收取并广播。
  const timer = view.pvp ? null : setInterval(() => {
    for (const drop of view.engine?.lootDrops ?? []) {
      if (view.engine.time - drop.createdAt >= 3.2 || view.engine.status !== 'playing') void collect(drop);
    }
  }, 150);
  view.__lootInteractionCleanup = () => {
    active = false;
    root.removeEventListener('pointermove', hover);
    clearInterval(timer);
    unsubscribe?.();
  };
}

function bindPvpDropNotice(view) {
  if (!view?.pvp || view.pvp.spectator || view.__pvpDropNoticeBound || !view.pvpSocket?.on) return;
  view.__pvpDropNoticeBound = true;
  void fetchServerItems().then(({ counts }) => {
    view.__pvpDropBaseline = counts;
  }).catch(() => {});
  let resultHandled = false;
  view.__pvpDropNoticeUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
    if (resultHandled) return;
    if (snapshot?.battleReport) {
      if (snapshot.battleReport.status !== 'settled') return;
      resultHandled = true;
      const row = snapshot.battleReport.rows.find(row => Number(row.userId) === Number(snapshot.viewerUserId));
      void fetchServerItems().catch(() => {});
      if (row?.items?.length) showDropNotice(row.items, { addToLocalBag: false });
      return;
    }
    resultHandled = true;
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
    bindLootInteraction(this);
    if (this.pvp) bindPvpDropNotice(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyDropNoticeBridge(...args) {
    this.__lootInteractionCleanup?.();
    this.__lootInteractionCleanup = null;
    this.__collectedLootIds = null;
    try { this.__pvpDropNoticeUnsub?.(); } catch {}
    this.__pvpDropNoticeUnsub = null;
    this.__pvpDropNoticeBound = false;
    return previousDestroy.apply(this, args);
  };
}

install();
