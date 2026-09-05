import { authStore } from '../core/AuthStore.js';
import { SocketClient } from '../network/SocketClient.js';
import { StarUpgradeSystem } from '../systems/StarUpgradeSystem.js';
import { App } from './App.js';
import './SystemAnnouncementClient.css';

const PATCH_FLAG = Symbol.for('clbwzzz.systemAnnouncementClient20260905');
let socketClient = null;
let unsubscribe = null;
let bannerTimer = null;
const queue = [];

function socket() {
  if (!socketClient) socketClient = new SocketClient({ getToken: () => authStore.token });
  return socketClient;
}

function disconnectAnnouncements() {
  try { unsubscribe?.(); } catch {}
  unsubscribe = null;
  try { socketClient?.disconnect?.(); } catch {}
  socketClient = null;
  queue.length = 0;
  if (bannerTimer) window.clearTimeout(bannerTimer);
  bannerTimer = null;
  document.querySelector('#system-announcement-feed')?.remove();
}

function ensureBanner() {
  let root = document.querySelector('#system-announcement-feed');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'system-announcement-feed';
  root.className = 'system-announcement-feed hidden';
  root.innerHTML = `
    <div class="system-announcement-emblem">✦</div>
    <div class="system-announcement-copy">
      <strong></strong>
      <span></span>
    </div>`;
  document.body.append(root);
  return root;
}

function showNext() {
  if (bannerTimer) return;
  const data = queue.shift();
  if (!data) return;
  const root = ensureBanner();
  root.dataset.kind = String(data.kind || 'system');
  root.querySelector('strong').textContent = data.title || '系统播报';
  root.querySelector('span').textContent = data.text || '';
  root.classList.remove('hidden', 'show');
  void root.offsetWidth;
  root.classList.add('show');
  bannerTimer = window.setTimeout(() => {
    root.classList.remove('show');
    window.setTimeout(() => {
      root.classList.add('hidden');
      bannerTimer = null;
      showNext();
    }, 260);
  }, 5200);
}

function enqueue(data) {
  if (!data?.text) return;
  queue.push(data);
  if (queue.length > 12) queue.splice(0, queue.length - 12);
  showNext();
}

function connectAnnouncements() {
  if (!authStore.isLoggedIn() || !authStore.token || unsubscribe) return;
  unsubscribe = socket().on('system:announcement', enqueue);
}

function announceStrengthen({ cardId, cardName, star }) {
  if (!authStore.isLoggedIn() || Number(star) < 6) return;
  socket().emitAck('system:announce:strengthen', {
    cardId: Number(cardId) || null,
    cardName: String(cardName || '').slice(0, 32),
    star: Number(star) || 0,
  }).catch(() => {});
}

function reportPvpResult(won) {
  if (!authStore.isLoggedIn()) return;
  socket().emitAck('pvp:result-report', { won: Boolean(won) }).catch(() => {});
}

export function installSystemAnnouncementClient() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousMount = App.prototype.mount;
  App.prototype.mount = function mountWithAnnouncementAccountGuard(...args) {
    if (!authStore.isLoggedIn()) disconnectAnnouncements();
    return previousMount.apply(this, args);
  };

  const previousBootstrap = App.prototype.bootstrap;
  App.prototype.bootstrap = function bootstrapWithAnnouncements(...args) {
    const result = previousBootstrap.apply(this, args);
    connectAnnouncements();
    return result;
  };

  const previousBattleResult = App.prototype.handleBattleResult;
  App.prototype.handleBattleResult = function handleBattleResultWithStreak(payload = {}) {
    const result = previousBattleResult.call(this, payload);
    if (String(payload?.mode || '').toLowerCase() === 'pvp') {
      reportPvpResult(Boolean(payload?.won));
    }
    return result;
  };

  const previousUpgrade = StarUpgradeSystem.prototype.upgrade;
  StarUpgradeSystem.prototype.upgrade = function upgradeWithWorldAnnouncement(
    mainIndex,
    subIndices,
    options = {},
  ) {
    const before = this.cardInventory?.getSlots?.()?.[mainIndex];
    const cardId = Number(before?.cardId) || 0;
    const card = this.db?.getById?.(cardId);
    const cardName = card?.name ?? card?.card_name ?? `卡牌#${cardId}`;
    const result = previousUpgrade.call(this, mainIndex, subIndices, options);
    if (result?.ok && result?.success && Number(result.star) >= 6) {
      announceStrengthen({ cardId, cardName, star: Number(result.star) });
    }
    return result;
  };
}
