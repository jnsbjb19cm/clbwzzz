import { BattleView } from './BattleView.js';
import { authStore } from '../core/AuthStore.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleChatOverlay');
const MINIMIZED_KEY = 'clbwz_battle_chat_minimized';
const MAX_LOG_ITEMS = 80;
const CHANNELS = Object.freeze([
  { id: 'current', label: '本局' },
  { id: 'world', label: '世界' },
  { id: 'guild', label: '公会' },
  { id: 'private', label: '私聊' },
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getChatSocket(view) {
  return view.pvp?.socket || view.pvpSocket || null;
}

function channelLabel(id) {
  return CHANNELS.find((channel) => channel.id === id)?.label ?? '本局';
}

function createState() {
  return {
    active: 'current',
    privateTarget: null,
    privateTargetName: '',
    buffers: new Map(CHANNELS.map((channel) => [channel.id, []])),
    seenIds: new Set(),
  };
}

function pushMessage(state, channel, message) {
  const target = state.buffers.get(channel) ?? state.buffers.get('current');
  if (!target || !message?.text) return;
  const id = message.id ? String(message.id) : null;
  if (id && state.seenIds.has(id)) return;
  if (id) {
    state.seenIds.add(id);
    if (state.seenIds.size > 500) state.seenIds.clear();
  }
  target.push(message);
  if (target.length > MAX_LOG_ITEMS) target.splice(0, target.length - MAX_LOG_ITEMS);
}

function renderLog(shell, state) {
  const log = shell?.querySelector('.battle-chat-log');
  if (!log) return;
  log.replaceChildren();
  for (const message of state.buffers.get(state.active) ?? []) {
    const row = document.createElement('div');
    row.className = `battle-chat-message${message.system ? ' system' : ''}${message.spectator ? ' spectator' : ''}`;
    const prefix = message.spectator ? '[观战] ' : '';
    row.innerHTML = `<b>${escapeHtml(prefix + (message.nickname || ''))}：</b><span>${escapeHtml(message.text)}</span>`;
    log.appendChild(row);
  }
  log.scrollTop = log.scrollHeight;
  const title = shell.querySelector('.battle-chat-title');
  if (title) {
    title.textContent = state.active === 'private' && state.privateTargetName
      ? `私聊 · ${state.privateTargetName}`
      : `${channelLabel(state.active)}聊天`;
  }
}

function appendMessage(shell, state, channel, message) {
  pushMessage(state, channel, message);
  if (channel === state.active) renderLog(shell, state);

  if (shell.classList.contains('minimized')) {
    const unread = Number(shell.dataset.unread || 0) + 1;
    shell.dataset.unread = String(unread);
    const badge = shell.querySelector('.battle-chat-badge');
    if (badge) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.add('visible');
    }
  }
}

function appendSystemMessage(shell, state, text) {
  appendMessage(shell, state, state.active, {
    id: `local-system-${Date.now()}-${Math.random()}`,
    nickname: '系统',
    text,
    system: true,
  });
}

function clearUnread(shell) {
  shell.dataset.unread = '0';
  const badge = shell.querySelector('.battle-chat-badge');
  if (badge) {
    badge.textContent = '';
    badge.classList.remove('visible');
  }
}

function setMinimized(shell, minimized) {
  shell.classList.toggle('minimized', minimized);
  if (!minimized) clearUnread(shell);
  try {
    localStorage.setItem(MINIMIZED_KEY, minimized ? '1' : '0');
  } catch { /* storage unavailable */ }
}

function restartMarqueeAnimation(marquee) {
  const text = marquee?.querySelector('.battle-system-marquee-text');
  if (!text) return;
  text.style.animation = 'none';
  void text.offsetWidth;
  text.style.animation = '';
}

function setBattleMarquee(shell, data) {
  const marquee = shell?.querySelector('.battle-system-marquee');
  if (!marquee) return;
  const title = marquee.querySelector('.battle-system-marquee-title');
  const text = marquee.querySelector('.battle-system-marquee-text');

  if (!data?.text) {
    marquee.dataset.kind = 'idle';
    marquee.classList.remove('hidden');
    marquee.classList.add('idle');
    if (title) title.textContent = '📣 系统广播';
    if (text) text.textContent = '暂无新的系统消息';
    restartMarqueeAnimation(marquee);
    return;
  }

  marquee.dataset.kind = String(data.kind || 'system');
  marquee.classList.remove('hidden', 'idle');
  if (title) title.textContent = `📣 ${data.title || '系统消息'}`;
  if (text) text.textContent = data.text;
  restartMarqueeAnimation(marquee);
}

async function choosePrivateTarget(shell, state, { force = false } = {}) {
  if (!force && Number(state.privateTarget) > 0) return Number(state.privateTarget);
  shell.querySelector('.battle-private-picker')?.remove();

  const data = await authStore.api.get('/social/friends').catch(() => ({ friends: [] }));
  const friends = data.friends ?? [];
  if (!friends.length) {
    appendSystemMessage(shell, state, '你还没有可私聊的好友');
    return null;
  }

  return new Promise((resolve) => {
    const picker = document.createElement('div');
    picker.className = 'battle-private-picker';
    picker.innerHTML = `
      <div class="battle-private-picker-head"><b>选择私聊对象</b><button type="button">×</button></div>
      <div class="battle-private-picker-list">
        ${friends.map((friend) => `
          <button type="button" data-private-user="${Number(friend.userId)}" data-private-name="${escapeHtml(friend.nickname || friend.username || '玩家')}">
            <span>${escapeHtml(friend.nickname || friend.username || '玩家')}</span>
            <small>Lv.${Number(friend.level) || 1}${friend.online ? ' · 在线' : ' · 离线'}</small>
          </button>`).join('')}
      </div>`;
    shell.querySelector('.battle-chat-panel')?.append(picker);

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      picker.remove();
      resolve(value);
    };
    picker.querySelector('.battle-private-picker-head button')?.addEventListener('click', () => finish(null));
    picker.querySelectorAll('[data-private-user]').forEach((button) => {
      button.addEventListener('click', () => {
        state.privateTarget = Number(button.dataset.privateUser);
        state.privateTargetName = button.dataset.privateName || '玩家';
        renderLog(shell, state);
        finish(state.privateTarget);
      });
    });
  });
}

