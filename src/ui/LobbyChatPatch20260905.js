import './LobbyChatPatch20260905.css';
import { authStore } from '../core/AuthStore.js';
import { containsBlockedWord, maskBlockedWords } from '../core/ContentFilter.js';
import { RoomView } from './RoomView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.lobbyChatPatch20260905');
const CHANNELS = Object.freeze([
  { id: 'current', label: '当前' },
  { id: 'world', label: '世界' },
  { id: 'guild', label: '公会' },
  { id: 'private', label: '私聊' },
]);
const CHANNEL_LABEL = Object.freeze({ current: '当前', world: '世界', guild: '公会', private: '私聊' });
const MAX_LINES = 80;

function cleanText(value) {
  return String(value ?? '')
    .replace(/%NAN\b/gi, '')
    .replace(/%NULL\b/gi, '')
    .replace(/\u0000/g, '')
    .trim();
}

function normalizeChannel(value, fallback = 'current') {
  const raw = String(value || '').toLowerCase();
  return CHANNELS.some((channel) => channel.id === raw) ? raw : fallback;
}

function channelLabel(id) {
  return CHANNELS.find((channel) => channel.id === id)?.label ?? '当前';
}

function ensureState(view) {
  if (!view.__lobbyChatState) {
    view.__lobbyChatState = {
      active: 'current',
      // 2026-09-11：单一日志——所有频道消息按时间顺序留在 entries 里，
      // 切换频道只改发送目标/高亮，不再重建列表（用户要求「切换不刷新信息」）。
      entries: [],
      buffers: new Map(CHANNELS.map((channel) => [channel.id, []])),
      privateTarget: null,
      privateTargetName: '',
      friendsLoaded: false,
    };
  }
  return view.__lobbyChatState;
}

function trimBuffer(buffer) {
  if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
}

/** 只更新分频道缓冲（兼容旧逻辑），不动单一日志。 */
function pushOne(state, channel, item) {
  const buffer = state.buffers.get(channel);
  if (!buffer || !item?.text) return;
  buffer.push(item);
  trimBuffer(buffer);
}

/** 往单一日志追加一条（系统消息只进这里一次，避免多频道重复）。 */
function recordEntry(state, item) {
  const entry = {
    channel: normalizeChannel(item?.channel, 'current'),
    nickname: cleanText(item?.nickname) || (item?.system ? '系统' : '玩家'),
    text: maskBlockedWords(cleanText(item?.text)),
    system: Boolean(item?.system),
    spectator: Boolean(item?.spectator),
  };
  if (!entry.text) return null;
  state.entries.push(entry);
  if (state.entries.length > MAX_LINES) state.entries.splice(0, state.entries.length - MAX_LINES);
  return entry;
}

function pushSystemAll(state, text, title = '') {
  const body = cleanText(text);
  if (!body) return;
  const item = {
    system: true,
    nickname: '系统',
    text: title ? `${cleanText(title)}：${body}` : body,
  };
  recordEntry(state, item);
  // 保留分频道缓冲：旧调用点/其它补丁若读取 buffers，仍能拿到系统消息。
  for (const { id } of CHANNELS) pushOne(state, id, item);
}

function renderMessages(view) {
  const state = ensureState(view);
  const list = view.root?.querySelector?.('#lobby-chat-list');
  if (!list) return;

  const signature = state.entries.map((entry) => `${entry.channel}|${entry.system ? 1 : 0}|${entry.nickname}|${entry.text}`).join('\n');
  if (list.dataset.chatSignature20260911 === signature
    && list.childElementCount === state.entries.length && state.entries.length > 0) {
    return;
  }

  list.replaceChildren();
  if (!state.entries.length) {
    const empty = document.createElement('div');
    empty.className = 'lobby-chat-item lobby-chat-empty';
    empty.textContent = '暂无消息';
    list.append(empty);
  } else {
    for (const entry of state.entries) {
      const row = document.createElement('div');
      row.className = `lobby-chat-item is-${entry.channel}${entry.system ? ' is-system' : ''}`;
      const prefix = entry.system
        ? '[系统] '
        : entry.channel === 'current'
          ? ''
          : `[${CHANNEL_LABEL[entry.channel] ?? entry.channel}] `;
      const nickname = entry.system ? '' : `${entry.spectator ? '[观战] ' : ''}${entry.nickname || '玩家'}：`;
      row.textContent = `${prefix}${nickname}${entry.text}`;
      list.append(row);
    }
  }
  list.dataset.chatSignature20260911 = signature;
  list.scrollTop = list.scrollHeight;
}

