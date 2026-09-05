import './LobbyChatPatch20260905.js';
import { authStore } from '../core/AuthStore.js';
import { SocketClient } from '../network/SocketClient.js';
import { StarUpgradeSystem } from '../systems/StarUpgradeSystem.js';
import { CardCraftSystem } from '../systems/CardCraftSystem.js';
import { App } from './App.js';

const PATCH_FLAG = Symbol.for('clbwzzz.systemAnnouncementClient20260905');
let socketClient = null;
let unsubscribe = null;
let expiryTimer = null;
let welcomedUserId = null;

function socket() {
  if (!socketClient) socketClient = new SocketClient({ getToken: () => authStore.token });
  return socketClient;
}

function currentAnnouncement() {
  return globalThis.__clbwzLastSystemAnnouncement ?? null;
}

function clearCurrentAnnouncement(expectedId = null) {
  const current = currentAnnouncement();
  if (expectedId && current?.id !== expectedId) return;
  globalThis.__clbwzLastSystemAnnouncement = null;
  applyAnnouncementToClassicBars();
  window.dispatchEvent(new CustomEvent('clbwz:system-announcement', {
    detail: { clear: true, id: expectedId || current?.id || null },
  }));
}

function setTrackText(track, text) {
  if (!track) return;
  track.replaceChildren();
  const first = document.createElement('b');
  first.className = 'classic-broadcast-item';
  first.textContent = text;
  const dot = document.createElement('i');
  dot.setAttribute('aria-hidden', 'true');
  dot.textContent = '◆';
  const second = first.cloneNode(true);
  track.append(first, dot, second);
}

function applyAnnouncementToClassicBars() {
  const data = currentAnnouncement();
  const text = data?.text || '系统信息待播报';
  for (const root of document.querySelectorAll('.classic-system-broadcast')) {
    root.dataset.systemKind = String(data?.kind || 'idle');
    root.classList.toggle('is-idle', !data);
    const label = root.querySelector('.classic-broadcast-label');
    if (label) label.textContent = data ? `📣 ${data.title || '系统广播'}` : '📣 系统广播';
    setTrackText(root.querySelector('.classic-broadcast-track'), text);
  }
}

function appendSystemToClassicChats(data) {
  if (!data?.text) return;
  for (const log of document.querySelectorAll('[data-classic-chat-log]')) {
    if (log.dataset.lastSystemAnnouncementId === String(data.id)) continue;
    const line = document.createElement('p');
    line.className = 'is-system';
    line.textContent = `[系统] ${data.title ? `${data.title}：` : ''}${data.text}`;
    log.append(line);
    while (log.children.length > 80) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    log.dataset.lastSystemAnnouncementId = String(data.id);
  }
}

function publishAnnouncement(raw = {}, { ttl = 14000 } = {}) {
  if (!raw?.text) return;
  const data = {
    id: raw.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: raw.kind || 'system',
    title: raw.title || '系统广播',
    text: String(raw.text),
    at: Number(raw.at) || Date.now(),
    ...raw,
  };
  globalThis.__clbwzLastSystemAnnouncement = data;
  applyAnnouncementToClassicBars();
  appendSystemToClassicChats(data);
  window.dispatchEvent(new CustomEvent('clbwz:system-announcement', { detail: data }));

  if (expiryTimer) window.clearTimeout(expiryTimer);
  expiryTimer = window.setTimeout(() => {
    clearCurrentAnnouncement(data.id);
    expiryTimer = null;
  }, Math.max(4000, Number(ttl) || 14000));
}

function disconnectAnnouncements() {
  try { unsubscribe?.(); } catch {}
  unsubscribe = null;
  try { socketClient?.disconnect?.(); } catch {}
  socketClient = null;
  welcomedUserId = null;
  if (expiryTimer) window.clearTimeout(expiryTimer);
  expiryTimer = null;
  clearCurrentAnnouncement();
}

function connectAnnouncements() {
  if (!authStore.isLoggedIn() || !authStore.token || unsubscribe) return;
  unsubscribe = socket().on('system:announcement', (data) => publishAnnouncement(data));
}

function publishWelcomeOnce() {
  const userId = Number(authStore.user?.id ?? authStore.user?.userId) || String(authStore.user?.username || 'logged-in');
  if (welcomedUserId === userId) return;
  welcomedUserId = userId;
  publishAnnouncement({
    id: `welcome-${String(userId)}-${Date.now()}`,
    kind: 'welcome',
    title: '系统消息',
    text: '欢迎进入魔幻森林',
  }, { ttl: 9000 });
}

function announceStrengthen({ cardId, cardName, star }) {
  if (!authStore.isLoggedIn() || Number(star) < 6) return;
  socket().emitAck('system:announce:strengthen', {
    cardId: Number(cardId) || null,
    cardName: String(cardName || '').slice(0, 32),
    star: Number(star) || 0,
  }).catch(() => {});
}

function announceCraftAscend({ fromCardName, cardId, resultName, craftQuality }) {
  if (!authStore.isLoggedIn()) return;
  socket().emitAck('system:announce:craft-ascend', {
    fromCardName: String(fromCardName || '').slice(0, 32),
    cardId: Number(cardId) || null,
    resultName: String(resultName || '').slice(0, 48),
    craftQuality: Number(craftQuality) || null,
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
    publishWelcomeOnce();
    queueMicrotask(() => applyAnnouncementToClassicBars());
    return result;
  };

  const previousNavigate = App.prototype.navigate;
  App.prototype.navigate = function navigateWithSystemMarquee(...args) {
    const result = previousNavigate.apply(this, args);
    queueMicrotask(() => {
      applyAnnouncementToClassicBars();
      const data = currentAnnouncement();
      if (data) appendSystemToClassicChats(data);
    });
    return result;
  };

  const previousBattleResult = App.prototype.handleBattleResult;
  App.prototype.handleBattleResult = function handleBattleResultWithStreak(payload = {}) {
    const result = previousBattleResult.call(this, payload);
    if (
      String(payload?.mode || '').toLowerCase() === 'pvp'
      || Boolean(payload?.pvp)
      || Boolean(this.routeOpts?.pvp)
    ) {
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

  const previousCraft = CardCraftSystem.prototype.craft;
  CardCraftSystem.prototype.craft = function craftWithAscendAnnouncement(
    targetCardId,
    inventory,
    cardInventory,
    craftState,
    options = {},
  ) {
    const target = this.db?.getById?.(targetCardId);
    const result = previousCraft.call(this, targetCardId, inventory, cardInventory, craftState, options);
    if (result?.ok && result?.outcome === 'ascend') {
      announceCraftAscend({
        fromCardName: target?.name ?? target?.card_name ?? `卡牌#${targetCardId}`,
        cardId: result.cardId,
        resultName: result.displayName || result.cardName || `卡牌#${result.cardId}`,
        craftQuality: result.craftQuality,
      });
    }
    return result;
  };
}