function selectChannel(shell, state, channel) {
  state.active = channel;
  shell.querySelectorAll('[data-battle-chat-channel]').forEach((button) => {
    button.classList.toggle('active', button.dataset.battleChatChannel === channel);
  });
  // 每个频道都有独立 buffer；切换时只显示当前频道，不混入其它频道信息。
  renderLog(shell, state);
  if (channel === 'private' && !state.privateTarget) void choosePrivateTarget(shell, state);
}

function mountBattleChatOverlay(view) {
  if (view.__battleChatMounted && view.__battleChatShell?.isConnected) return;
  const socket = getChatSocket(view);
  if (!socket) return;

  unmountBattleChatOverlay(view);
  view.__battleChatMounted = true;
  const state = createState();
  view.__battleChatState = state;

  const shell = document.createElement('div');
  shell.className = 'battle-chat-shell';
  shell.setAttribute('data-battle-chat-shell', '');
  shell.innerHTML = `
    <div class="battle-system-marquee" aria-live="polite">
      <span class="battle-system-marquee-title">📣 系统广播</span>
      <span class="battle-system-marquee-window"><span class="battle-system-marquee-text">暂无新的系统消息</span></span>
    </div>
    <section class="battle-chat-panel" aria-label="战斗聊天">
      <header class="battle-chat-header">
        <span class="battle-chat-title">本局聊天</span>
        <button type="button" class="battle-chat-min" aria-label="收起聊天" title="收起聊天">—</button>
      </header>
      <div class="battle-chat-channels">
        ${CHANNELS.map((channel, index) => `<button type="button" data-battle-chat-channel="${channel.id}" class="${index === 0 ? 'active' : ''}">${channel.label}</button>`).join('')}
      </div>
      <div class="battle-chat-log" aria-live="polite"></div>
      <form class="battle-chat-form">
        <input type="text" maxlength="200" autocomplete="off" aria-label="聊天消息" placeholder="输入消息，Enter 发送" />
        <button type="submit">发送</button>
      </form>
    </section>
    <button type="button" class="battle-chat-toggle" aria-label="打开聊天" title="打开聊天">
      💬 聊天
      <span class="battle-chat-badge" aria-hidden="true"></span>
    </button>`;

  document.body.appendChild(shell);
  view.__battleChatShell = shell;
  shell.dataset.unread = '0';

  shell.querySelector('.battle-chat-min')?.addEventListener('click', () => setMinimized(shell, true));
  shell.querySelector('.battle-chat-toggle')?.addEventListener('click', () => setMinimized(shell, false));
  shell.querySelectorAll('[data-battle-chat-channel]').forEach((button) => {
    button.addEventListener('click', () => selectChannel(shell, state, button.dataset.battleChatChannel));
  });

  shell.querySelector('.battle-chat-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = shell.querySelector('.battle-chat-form input');
    const text = input?.value.trim();
    if (!text) return;
    input.value = '';

    try {
      if (state.active === 'current') {
        await socket.emitAck('battle:chat:current', { text });
        return;
      }
      let targetId = null;
      if (state.active === 'private') {
        targetId = await choosePrivateTarget(shell, state);
        if (!targetId) return;
      }
      await socket.sendLobbyChat(text, state.active, targetId);
    } catch (error) {
      appendSystemMessage(shell, state, error?.message || '发送失败');
    }
  });

  const onCurrentChat = (message = {}) => {
    appendMessage(shell, state, 'current', {
      id: message.id,
      nickname: message.nickname || '玩家',
      text: message.text || '',
      spectator: Boolean(message.spectator),
    });
  };
  const onLobbyChat = (message = {}) => {
    const channel = ['world', 'guild', 'private'].includes(message.channel) ? message.channel : null;
    if (!channel) return;
    appendMessage(shell, state, channel, {
      id: message.id || `${message.at || Date.now()}-${message.senderId || ''}-${message.text || ''}`,
      nickname: message.nickname || '玩家',
      text: message.text || '',
    });
  };
  const onSystem = (event) => {
    const data = event.detail || {};
    setBattleMarquee(shell, data.clear ? null : data);
    if (data.clear || !data.text) return;

    // 系统信息不是某一个聊天频道私有的：四个频道都保留一份，切换后仍能看到系统播报。
    for (const channel of CHANNELS) {
      pushMessage(state, channel.id, {
        id: `system-${data.id || Date.now()}-${channel.id}`,
        nickname: '系统',
        text: `${data.title ? `${data.title}：` : ''}${data.text}`,
        system: true,
      });
    }
    renderLog(shell, state);
  };

  const unsubs = [
    socket.on('battle:chat', onCurrentChat),
    socket.on('room:chat', onCurrentChat),
    socket.on('lobby:chat', onLobbyChat),
  ];
  window.addEventListener('clbwz:system-announcement', onSystem);
  view.__battleChatUnsub = () => {
    for (const unsub of unsubs) try { unsub?.(); } catch {}
    window.removeEventListener('clbwz:system-announcement', onSystem);
  };

  for (const entry of (view.pvp?.room?.chat ?? []).slice(-30)) {
    pushMessage(state, 'current', {
      id: entry?.id,
      nickname: entry?.nickname || '玩家',
      text: entry?.text || '',
      spectator: Boolean(entry?.spectator),
    });
  }

  const latestSystem = globalThis.__clbwzLastSystemAnnouncement;
  setBattleMarquee(shell, latestSystem || null);
  if (latestSystem?.text) {
    for (const channel of CHANNELS) {
      pushMessage(state, channel.id, {
        id: `system-${latestSystem.id || Date.now()}-initial-${channel.id}`,
        nickname: '系统',
        text: `${latestSystem.title ? `${latestSystem.title}：` : ''}${latestSystem.text}`,
        system: true,
      });
    }
  }
  renderLog(shell, state);

  try {
    setMinimized(shell, localStorage.getItem(MINIMIZED_KEY) === '1');
  } catch {
    setMinimized(shell, false);
  }
}

function unmountBattleChatOverlay(view) {
  view.__battleChatUnsub?.();
  view.__battleChatUnsub = null;
  view.__battleChatShell?.remove();
  view.__battleChatShell = null;
  view.__battleChatState = null;
  view.__battleChatMounted = false;
}

export function installBattleChatOverlay() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithChat(...args) {
    const result = await previousRenderBattle.apply(this, args);
    if (this.pvp) mountBattleChatOverlay(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyBattleChat() {
    unmountBattleChatOverlay(this);
    return previousDestroy.call(this);
  };

  window.__verifyBattleChatOverlay = () => ({
    enabled: true,
    mounted: Boolean(document.querySelector('.battle-chat-shell')),
    channel: document.querySelector('.battle-chat-channels .active')?.dataset?.battleChatChannel || null,
    marquee: document.querySelector('.battle-system-marquee-text')?.textContent || null,
  });
}