function clearLobbyChat(view) {
  const state = ensureState(view);
  state.entries = [];
  for (const { id } of CHANNELS) state.buffers.set(id, []);
  const list = view.root?.querySelector?.('#lobby-chat-list');
  if (list) {
    list.replaceChildren();
    list.dataset.chatSignature20260911 = '';
  }
}

async function loadFriends(view) {
  const state = ensureState(view);
  if (state.friendsLoaded) return;
  state.friendsLoaded = true;
  const select = view.root?.querySelector?.('#lobby-private-target-select');
  if (!select) return;

  const data = await authStore.api.get('/social/friends').catch(() => ({ friends: [] }));
  const friends = data?.friends ?? [];
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = friends.length ? '选择好友…' : '暂无好友';
  select.append(placeholder);

  for (const friend of friends) {
    const id = Number(friend?.userId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const option = document.createElement('option');
    option.value = String(id);
    option.textContent = `${cleanText(friend.nickname || friend.username) || `玩家${id}`}${friend.online ? ' · 在线' : ''}`;
    select.append(option);
  }

  if (Number(state.privateTarget) > 0) select.value = String(state.privateTarget);
}

/** 切换频道：只改高亮/私聊对象行，不重建日志。 */
function selectChannel(view, channel) {
  const state = ensureState(view);
  state.active = normalizeChannel(channel);
  view.root?.querySelectorAll?.('[data-lobby-chat-channel]').forEach((button) => {
    button.classList.toggle('active', button.dataset.lobbyChatChannel === state.active);
  });
  const privateBox = view.root?.querySelector?.('.lobby-chat-private-target');
  privateBox?.classList.toggle('hidden', state.active !== 'private');
  if (state.active === 'private') void loadFriends(view);
}

function mountLobbyChat(view) {
  const host = view.root?.querySelector?.('.classic-game-hall .lobby-chat');
  if (!host) return;

  if (view.__lobbySystemHandler) {
    window.removeEventListener('clbwz:system-announcement', view.__lobbySystemHandler);
    view.__lobbySystemHandler = null;
  }

  view.__lobbyChatState = null;
  const state = ensureState(view);
  host.innerHTML = `
    <div class="lobby-chat-head">
      <b>聊天</b>
      <div class="lobby-chat-channels">
        ${CHANNELS.map((channel, index) => `
          <button type="button" class="lobby-chat-channel${index === 0 ? ' active' : ''}" data-lobby-chat-channel="${channel.id}">${channel.label}</button>`).join('')}
        <button type="button" class="lobby-chat-clear" title="清空聊天记录">清屏</button>
      </div>
    </div>
    <div id="lobby-chat-list" class="lobby-chat-list" role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false" aria-label="大厅聊天记录"></div>
    <div class="lobby-chat-private-target hidden">
      <span>私聊对象</span>
      <select id="lobby-private-target-select"><option value="">选择好友…</option></select>
    </div>
    <div class="lobby-chat-input-row">
      <input id="lobby-chat-input" type="text" maxlength="200" autocomplete="off" placeholder="输入消息…" />
      <button id="lobby-chat-send" class="btn-sm" type="button">发送</button>
    </div>`;

  recordEntry(state, { channel: 'current', system: true, nickname: '系统', text: '欢迎来到游戏大厅，请选择房间或快速加入。' });

  const latest = globalThis.__clbwzLastSystemAnnouncement;
  if (latest?.text) pushSystemAll(state, latest.text, latest.title);

  host.querySelectorAll('[data-lobby-chat-channel]').forEach((button) => {
    button.addEventListener('click', () => selectChannel(view, button.dataset.lobbyChatChannel));
  });

  host.querySelector('.lobby-chat-clear')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearLobbyChat(view);
  });

  host.querySelector('#lobby-private-target-select')?.addEventListener('change', (event) => {
    const option = event.currentTarget.selectedOptions?.[0];
    const id = Number(event.currentTarget.value);
    state.privateTarget = Number.isFinite(id) && id > 0 ? id : null;
    state.privateTargetName = state.privateTarget ? cleanText(option?.textContent) : '';
  });

  const submit = () => view.sendChat();
  host.querySelector('#lobby-chat-send')?.addEventListener('click', submit);
  host.querySelector('#lobby-chat-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  view.__lobbySystemHandler = (event) => {
    const data = event.detail || {};
    if (data.clear || !data.text) return;
    pushSystemAll(state, data.text, data.title);
    renderMessages(view);
  };
  window.addEventListener('clbwz:system-announcement', view.__lobbySystemHandler);
  selectChannel(view, state.active);
  renderMessages(view);
}

