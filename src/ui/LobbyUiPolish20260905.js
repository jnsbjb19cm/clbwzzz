import './LobbyUiPolish20260905.css';
import { RoomView } from './RoomView.js';

const PATCH_FLAG = Symbol.for('clbwz.lobbyUiPolish20260905');
const CHAT_CHANNELS = Object.freeze([
  { id: 'current', label: '当前' },
  { id: 'world', label: '世界' },
  { id: 'guild', label: '公会' },
  { id: 'private', label: '私聊' },
]);
const CHANNEL_LABEL = Object.freeze({
  current: '当前',
  world: '世界',
  guild: '公会',
  private: '私聊',
});

function ensureLobbyChatState(view) {
  if (!Array.isArray(view.lobbyChatMessages)) {
    view.lobbyChatMessages = [
      {
        channel: 'all',
        nickname: '系统',
        text: '欢迎来到游戏大厅，请选择房间或快速加入。',
        system: true,
        at: Date.now(),
      },
    ];
  }
  if (!CHAT_CHANNELS.some((entry) => entry.id === view.lobbyChatChannel)) {
    view.lobbyChatChannel = 'current';
  }
  if (view.lobbyPrivateTargetId == null) view.lobbyPrivateTargetId = '';
}

function insertAnnouncement(view) {
  const stage = view.root?.querySelector('.classic-game-hall .lobby-stage');
  if (!stage || stage.querySelector('.lobby-announcement')) return;
  const bar = document.createElement('div');
  bar.className = 'lobby-announcement';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-label', '大厅公告');
  bar.innerHTML = `
    <span class="lobby-announcement-label">公告</span>
    <span class="lobby-announcement-window">
      <span class="lobby-announcement-track">房间最长保留 2 小时，无真人玩家的房间会自动回收　｜　请文明交流，谨防非官方交易诈骗　｜　绑定材料参与制作后，产物会继承绑定状态</span>
    </span>`;
  stage.appendChild(bar);
}

function setPrivateTarget(view, userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  view.lobbyPrivateTargetId = String(id);
  const target = view.root?.querySelector('#lobby-private-target');
  if (target) target.value = view.lobbyPrivateTargetId;
  selectLobbyChatChannel(view, 'private');
  view.root?.querySelector('#lobby-chat-input')?.focus();
}

