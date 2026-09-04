import { authStore } from '../core/AuthStore.js';
import { SocketClient } from '../network/SocketClient.js';

const DEFAULT_MESSAGES = [
  { tone: 'system', text: '欢迎进入丛林保卫战！' },
  { tone: 'system', text: '系统公告：强化与造卡成功信息会显示在这里。' },
  { tone: 'guild', text: '[公会] 森林守卫：今天也要守住我们的基地。' },
];

const DEFAULT_BROADCASTS = [
  '欢迎进入丛林保卫战，选择你要前往的区域。',
  '铁匠铺开放中：选择上方木牌进行造卡、强化、加工或拆解。',
];

const CHAT_CHANNELS = Object.freeze([
  { id: 'current', label: '当前' },
  { id: 'world', label: '世界' },
  { id: 'guild', label: '公会' },
  { id: 'private', label: '私聊' },
]);

function normalizeChatChannel(value) {
  return CHAT_CHANNELS.some((channel) => channel.id === value) ? value : 'current';
}

function chatChannelLabel(value) {
  return CHAT_CHANNELS.find((channel) => channel.id === normalizeChatChannel(value))?.label ?? '当前';
}

const chatRoots = new Set();
let lobbySocket = null;
let lobbyChatUnsubscribe = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function appendChatLine(root, text, tone = 'normal') {
  const log = root?.querySelector?.('[data-classic-chat-log]');
  if (!log) return;
  const line = document.createElement('p');
  line.className = `is-${tone}`;
  line.textContent = String(text ?? '');
  log.append(line);
  while (log.children.length > 80) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
}

function getLobbySocket() {
  if (lobbySocket) return lobbySocket;
  lobbySocket = new SocketClient({ getToken: () => authStore.token });
  lobbyChatUnsubscribe = lobbySocket.on('lobby:chat', (payload = {}) => {
    const nickname = payload.nickname ?? payload.username ?? payload.sender ?? '玩家';
    const message = payload.text ?? payload.message ?? '';
    if (!message) return;
    for (const root of [...chatRoots]) {
      if (!root?.isConnected) {
        chatRoots.delete(root);
        continue;
      }
      appendChatLine(root, `[${chatChannelLabel(payload.channel)}] ${nickname}：${message}`, 'normal');
    }
  });
  return lobbySocket;
}

export function classicBroadcastMarkup(messages = DEFAULT_BROADCASTS) {
  const items = (messages?.length ? messages : DEFAULT_BROADCASTS)
    .map((message) => `<b class="classic-broadcast-item">${escapeHtml(message)}</b>`)
    .join('<i aria-hidden="true">◆</i>');
  return `
    <div class="classic-system-broadcast" role="status" aria-label="系统广播">
      <span class="classic-broadcast-label">📣 系统广播</span>
      <span class="classic-broadcast-window">
        <span class="classic-broadcast-track">${items}<i aria-hidden="true">◆</i>${items}</span>
      </span>
    </div>`;
}

export function classicChatMarkup({ channel = '当前', messages = DEFAULT_MESSAGES } = {}) {
  return `
    <section class="classic-chat" aria-label="聊天栏">
      <div class="classic-chat-tools" aria-hidden="true">
        <button type="button" tabindex="-1">▲</button>
        <button type="button" tabindex="-1">▼</button>
        <button type="button" tabindex="-1">↧</button>
      </div>
      <div class="classic-chat-log" data-classic-chat-log>
        ${messages.map((message) => `<p class="is-${message.tone ?? 'normal'}">${escapeHtml(message.text)}</p>`).join('')}
      </div>
      <div class="classic-chat-compose">
        <button type="button" class="classic-chat-channel" data-classic-chat-channel>${escapeHtml(channel)}</button>
        <input type="text" maxlength="120" aria-label="聊天内容" placeholder="输入聊天内容" data-classic-chat-input />
        <button type="button" class="classic-chat-send" data-classic-chat-send aria-label="发送">↵</button>
        <button type="button" class="classic-chat-mini" aria-label="好友">♙</button>
        <button type="button" class="classic-chat-mini" aria-label="表情">☺</button>
      </div>
    </section>`;
}