export function installLobbyChatPatch20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderShell = RoomView.prototype.renderShell;
  RoomView.prototype.renderShell = function renderShellWithChannelChat(...args) {
    const result = previousRenderShell.apply(this, args);
    mountLobbyChat(this);
    return result;
  };

  const previousAppendChat = RoomView.prototype.appendChat;
  RoomView.prototype.appendChat = function appendChannelChat(message = {}) {
    const state = this.__lobbyChatState;
    if (!state) return previousAppendChat.call(this, message);

    const text = cleanText(message.text ?? message.message);
    if (!text) return;
    const system = Boolean(message.system) || String(message.nickname || '').trim() === '系统';
    if (system) {
      pushSystemAll(state, text, message.title || '');
      renderMessages(this);
      return;
    }

    const channel = this.room && !message.channel
      ? 'current'
      : normalizeChannel(message.channel, 'current');
    const nickname = cleanText(message.nickname ?? message.username ?? message.sender) || '玩家';
    const item = { nickname, text, spectator: Boolean(message.spectator) };
    pushOne(state, channel, item);
    // 大厅里所有频道共用一条日志；房间内由 RoomChatMerge20260910 接管，不会走到这里。
    recordEntry(state, { ...item, channel });
    renderMessages(this);
  };

  RoomView.prototype.sendChat = async function sendChannelChat() {
    const input = this.root?.querySelector?.('#lobby-chat-input');
    const text = cleanText(input?.value);
    if (!text) return;
    // 2026-09-11：发送前拦截违规词（服务端还有一层同样的校验）。
    if (containsBlockedWord(text)) {
      this.notice?.('消息包含违规词汇，已拦截');
      return;
    }
    const state = ensureState(this);

    try {
      if (this.room && state.active === 'current') {
        await this.socket.sendChat(text);
      } else if (state.active === 'private') {
        const targetId = Number(state.privateTarget);
        if (!Number.isFinite(targetId) || targetId <= 0) {
          await loadFriends(this);
          this.notice?.('请先选择私聊对象');
          return;
        }
        await this.socket.sendLobbyChat(text, 'private', targetId);
      } else {
        await this.socket.sendLobbyChat(text, state.active);
      }
      if (input) input.value = '';
    } catch (error) {
      this.notice?.(error?.message || '消息发送失败');
    }
  };

  const previousDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyLobbyChatPatch(...args) {
    if (this.__lobbySystemHandler) {
      window.removeEventListener('clbwz:system-announcement', this.__lobbySystemHandler);
      this.__lobbySystemHandler = null;
    }
    this.__lobbyChatState = null;
    return previousDestroy.apply(this, args);
  };

  window.__verifyLobbyChat20260905 = () => ({
    enabled: true,
    mounted: Boolean(document.querySelector('.classic-game-hall .lobby-chat-channels')),
    activeChannel: document.querySelector('.classic-game-hall .lobby-chat-channel.active')?.dataset?.lobbyChatChannel || null,
    hasClearButton: Boolean(document.querySelector('.classic-game-hall .lobby-chat-clear')),
    rows: document.querySelectorAll('.classic-game-hall .lobby-chat-item').length,
  });

  // 验证/调试用：不经过整页 renderShell 也能装配一次大厅聊天。
  window.__mountLobbyChat20260911 = (view) => mountLobbyChat(view);
  window.__lobbyChatEntries20260911 = (view) => view?.__lobbyChatState?.entries ?? [];
}

installLobbyChatPatch20260905();
