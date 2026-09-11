import { BattleView } from './BattleView.js';
import { authStore } from '../core/AuthStore.js';
import { containsBlockedWord, maskBlockedWords } from '../core/ContentFilter.js';

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

/* ---------------------------------------------------------------------------
   2026-09-10：战斗内发言直接挂在说话人的玩家图标上。
   气泡里必须带「昵称：」，否则有人可以拿聊天内容伪装成技能/系统提示（骗技能）。
   --------------------------------------------------------------------------- */
const BUBBLE_VISIBLE_MS = 7000;
const BUBBLE_MAX_VISIBLE = 3;

function battleWrapOf(view) {
  return view?.viewRoot?.querySelector?.('.battle-game-wrap')
    ?? globalThis.document?.querySelector?.('.battle-game-wrap')
    ?? null;
}

function findPlayerStand(view, message = {}) {
  const wrap = battleWrapOf(view);
  if (!wrap) return null;
  const userId = Number(message.userId ?? message.senderId ?? 0);
  if (Number.isFinite(userId) && userId > 0) {
    const byId = wrap.querySelector(`.pvp-column-player[data-user-id="${userId}"]`);
    if (byId) return byId;
  }
  const nickname = String(message.nickname ?? '').trim();
  if (!nickname) return null;
  return [...wrap.querySelectorAll('.pvp-column-player')]
    .find((node) => (node.querySelector('span')?.textContent || '').trim() === nickname) ?? null;
}

function bubbleLayerOf(wrap) {
  let layer = wrap.querySelector('[data-pvp-chat-bubbles]');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'pvp-chat-bubbles';
    layer.dataset.pvpChatBubbles = 'true';
    layer.setAttribute('aria-hidden', 'true');
    wrap.append(layer);
  }
  return layer;
}

export function showBattleChatBubble(view, message = {}) {
  const text = String(message.text ?? '').trim();
  if (!text) return false;
  const nickname = String(message.nickname ?? '').trim() || '玩家';
  const wrap = battleWrapOf(view);
  const stand = findPlayerStand(view, message);
  // 没有对应的玩家图标就不弹，避免出现无归属的气泡。
  if (!wrap || !stand) return false;

  const layer = bubbleLayerOf(wrap);
  const wrapRect = wrap.getBoundingClientRect();
  const rect = stand.getBoundingClientRect();

  const bubble = document.createElement('div');
  bubble.className = 'pvp-chat-bubble';
  bubble.innerHTML = `<b>${escapeHtml(nickname)}：</b><span>${escapeHtml(text)}</span>`;
  bubble.style.left = `${rect.left - wrapRect.left + rect.width / 2}px`;
  bubble.style.top = `${rect.top - wrapRect.top - 6}px`;
  layer.append(bubble);
  while (layer.children.length > BUBBLE_MAX_VISIBLE) layer.firstElementChild?.remove();
  requestAnimationFrame(() => bubble.classList.add('visible'));
  setTimeout(() => {
    bubble.classList.remove('visible');
    setTimeout(() => bubble.remove(), 280);
  }, BUBBLE_VISIBLE_MS);
  return true;
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
  // 2026-09-11：显示兜底——违规词打码。
  message = { ...message, text: maskBlockedWords(message.text) };
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
    // 2026-09-11：发送前拦截违规词（服务端还有一层同样的校验）。
    if (containsBlockedWord(text)) {
      appendSystemMessage(shell, state, '消息包含违规词汇，已拦截');
      return;
    }
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

  const onCurrentChat = (message = {}, { bubble = true } = {}) => {
    appendMessage(shell, state, 'current', {
      id: message.id,
      nickname: message.nickname || '玩家',
      text: message.text || '',
      spectator: Boolean(message.spectator),
    });
    // 同一句话同时挂在说话人的玩家图标上（气泡里带昵称，避免被拿去骗技能）。
    if (bubble) showBattleChatBubble(view, message);
  };
  // 技能播报已有自己的战场表现，只进聊天记录，不再重复弹气泡。
  const onSkillAnnounced = event => onCurrentChat(event.detail, { bubble: false });
  view.viewRoot?.addEventListener('clbwz:skill-announced', onSkillAnnounced);
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
    view.viewRoot?.removeEventListener('clbwz:skill-announced', onSkillAnnounced);
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
