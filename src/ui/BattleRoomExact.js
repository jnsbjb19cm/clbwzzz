const ROOM_SELECTOR = '.game-room';
const CHAT_EVENT = 'clbwz:room-chat-message';
const CHAT_SEND_EVENT = 'clbwz:room-chat-send';

const LEGACY_DRAWER_SELECTORS = [
  '.exact-drawer-category',
  '.exact-drawer-pager',
  '.exact-drawer-footer',
  '.exact-drawer-filter',
  '.room-card-filter-toolbar',
  '.room-drawer-track',
  '.drawer-slide-grip',
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function showRoomHint(room, message) {
  let toast = room.querySelector('.room-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'room-toast';
    room.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(room.__exactToastTimer);
  room.__exactToastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function syncRoomLabels(room) {
  // Reference UI shows one fixed title only. Room id remains available in
  // #room-id-display for chat/socket logic but must not leak into the visible title.
  const title = room.querySelector('.room-title-text');
  if (title) title.textContent = '房间';

  const stage = room.querySelector('#room-stage-display');
  if (stage && !/[【\[]/.test(stage.textContent) && room.dataset.mode !== 'pvp' && room.dataset.mode !== 'pve') {
    stage.textContent = `${stage.textContent.trim()} [简单]`;
  }

  const readyText = room.querySelector('#room-ready-btn .ready-text');
  const readyButton = room.querySelector('#room-ready-btn');
  if (readyButton && readyText) {
    readyButton.setAttribute('aria-label', readyText.textContent.trim());
  }
}

function appendChatMessage(room, { channel = '当前', name = '系统', message = '', system = false } = {}) {
  const log = room.querySelector('.exact-room-chat-log');
  if (!log || !message) return;
  const row = document.createElement('div');
  row.className = `exact-room-chat-message${system ? ' system' : ''}`;
  row.innerHTML = `<span class="chat-channel">[${escapeHtml(channel)}]</span><b>${escapeHtml(name)}：</b><span>${escapeHtml(message)}</span>`;
  log.appendChild(row);
  while (log.children.length > 80) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
}

function installChat(room) {
  if (room.querySelector('.exact-room-chat')) return;

  const chat = document.createElement('section');
  chat.className = 'exact-room-chat';
  chat.setAttribute('aria-label', '房间聊天');
  chat.innerHTML = `
    <div class="exact-room-chat-tabs" role="tablist" aria-label="聊天频道">
      <button type="button" class="active" data-channel="当前">当前</button>
      <button type="button" data-channel="队伍">队伍</button>
      <button type="button" data-channel="系统">系统</button>
    </div>
    <div class="exact-room-chat-log" aria-live="polite"></div>
    <form class="exact-room-chat-form">
      <span class="exact-room-chat-current">当前</span>
      <input maxlength="120" autocomplete="off" placeholder="输入聊天内容" aria-label="聊天内容" />
      <button type="submit" title="发送">发送</button>
    </form>
  `;
  room.appendChild(chat);

  let channel = '当前';
  chat.querySelectorAll('.exact-room-chat-tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      channel = button.dataset.channel || '当前';
      chat.querySelectorAll('.exact-room-chat-tabs button').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      const current = chat.querySelector('.exact-room-chat-current');
      if (current) current.textContent = channel;
    });
  });

  chat.querySelector('form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = chat.querySelector('input');
    const message = input?.value.trim();
    if (!message) return;
    input.value = '';
    window.dispatchEvent(new CustomEvent(CHAT_SEND_EVENT, {
      detail: {
        channel,
        message,
        roomId: room.querySelector('#room-id-display')?.textContent?.trim() || null,
      },
    }));
  });

  appendChatMessage(room, { channel: '系统', name: '系统', message: '欢迎进入战斗房间。', system: true });
}

function removeLegacyDrawerChrome(room) {
  for (const selector of LEGACY_DRAWER_SELECTORS) {
    room.querySelectorAll(selector).forEach((element) => element.remove());
  }
  const drawer = room.querySelector('#card-drawer');
  if (drawer) {
    delete drawer.dataset.exactChrome;
    delete drawer.__exactRefresh;
  }
}

function addExactLabels(room) {
  room.querySelector('.dice-btn')?.setAttribute('data-exact-label', '随机地图');
  room.querySelector('.skill-btn')?.setAttribute('data-exact-label', '技能');
  room.querySelector('.team-btn')?.setAttribute('data-exact-label', '换队');
  room.querySelectorAll('.deck-tab').forEach((tab) => {
    tab.setAttribute('role', 'radio');
    tab.setAttribute('aria-checked', String(tab.classList.contains('active')));
  });
}

function enhanceRoom(room) {
  if (!(room instanceof HTMLElement)) return;
  removeLegacyDrawerChrome(room);

  if (room.dataset.exactRoom === '1') {
    syncRoomLabels(room);
    addExactLabels(room);
    return;
  }

  room.dataset.exactRoom = '1';
  room.classList.add('room-exact');
  syncRoomLabels(room);
  installChat(room);
  addExactLabels(room);
  room.dispatchEvent(new CustomEvent('clbwz:room-exact-ready', { bubbles: true }));
}

export function installExactBattleRoom() {
  let scanScheduled = false;
  const scan = () => {
    scanScheduled = false;
    document.querySelectorAll(ROOM_SELECTOR).forEach(enhanceRoom);
  };
  const scheduleScan = () => {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scan);
  };

  const observer = new MutationObserver(scheduleScan);
  const start = () => {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.addEventListener(CHAT_EVENT, (event) => {
    const room = document.querySelector(`${ROOM_SELECTOR}.room-exact`);
    if (room) appendChatMessage(room, event.detail || {});
  });

  window.addEventListener('error', (event) => {
    const room = document.querySelector(`${ROOM_SELECTOR}.room-exact`);
    if (room && event.error) showRoomHint(room, '房间界面发生错误，请刷新后重试');
  });

  return () => observer.disconnect();
}