export function bindClassicChat(root, { onSend } = {}) {
  if (!root) return () => {};
  chatRoots.add(root);
  const input = root.querySelector('[data-classic-chat-input]');
  const legacyChannel = root.querySelector('[data-classic-chat-channel]');
  const channelMenu = document.createElement('div');
  channelMenu.className = 'classic-chat-channel-menu';
  for (const channel of CHAT_CHANNELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'classic-chat-channel';
    button.dataset.classicChatChannel = channel.id;
    button.textContent = channel.label;
    button.classList.toggle('active', channel.id === 'current');
    channelMenu.append(button);
  }
  legacyChannel?.replaceWith(channelMenu);
  if (input) input.dataset.channel = 'current';
  const channelButtons = [...channelMenu.querySelectorAll('[data-classic-chat-channel]')];
  const selectChannel = (event) => {
    const channel = normalizeChatChannel(event.currentTarget.dataset.classicChatChannel);
    if (input) input.dataset.channel = channel;
    channelButtons.forEach((button) => button.classList.toggle(
      'active',
      button.dataset.classicChatChannel === channel,
    ));
  };
  channelButtons.forEach((button) => button.addEventListener('click', selectChannel));
  const socket = getLobbySocket();
  const diagnostics = window.__classicLobbyChatDiagnostics ?? {
    transport: 'lobby:chat',
    sendAttempts: 0,
    sendFailures: 0,
  };
  diagnostics.transport = 'lobby:chat';
  window.__classicLobbyChatDiagnostics = diagnostics;

  const send = async () => {
    const value = input?.value?.trim();
    if (!value) return;
    const channel = normalizeChatChannel(input?.dataset.channel);
    input.value = '';
    diagnostics.sendAttempts += 1;
    diagnostics.channel = channel;
    onSend?.(value, channel);
    let targetId = null;
    if (channel === 'private') {
      targetId = input?.dataset?.privateTarget ? Number(input.dataset.privateTarget) : null;
      if (!Number.isFinite(targetId) || targetId <= 0) {
        const friendData = await authStore.api.get('/social/friends').catch(() => ({ friends: [] }));
        const friends = friendData.friends ?? [];
        const hint = friends.map((f) => `${f.nickname || f.username}(${f.userId})`).join('、');
        const targetText = prompt(`选择私聊对象(可填好友昵称或ID)：\n${hint || '你还没有好友'}`);
        if (!targetText) return;
        const matched = friends.find((f) => String(f.nickname || f.username) === targetText.trim() || String(f.userId) === targetText.trim());
        targetId = matched ? Number(matched.userId) : Number(targetText);
        if (!Number.isFinite(targetId) || targetId <= 0) return;
        if (input) input.dataset.privateTarget = targetId;
      }
    }
    try {
      await socket.sendLobbyChat(value, channel, targetId);
    } catch (error) {
      diagnostics.sendFailures += 1;
      appendChatLine(root, `发送失败：${error?.message ?? '网络未连接'}`, 'system');
    }
  };

  const sendButton = root.querySelector('[data-classic-chat-send]');
  const keyHandler = (event) => {
    if (event.key === 'Enter') send();
  };
  sendButton?.addEventListener('click', send);
  input?.addEventListener('keydown', keyHandler);

  return () => {
    chatRoots.delete(root);
    channelButtons.forEach((button) => button.removeEventListener('click', selectChannel));
    sendButton?.removeEventListener('click', send);
    input?.removeEventListener('keydown', keyHandler);
  };
}

export function disposeClassicChatTransport() {
  lobbyChatUnsubscribe?.();
  lobbyChatUnsubscribe = null;
  lobbySocket?.disconnect?.();
  lobbySocket = null;
  chatRoots.clear();
}
