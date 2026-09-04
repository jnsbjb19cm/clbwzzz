import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleChatOverlay');
const MINIMIZED_KEY = 'clbwz_battle_chat_minimized';
const MAX_LOG_ITEMS = 80;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getChatSocket(view) {
  // 优先使用房间共享 socket（已在服务端 room 中，能收到 room:chat 回显）。
  return view.pvp?.socket || view.pvpSocket || null;
}

function appendSystemMessage(shell, text) {
  appendChatMessage(shell, { nickname: '系统', text, system: true });
}

function appendChatMessage(shell, message) {
  const log = shell?.querySelector('.battle-chat-log');
  if (!log || !message?.text) return;
  const row = document.createElement('div');
  row.className = `battle-chat-message${message.system ? ' system' : ''}`;
  row.innerHTML = `<b>${escapeHtml(message.nickname || '')}：</b><span>${escapeHtml(message.text)}</span>`;
  log.appendChild(row);
  while (log.children.length > MAX_LOG_ITEMS) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;

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

function mountBattleChatOverlay(view) {
  if (view.__battleChatMounted && view.__battleChatShell?.isConnected) return;
  const socket = getChatSocket(view);
  if (!socket) return;

  // 清理上一场残留的聊天层，再按当前战斗创建新层。
  unmountBattleChatOverlay(view);
  view.__battleChatMounted = true;

  const shell = document.createElement('div');
  shell.className = 'battle-chat-shell';
  shell.setAttribute('data-battle-chat-shell', '');
  shell.innerHTML = `
    <section class="battle-chat-panel" aria-label="战斗聊天">
      <header class="battle-chat-header">
        <span class="battle-chat-title">战斗聊天</span>
        <button type="button" class="battle-chat-min" aria-label="收起聊天" title="收起聊天">—</button>
      </header>
      <div class="battle-chat-log" aria-live="polite"></div>
      <form class="battle-chat-form">
        <input type="text" maxlength="200" autocomplete="off" aria-label="聊天消息" placeholder="输入消息，Enter 发送" ${view.pvp?.spectator ? 'disabled' : ''} />
        <button type="submit" ${view.pvp?.spectator ? 'disabled' : ''}>发送</button>
      </form>
    </section>
    <button type="button" class="battle-chat-toggle" aria-label="打开聊天" title="打开聊天">
      💬 聊天
      <span class="battle-chat-badge" aria-hidden="true"></span>
    </button>
  `;

  document.body.appendChild(shell);
  view.__battleChatShell = shell;
  shell.dataset.unread = '0';

  shell.querySelector('.battle-chat-min')?.addEventListener('click', () => {
    setMinimized(shell, true);
  });
  shell.querySelector('.battle-chat-toggle')?.addEventListener('click', () => {
    setMinimized(shell, false);
  });

  shell.querySelector('.battle-chat-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (view.pvp?.spectator) return;
    const input = shell.querySelector('.battle-chat-form input');
    const text = input?.value.trim();
    if (!text) return;
    input.value = '';
    const send = socket.sendChat
      ? Promise.resolve(socket.sendChat(text)).catch((error) => {
        appendSystemMessage(shell, error?.message || '发送失败');
      })
      : new Promise((resolve) => {
        socket.emit('room:chat', { text }, (response) => {
          if (response?.ok === false) appendSystemMessage(shell, response?.message || '发送失败');
          resolve();
        });
      });
    void send;
  });

  const onChat = (message) => appendChatMessage(shell, message || {});
  const unsub = socket.on('room:chat', onChat);
  view.__battleChatUnsub = typeof unsub === 'function' ? unsub : () => socket.off('room:chat', onChat);

  for (const entry of (view.pvp?.room?.chat ?? []).slice(-20)) {
    appendChatMessage(shell, {
      nickname: entry?.nickname || '玩家',
      text: entry?.text || '',
    });
  }
  appendSystemMessage(shell, '战斗聊天已开启');

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
  });
}