function renderLobbyMessages(view) {
  ensureLobbyChatState(view);
  const list = view.root?.querySelector('#lobby-chat-list');
  if (!list) return;
  const selected = view.lobbyChatChannel;
  const messages = view.lobbyChatMessages.filter((msg) => msg.channel === 'all' || msg.channel === selected);

  if (!messages.length) {
    const emptyText = selected === 'private'
      ? '暂无私聊消息。可点击聊天中的玩家昵称快速设为私聊对象。'
      : `${CHANNEL_LABEL[selected] ?? '当前'}频道暂无消息。`;
    list.innerHTML = `<div class="lobby-chat-item is-system">[系统] ${view.escapeHtml(emptyText)}</div>`;
    return;
  }

  list.innerHTML = messages.map((msg) => {
    const channel = msg.channel === 'all' ? '' : `[${CHANNEL_LABEL[msg.channel] ?? '当前'}] `;
    const nick = view.escapeHtml(msg.nickname || '系统');
    const text = view.escapeHtml(msg.text || '');
    const senderId = Number(msg.senderId);
    const canPrivate = Number.isInteger(senderId) && senderId > 0 && senderId !== Number(view.currentUserId?.() ?? -1);
    const sender = canPrivate
      ? `<button type="button" class="lobby-chat-sender" data-private-user="${senderId}" title="点击私聊 ${nick}">${nick}</button>`
      : `<span class="lobby-chat-sender-static">${nick}</span>`;
    const cls = [
      'lobby-chat-item',
      msg.system ? 'is-system' : '',
      msg.channel === 'private' ? 'is-private' : '',
    ].filter(Boolean).join(' ');
    return `<div class="${cls}">${channel}${sender}：${text}</div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;

  list.querySelectorAll('[data-private-user]').forEach((button) => {
    button.addEventListener('click', () => setPrivateTarget(view, button.dataset.privateUser));
  });
}

function updateChatInputHint(view) {
  const input = view.root?.querySelector('#lobby-chat-input');
  if (!input) return;
  const hints = {
    current: '输入当前频道消息…',
    world: '输入世界频道消息…',
    guild: '输入公会频道消息…',
    private: '输入私聊消息…',
  };
  input.placeholder = hints[view.lobbyChatChannel] ?? '输入消息…';
}

function selectLobbyChatChannel(view, channel) {
  ensureLobbyChatState(view);
  if (!CHAT_CHANNELS.some((entry) => entry.id === channel)) return;
  view.lobbyChatChannel = channel;
  view.root?.querySelectorAll('.lobby-chat-channel').forEach((button) => {
    const active = button.dataset.channel === channel;
    button.classList.toggle('active', active);
    if (active) button.classList.remove('has-unread');
  });
  const privateTarget = view.root?.querySelector('#lobby-private-target');
  if (privateTarget) {
    privateTarget.hidden = channel !== 'private';
    privateTarget.value = view.lobbyPrivateTargetId || '';
  }
  updateChatInputHint(view);
  renderLobbyMessages(view);
}

function insertChatChannels(view) {
  ensureLobbyChatState(view);
  const chat = view.root?.querySelector('.classic-game-hall .lobby-chat');
  if (!chat || chat.querySelector('.lobby-chat-head')) return;

  const head = document.createElement('div');
  head.className = 'lobby-chat-head';
  head.innerHTML = `
    <span class="lobby-chat-title">聊天</span>
    <span class="lobby-chat-channels">
      ${CHAT_CHANNELS.map((entry) => `<button type="button" class="lobby-chat-channel" data-channel="${entry.id}">${entry.label}</button>`).join('')}
    </span>
    <input id="lobby-private-target" class="lobby-chat-private-target" type="text" inputmode="numeric" maxlength="12" placeholder="对方玩家ID" hidden />`;
  chat.prepend(head);

  head.querySelectorAll('.lobby-chat-channel').forEach((button) => {
    button.addEventListener('click', () => selectLobbyChatChannel(view, button.dataset.channel));
  });
  const target = head.querySelector('#lobby-private-target');
  target?.addEventListener('input', () => {
    view.lobbyPrivateTargetId = target.value.replace(/\D+/g, '').slice(0, 12);
    if (target.value !== view.lobbyPrivateTargetId) target.value = view.lobbyPrivateTargetId;
  });

  // 原页面内的两条写死演示消息换成真正按频道保存/筛选的消息列表。
  renderLobbyMessages(view);
  selectLobbyChatChannel(view, view.lobbyChatChannel);
}

function enhanceLobbyShell(view) {
  if (!view.root?.querySelector('.classic-game-hall')) return;
  insertAnnouncement(view);
  insertChatChannels(view);
}

export function installLobbyUiPolish20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalRenderShell = RoomView.prototype.renderShell;
  RoomView.prototype.renderShell = function renderShellLobbyPolish20260905(...args) {
    const result = originalRenderShell.apply(this, args);
    enhanceLobbyShell(this);
    return result;
  };

  const originalSendChat = RoomView.prototype.sendChat;
  RoomView.prototype.sendChat = function sendLobbyChannelChat20260905() {
    if (this.room) return originalSendChat.call(this);
    ensureLobbyChatState(this);
    const input = this.root?.querySelector('#lobby-chat-input');
    const text = input?.value?.trim();
    if (!text) return;

    let targetId = null;
    if (this.lobbyChatChannel === 'private') {
      const raw = this.root?.querySelector('#lobby-private-target')?.value?.trim() || this.lobbyPrivateTargetId;
      targetId = Number(raw);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        this.notice('私聊频道请先填写对方玩家ID，也可以直接点击聊天中的玩家昵称');
        return;
      }
      this.lobbyPrivateTargetId = String(targetId);
    }

    this.socket
      .sendLobbyChat(text, this.lobbyChatChannel, targetId)
      .then(() => {
        if (input) input.value = '';
      })
      .catch((error) => this.notice(error.message));
  };

  const originalAppendChat = RoomView.prototype.appendChat;
  RoomView.prototype.appendChat = function appendChannelChat20260905(msg) {
    // 房间内部仍使用原来的房间聊天；大厅消息才按频道分类。
    if (this.room || !msg?.channel) return originalAppendChat.call(this, msg);
    ensureLobbyChatState(this);
    const channel = CHAT_CHANNELS.some((entry) => entry.id === msg.channel) ? msg.channel : 'current';
    this.lobbyChatMessages.push({ ...msg, channel });
    if (this.lobbyChatMessages.length > 160) this.lobbyChatMessages.splice(0, this.lobbyChatMessages.length - 160);

    if (channel !== this.lobbyChatChannel) {
      this.root?.querySelector(`.lobby-chat-channel[data-channel="${channel}"]`)?.classList.add('has-unread');
    }
    renderLobbyMessages(this);
  };
}
