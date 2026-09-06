import { SocketClient } from '../network/SocketClient.js';
import { RoomView } from './RoomView.js';
import {
  mergeRoomChatHistory20260906,
  replayRoomChatHistory20260906,
} from './RoomChatPersistence20260906.js';
import './RoomChatChannelFix20260906.css';

const PATCH_FLAG = Symbol.for('clbwz.roomChatChannelFix20260906');
const VALID_CHANNELS = new Set(['current', 'team', 'system']);

function normalizeChannel(value) {
  const raw = String(value || 'current').toLowerCase();
  if (raw === '当前') return 'current';
  if (raw === '队伍') return 'team';
  if (raw === '系统') return 'system';
  return VALID_CHANNELS.has(raw) ? raw : 'current';
}

function channelLabel(channel) {
  return { current: '当前', team: '队伍', system: '系统' }[normalizeChannel(channel)] || '当前';
}

function activeChannel(room) {
  return normalizeChannel(room?.querySelector?.('.exact-room-chat-tabs button.active')?.dataset?.channel);
}

function syncComposer(room) {
  const chat = room?.querySelector?.('.exact-room-chat');
  if (!chat) return;

  const channel = activeChannel(room);
  chat.dataset.activeChannel = channel;

  const current = chat.querySelector('.exact-room-chat-current');
  const input = chat.querySelector('.exact-room-chat-form input');
  const send = chat.querySelector('.exact-room-chat-form button');
  if (current) current.textContent = channelLabel(channel);

  const readonly = channel === 'system';
  if (input) {
    input.disabled = readonly;
    input.placeholder = readonly ? '系统消息仅由服务器发送' : `发送到${channelLabel(channel)}频道`;
  }
  if (send) {
    send.disabled = readonly;
    send.title = readonly ? '系统频道不可发送消息' : `发送到${channelLabel(channel)}频道`;
  }
}

function refreshVisibleChannel(view) {
  const room = view?.root?.querySelector?.('.game-room.room-exact');
  if (!room) return false;
  syncComposer(room);
  return replayRoomChatHistory20260906(view);
}

function hydratePublicRoomHistory(view, room) {
  if (!view || !room) return;
  // room.chat is intentionally public/current-channel history only. Team chat is never
  // stored in the public snapshot on the server, so reconnect cannot leak enemy team chat.
  mergeRoomChatHistory20260906(view, Array.isArray(room.chat) ? room.chat : []);
}

function installComposerUi(view) {
  if (!view?.root) return;
  const room = view.root.querySelector?.('.game-room.room-exact');
  if (!room) return;
  syncComposer(room);

  if (!view._roomChatChannelUiClick20260906) {
    view._roomChatChannelUiClick20260906 = (event) => {
      if (!event.target?.closest?.('.exact-room-chat-tabs button')) return;
      queueMicrotask(() => refreshVisibleChannel(view));
    };
    view.root.addEventListener('click', view._roomChatChannelUiClick20260906);
  }
}

export function installRoomChatChannelFix20260906() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // The room UI must send an explicit channel. The old room:chat endpoint stays
  // available for rolling compatibility, but the current client uses v2.
  SocketClient.prototype.sendChat = function sendRoomChat20260906(text, channel = 'current') {
    const normalized = normalizeChannel(channel);
    if (normalized === 'system') return Promise.reject(new Error('系统频道为只读频道'));
    return this.emitAck('room:chat:v2', {
      text: String(text || '').trim(),
      channel: normalized,
    }).then((response) => response.message);
  };

  const previousBindRoomChat = RoomView.prototype.bindRoomChat;
  RoomView.prototype.bindRoomChat = function bindRoomChatChannels20260906(...args) {
    const result = previousBindRoomChat.apply(this, args);

    // Replace the legacy listener installed by RoomView. It discarded e.detail.channel.
    if (this.chatSendHandler) {
      window.removeEventListener('clbwz:room-chat-send', this.chatSendHandler);
    }
    this.chatSendHandler = (event) => {
      const text = String(event.detail?.message || '').trim();
      const channel = normalizeChannel(event.detail?.channel);
      if (!text) return;
      if (channel === 'system') {
        this.notice?.('系统频道仅显示服务器消息');
        installComposerUi(this);
        return;
      }
      this.sendText(text, channel);
    };
    window.addEventListener('clbwz:room-chat-send', this.chatSendHandler);

    if (!this._roomChatChannelReady20260906) {
      this._roomChatChannelReady20260906 = () => {
        installComposerUi(this);
        refreshVisibleChannel(this);
      };
      this.root?.addEventListener?.('clbwz:room-exact-ready', this._roomChatChannelReady20260906);
    }
    installComposerUi(this);
    refreshVisibleChannel(this);
    return result;
  };

  const previousEnterRoom = RoomView.prototype.enterRoom;
  RoomView.prototype.enterRoom = function enterRoomWithChatHydration20260906(room, ...args) {
    hydratePublicRoomHistory(this, room);
    const result = previousEnterRoom.call(this, room, ...args);
    installComposerUi(this);
    refreshVisibleChannel(this);
    return result;
  };

  const previousRefreshRoom = RoomView.prototype.refreshRoom;
  RoomView.prototype.refreshRoom = function refreshRoomWithChatHydration20260906(room, ...args) {
    hydratePublicRoomHistory(this, room || this.room);
    const result = previousRefreshRoom.call(this, room, ...args);
    installComposerUi(this);
    refreshVisibleChannel(this);
    return result;
  };

  const previousSendText = RoomView.prototype.sendText;
  RoomView.prototype.sendText = function sendRoomTextByChannel20260906(text, channel = 'current') {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;
    if (!this.room) return previousSendText.call(this, normalizedText);

    const normalizedChannel = normalizeChannel(channel);
    if (normalizedChannel === 'system') {
      this.notice?.('系统频道仅显示服务器消息');
      return;
    }
    this.socket.sendChat(normalizedText, normalizedChannel).catch((error) => this.notice(error.message));
  };

  const previousDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyRoomChatChannels20260906(...args) {
    if (this._roomChatChannelUiClick20260906) {
      this.root?.removeEventListener?.('click', this._roomChatChannelUiClick20260906);
      this._roomChatChannelUiClick20260906 = null;
    }
    if (this._roomChatChannelReady20260906) {
      this.root?.removeEventListener?.('clbwz:room-exact-ready', this._roomChatChannelReady20260906);
      this._roomChatChannelReady20260906 = null;
    }
    return previousDestroy.apply(this, args);
  };
}
