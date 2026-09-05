import './LobbyChatPatch20260905.css';
import { authStore } from '../core/AuthStore.js';
import { RoomView } from './RoomView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.lobbyChatPatch20260905');
const CHANNELS = Object.freeze([
  { id: 'current', label: '当前' },
  { id: 'world', label: '世界' },
  { id: 'guild', label: '公会' },
  { id: 'private', label: '私聊' },
]);
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

function pushOne(state, channel, item) {
  const buffer = state.buffers.get(channel);
  if (!buffer || !item?.text) return;
  buffer.push(item);
  trimBuffer(buffer);
}

function pushSystemAll(state, text, title = '') {
  const body = cleanText(text);
  if (!body) return;
  const item = {
    system: true,
    nickname: '系统',
    text: title ? `${cleanText(title)}：${body}` : body,
  };
  for (const { id } of CHANNELS) pushOne(state, id, item);
}

function renderMessages(view) {
  const state = ensureState(view);
  const list = view.root?.querySelector?.('#lobby-chat-list');
  if (!list) return;
  list.replaceChildren();

  const messages = state.buffers.get(state.active) ?? [];
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'lobby-chat-item lobby-chat-empty';
    empty.textContent = `${channelLabel(state.active)}频道暂无消息`;
    list.append(empty);
  } else {
    for (const item of messages) {
      const row = document.createElement('div');
      row.className = `lobby-chat-item${item.system ? ' is-system' : ''} is-${state.active}`;
      const prefix = item.system
        ? '[系统] '
        : state.active === 'private'
          ? '[私聊] '
          : state.active === 'guild'
            ? '[公会] '
            : state.active === 'world'
              ? '[世界] '
              : '';
      const nickname = cleanText(item.nickname) || (item.system ? '' : '玩家');
      row.textContent = item.system
        ? `${prefix}${item.text}`
        : `${prefix}${nickname}：${item.text}`;
      list.append(row);
    }
  }
  list.scrollTop = list.scrollHeight;
}

function appendExactRoomLog(view, { nickname, text, spectator = false }) {
  const log = view.root?.querySelector?.('.exact-room-chat-log');
  if (!log || !text) return;
  const row = document.createElement('div');
  row.className = 'exact-room-chat-message';
  const name = `${spectator ? '[观战] ' : ''}${cleanText(nickname) || '玩家'}`;
  const strong = document.createElement('b');
  strong.textContent = `${name}：`;
  const span = document.createElement('span');
  span.textContent = text;
  row.append(strong, span);
  log.append(row);
  while (log.children.length > MAX_LINES) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
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

function selectChannel(view, channel) {
  const state = ensureState(view);
  state.active = normalizeChannel(channel);
  view.root?.querySelectorAll?.('[data-lobby-chat-channel]').forEach((button) => {
    button.classList.toggle('active', button.dataset.lobbyChatChannel === state.active);
  });
  const privateBox = view.root?.querySelector?.('.lobby-chat-private-target');
  privateBox?.classList.toggle('hidden', state.active !== 'private');
  if (state.active === 'private') void loadFriends(view);
  renderMessages(view);
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
      </div>
    </div>
    <div id="lobby-chat-list" class="lobby-chat-list"></div>
    <div class="lobby-chat-private-target hidden">
      <span>私聊对象</span>
      <select id="lobby-private-target-select"><option value="">选择好友…</option></select>
    </div>
    <div class="lobby-chat-input-row">
      <input id="lobby-chat-input" type="text" maxlength="200" autocomplete="off" placeholder="输入消息…" />
      <button id="lobby-chat-send" class="btn-sm" type="button">发送</button>
    </div>`;

  pushOne(state, 'current', {
    system: true,
    nickname: '系统',
    text: '欢迎来到游戏大厅，请选择房间或快速加入。',
  });

  const latest = globalThis.__clbwzLastSystemAnnouncement;
  if (latest?.text) pushSystemAll(state, latest.text, latest.title);

  host.querySelectorAll('[data-lobby-chat-channel]').forEach((button) => {
    button.addEventListener('click', () => selectChannel(view, button.dataset.lobbyChatChannel));
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
    if (channel === state.active) renderMessages(this);

    // 房间内原有 DeckSelectView 聊天框仍保留，不因大厅分频道改造而丢消息。
    if (this.room && channel === 'current') appendExactRoomLog(this, item);
  };

  RoomView.prototype.sendChat = async function sendChannelChat() {
    const input = this.root?.querySelector?.('#lobby-chat-input');
    const text = cleanText(input?.value);
    if (!text) return;
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
  });
}

installLobbyChatPatch20260905();
