import './LobbyChatPatch20260905.js';
import { authStore, NEW_PLAYER_TUTORIAL_PROMPT_KEY } from '../core/AuthStore.js';
import { SocketClient } from '../network/SocketClient.js';
import {
  NEW_PLAYER_TUTORIAL_MARKER,
  getTutorialDeckSlots,
} from '../tutorial/TutorialConfig.js';
import { App } from './App.js';
import { installAnnouncementPlainText20260905 } from './AnnouncementPlainText20260905.js';
import { installSmithyCharmAndChatPolish20260908 } from './SmithyCharmAndChatPolish20260908.js';
import { installBatchInventoryDatabaseFix20260908 } from './BatchInventoryDatabaseFix20260908.js';

const PATCH_FLAG = Symbol.for('clbwzzz.systemAnnouncementClient20260905');
let socketClient = null;
let unsubscribe = null;
let expiryTimer = null;
let welcomedUserId = null;
const announcementQueue = [];
const recentAnnouncementIds = new Set();

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
    const track = root.querySelector('.classic-broadcast-track');
    if (track) track.style.paddingLeft = data ? '0px' : '';
    setTrackText(track, text);
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
  if (!raw?.text || (raw.id && recentAnnouncementIds.has(String(raw.id)))) return;
  if (raw.id) {
    recentAnnouncementIds.add(String(raw.id));
    if (recentAnnouncementIds.size > 200) recentAnnouncementIds.delete(recentAnnouncementIds.values().next().value);
  }
  const current = currentAnnouncement();
  if (current && current.kind !== 'welcome') {
    announcementQueue.push({ raw, ttl });
    return;
  }
  displayAnnouncement(raw, ttl);
}

function displayAnnouncement(raw, ttl) {
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
    expiryTimer = null;
    clearCurrentAnnouncement(data.id);
    const next = announcementQueue.shift();
    if (next) displayAnnouncement(next.raw, next.ttl);
  }, Math.max(4000, Number(ttl) || 14000));
}

function disconnectAnnouncements() {
  try { unsubscribe?.(); } catch {}
  unsubscribe = null;
  try { socketClient?.disconnect?.(); } catch {}
  socketClient = null;
  welcomedUserId = null;
  announcementQueue.length = 0;
  recentAnnouncementIds.clear();
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

function consumeNewPlayerTutorialPrompt() {
  try {
    if (sessionStorage.getItem(NEW_PLAYER_TUTORIAL_PROMPT_KEY) !== '1') return false;
    sessionStorage.removeItem(NEW_PLAYER_TUTORIAL_PROMPT_KEY);
    return true;
  } catch {
    return false;
  }
}

function showNewPlayerTutorialPrompt(app) {
  if (!app?.root || app.root.querySelector('.new-player-tutorial-choice')) return;
  const nickname = String(
    authStore.snapshot?.profile?.nickname
      ?? authStore.user?.nickname
      ?? '勇士',
  ).trim();

  const overlay = document.createElement('section');
  overlay.className = 'new-player-tutorial-choice';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'new-player-tutorial-title');
  overlay.innerHTML = `
    <div class="new-player-tutorial-choice__card">
      <div class="new-player-tutorial-choice__leaf">🌿</div>
      <h2 id="new-player-tutorial-title">欢迎来到魔幻森林</h2>
      <p>勇士${nickname ? `「${nickname}」` : ''}，第一次来到这里，要先跟随埃尔夫族完成新手教程吗？</p>
      <p class="new-player-tutorial-choice__hint">教程会带你学习放置卡牌、前后排、防御、技能、MP 与胜负规则。暂时跳过也没关系，之后仍可以从「训练营 → 新手教程」重新进入。</p>
      <div class="new-player-tutorial-choice__actions">
        <button type="button" data-action="skip">暂时跳过</button>
        <button type="button" data-action="start" class="primary">开始新手教程</button>
      </div>
    </div>`;

  const style = document.createElement('style');
  style.textContent = `
    .new-player-tutorial-choice{position:fixed;inset:0;z-index:30000;display:grid;place-items:center;padding:24px;background:rgba(5,25,14,.58);backdrop-filter:blur(3px)}
    .new-player-tutorial-choice__card{width:min(520px,calc(100vw - 40px));padding:28px 30px 24px;border:2px solid #d7c15b;border-radius:20px;background:linear-gradient(180deg,#173c2d,#0c281e);box-shadow:0 18px 50px rgba(0,0,0,.38);color:#eef7de;text-align:center}
    .new-player-tutorial-choice__leaf{font-size:34px;margin-bottom:4px}
    .new-player-tutorial-choice h2{margin:0 0 14px;color:#ffe26f;font-size:28px}
    .new-player-tutorial-choice p{margin:8px 0;line-height:1.75;font-size:16px}
    .new-player-tutorial-choice__hint{color:#b8d2ae;font-size:14px!important}
    .new-player-tutorial-choice__actions{display:flex;justify-content:center;gap:14px;margin-top:22px}
    .new-player-tutorial-choice button{min-width:132px;padding:10px 18px;border:1px solid #76935e;border-radius:10px;background:#314d3b;color:#eef7de;font-weight:700;cursor:pointer}
    .new-player-tutorial-choice button.primary{border-color:#f0c84f;background:linear-gradient(#ffd85e,#e7a92e);color:#3d2c05}
    .new-player-tutorial-choice button:hover{filter:brightness(1.08)}
  `;
  overlay.append(style);

  const close = () => overlay.remove();
  overlay.querySelector('[data-action="skip"]')?.addEventListener('click', close);
  overlay.querySelector('[data-action="start"]')?.addEventListener('click', () => {
    close();
    app.navigate('battle', {
      training: true,
      trainingFreeRes: false,
      trainingMap: 'grass',
      deckSlots: getTutorialDeckSlots(app.db, 6),
      tryUsage: NEW_PLAYER_TUTORIAL_MARKER,
    });
  });
  app.root.append(overlay);
}

export function installSystemAnnouncementClient() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // Keep the existing recovery entry points; installers are idempotent when
  // bootstrap.js has already installed them in the normal application startup.
  installAnnouncementPlainText20260905();
  installSmithyCharmAndChatPolish20260908();
  installBatchInventoryDatabaseFix20260908();
  window.addEventListener('clbwz:queue-system-announcement', (event) => {
    publishAnnouncement(event.detail);
  });

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
    queueMicrotask(() => {
      applyAnnouncementToClassicBars();
      if (consumeNewPlayerTutorialPrompt()) showNewPlayerTutorialPrompt(this);
    });
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

  // Craft/upgrade and PVP announcements now come from committed server results.
}
