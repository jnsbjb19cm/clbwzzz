/**
 * 2026-09-10：战斗准备房间聊天合并。
 *
 * 此前房间里有两套聊天：大厅的 `.lobby-chat`（进房间后只是被加上 hidden，DOM 仍然存在）
 * 和房间自己的 `.exact-room-chat > .exact-room-chat-log`。这里把两者合并成一套：
 *  - 保留房间内的 `.exact-room-chat`，频道扩到 当前/队伍/系统/世界/公会/私聊 + 私聊对象；
 *  - 世界/公会/私聊沿用大厅的 socket 通道（lobby:chat），消息统一落进房间聊天日志；
 *  - 进入房间时把重复的 `.lobby-chat` 从 DOM 摘下来，退出房间再挂回去（节点与监听都保留）。
 */
import { authStore } from '../core/AuthStore.js';
import { RoomView } from './RoomView.js';
import './RoomChatMerge20260910.css';

const PATCH_FLAG = Symbol.for('clbwz.roomChatMerge20260910');
const MAX_LOG_ROWS = 120;

const CHANNEL_LABEL = Object.freeze({
  current: '当前',
  team: '队伍',
  system: '系统',
  world: '世界',
  guild: '公会',
  private: '私聊',
});

function cleanText(value) {
  return String(value ?? '')
    .replace(/%NAN\b/gi, '')
    .replace(/%NULL\b/gi, '')
    .replace(/\u0000/g, '')
    .trim();
}

function roomChat(view) {
  return view?.root?.querySelector?.('.game-room .exact-room-chat') ?? null;
}

function activeChannel(view) {
  const id = roomChat(view)?.querySelector?.('.exact-room-chat-tabs button.active')?.dataset?.mergeChannel;
  return Object.hasOwn(CHANNEL_LABEL, id) ? id : 'current';
}

function chatLog(view) {
  return roomChat(view)?.querySelector?.('.exact-room-chat-log') ?? null;
}

/** 大厅频道 id（世界/公会/私聊），其余返回 null。 */
function lobbyChannelOf(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'world' || raw === 'guild' || raw === 'private' ? raw : null;
}

function appendRoomLog(view, { channel = 'current', nickname = '玩家', text = '', system = false, spectator = false } = {}) {
  const log = chatLog(view);
  const body = cleanText(text);
  if (!log || !body) return false;
  const id = Object.hasOwn(CHANNEL_LABEL, channel) ? channel : 'current';
  const row = document.createElement('div');
  row.className = `exact-room-chat-message channel-${id}${system ? ' system' : ''}`;
  const name = document.createElement('b');
  const prefix = system ? '[系统] ' : id === 'current' ? '' : `[${CHANNEL_LABEL[id]}] `;
  name.textContent = `${prefix}${spectator ? '[观战] ' : ''}${cleanText(nickname) || '玩家'}：`;
  const span = document.createElement('span');
  span.textContent = body;
  row.append(name, span);
  log.append(row);
  while (log.children.length > MAX_LOG_ROWS) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
  return true;
}

/** 大厅频道消息只存在于客户端缓冲里，房间刷新重放日志时要重新贴回去，避免消息一闪就没。 */
function rememberExtra(view, entry) {
  if (!view || typeof view !== 'object') return;
  if (!Array.isArray(view.__roomChatExtras20260910)) view.__roomChatExtras20260910 = [];
  view.__roomChatExtras20260910.push(entry);
  if (view.__roomChatExtras20260910.length > MAX_LOG_ROWS) {
    view.__roomChatExtras20260910.splice(0, view.__roomChatExtras20260910.length - MAX_LOG_ROWS);
  }
}

function replayExtras(view) {
  const extras = view?.__roomChatExtras20260910;
  if (!Array.isArray(extras) || !extras.length || !chatLog(view)) return;
  for (const entry of extras) appendRoomLog(view, entry);
}

async function loadPrivateTargets(view) {
  const select = roomChat(view)?.querySelector?.('.exact-room-chat-private-select');
  if (!select || select.dataset.loaded === '1') return;
  select.dataset.loaded = '1';

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
  if (Number(view.__roomChatPrivateTarget20260910) > 0) {
    select.value = String(view.__roomChatPrivateTarget20260910);
  }
}

function selectChannel(view, value) {
  const chat = roomChat(view);
  if (!chat) return;
  const id = Object.hasOwn(CHANNEL_LABEL, value) ? value : 'current';

  chat.querySelectorAll('.exact-room-chat-tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mergeChannel === id);
  });

  const isPrivate = id === 'private';
  chat.dataset.privateVisible = isPrivate ? '1' : '0';
  chat.querySelector('.exact-room-chat-private')?.classList.toggle('hidden', !isPrivate);
  if (isPrivate) void loadPrivateTargets(view);

  const current = chat.querySelector('.exact-room-chat-current');
  if (current) current.textContent = CHANNEL_LABEL[id];

  const readOnly = id === 'system';
  const input = chat.querySelector('.exact-room-chat-form input');
  if (input) {
    input.disabled = readOnly;
    input.placeholder = readOnly ? '系统消息仅由服务器发送' : `发送到${CHANNEL_LABEL[id]}频道`;
  }
  const send = chat.querySelector('.exact-room-chat-form button');
  if (send) {
    send.disabled = readOnly;
    send.title = readOnly ? '系统频道不可发送消息' : `发送到${CHANNEL_LABEL[id]}频道`;
  }
}

function installUi(view) {
  const chat = roomChat(view);
  if (!chat) return;

  if (chat.dataset.mergeChat20260910 !== '1') {
    chat.dataset.mergeChat20260910 = '1';
    const tabs = chat.querySelector('.exact-room-chat-tabs');
    // 捕获阶段拦下频道点击：既更新本站，也避免上层补丁按旧频道重放日志。
    tabs?.addEventListener('click', (event) => {
      const button = event.target?.closest?.('.exact-room-chat-tabs button');
      if (!button) return;
      event.stopPropagation();
      selectChannel(view, button.dataset.mergeChannel);
    }, true);

    chat.querySelector('.exact-room-chat-private-select')?.addEventListener('change', (event) => {
      const id = Number(event.currentTarget.value);
      view.__roomChatPrivateTarget20260910 = Number.isFinite(id) && id > 0 ? id : null;
    });
  }

  selectChannel(view, activeChannel(view));
  // 2026-09-11：装配完成后挂上「新消息自动置底」观察器（隐藏时追加也能在显示后补上）
  watchRoomChatScroll(chat);
}

function handleRoomChatSend(view, detail = {}) {
  const text = cleanText(detail.message);
  if (!text) return;
  const id = activeChannel(view);

  if (id === 'system') {
    view.notice?.('系统频道仅显示服务器消息');
    return;
  }
  if (id === 'private') {
    const targetId = Number(view.__roomChatPrivateTarget20260910);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      void loadPrivateTargets(view);
      view.notice?.('请先选择私聊对象');
      return;
    }
    view.socket?.sendLobbyChat?.(text, 'private', targetId)
      ?.catch?.((error) => view.notice?.(error?.message || '私聊发送失败'));
    return;
  }
  if (id === 'world' || id === 'guild') {
    view.socket?.sendLobbyChat?.(text, id)?.catch?.((error) => view.notice?.(error?.message || '消息发送失败'));
    return;
  }
  view.sendText?.(text, id === 'team' ? 'team' : 'current');
}

/** 进房间时把重复的大厅聊天从 DOM 摘下来（节点本身保留，退出房间再挂回）。 */
function detachLobbyChat(view) {
  const stage = view?.root?.querySelector?.('.lobby-stage');
  const chat = stage?.querySelector?.(':scope > .lobby-chat');
  if (!chat || view.__lobbyChatDetached20260910) return;
  view.__lobbyChatDetached20260910 = chat;
  chat.remove();
}

function restoreLobbyChat(view) {
  const chat = view.__lobbyChatDetached20260910;
  if (!chat) return;
  view.__lobbyChatDetached20260910 = null;
  const stage = view?.root?.querySelector?.('.lobby-stage');
  if (stage && !stage.contains(chat)) stage.append(chat);
  // 分离期间聊天列表不参与 querySelector，挂回后按当前频道重绘一次。
  chat.querySelector('.lobby-chat-channel.active')?.click();
}

/**
 * 2026-09-11：保证「发出去的消息一定看得见」。
 *
 * 之前只在追加后写一次 `log.scrollTop = log.scrollHeight`，有两种情况会失效：
 *   1) 追加时聊天面板还处于隐藏（display:none）→ scrollHeight 为 0，scrollTop 被设成 0，
 *      面板显示出来后停在最上面；
 *   2) 房间 DOM 被其它补丁重建（innerHTML 换血）→ 新日志元素的 scrollTop 又是 0。
 * 这里改成用 MutationObserver 盯着日志：内容一变就置底；日志元素被换掉自动重新挂上；
 * 聊天区从隐藏变可见时（内容没变也算）再补一次置底。
 */
const CHAT_SCROLL_FLAG = Symbol.for('clbwz.roomChatScroll20260911');

function scrollRoomChatToBottom(log = null) {
  const target = log ?? document.querySelector('.game-room.room-exact .exact-room-chat-log');
  if (!target) return false;
  const apply = () => {
    try {
      target.scrollTop = target.scrollHeight;
    } catch {
      // 隐藏中或已卸载：忽略，下一次 mutation/可见性变化会再来一次
    }
  };
  apply();
  requestAnimationFrame(apply);
  return true;
}

function watchRoomChatScroll(root) {
  const room = root?.closest?.('.game-room.room-exact')
    ?? (root?.matches?.('.game-room.room-exact') ? root : null)
    ?? root?.querySelector?.('.game-room.room-exact')
    ?? null;
  if (!room || room[CHAT_SCROLL_FLAG]) return;
  room[CHAT_SCROLL_FLAG] = true;

  let watched = null;
  let observer = null;
  const attach = () => {
    const log = room.querySelector('.exact-room-chat-log');
    if (!log || log === watched) return;
    watched = log;
    observer?.disconnect();
    observer = new MutationObserver(() => scrollRoomChatToBottom(log));
    observer.observe(log, { childList: true });
    // 面板可能一开始是隐藏的：显示出来时补一次置底
    observer.observe(log.closest('.exact-room-chat') ?? room, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    scrollRoomChatToBottom(log);
  };

  // 日志元素本身可能被别的补丁重建，所以盯着房间的子树
  new MutationObserver(attach).observe(room, { childList: true, subtree: true });
  attach();
}

export function installRoomChatMerge20260910() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 房间 DOM 由 BattleRoomExact 异步装配，微任务里可能还没有 .exact-room-chat，
  // 这里用有限次 rAF 重试兜底。
  let retryHandle = 0;
  const scheduleInstall = (view, attempts = 20) => {
    if (roomChat(view)) {
      installUi(view);
      return;
    }
    if (attempts <= 0) return;
    retryHandle = requestAnimationFrame(() => scheduleInstall(view, attempts - 1));
  };

  const previousRenderRoomInside = RoomView.prototype.renderRoomInside;
  RoomView.prototype.renderRoomInside = function renderRoomInsideMergedChat20260910(...args) {
    const result = previousRenderRoomInside.apply(this, args);
    queueMicrotask(() => scheduleInstall(this));
    return result;
  };

  const previousEnterRoom = RoomView.prototype.enterRoom;
  RoomView.prototype.enterRoom = function enterRoomMergedChat20260910(...args) {
    // 新房间的聊天从空白开始，不要带上一个房间的大厅频道消息。
    this.__roomChatExtras20260910 = [];
    const result = previousEnterRoom.apply(this, args);
    detachLobbyChat(this);
    queueMicrotask(() => scheduleInstall(this));
    return result;
  };

  const previousExitRoom = RoomView.prototype.exitRoom;
  RoomView.prototype.exitRoom = function exitRoomMergedChat20260910(...args) {
    this.__roomChatExtras20260910 = [];
    restoreLobbyChat(this);
    return previousExitRoom.apply(this, args);
  };

  // 观战退出同样会回到大厅，也要把摘下来的大厅聊天挂回去。
  for (const method of ['exitSpectatorBattle', 'exitSpectatorBattleSilent']) {
    const previous = RoomView.prototype[method];
    if (typeof previous !== 'function') continue;
    RoomView.prototype[method] = function exitSpectatorMergedChat20260910(...args) {
      restoreLobbyChat(this);
      return previous.apply(this, args);
    };
  }

  const previousBindRoomChat = RoomView.prototype.bindRoomChat;
  RoomView.prototype.bindRoomChat = function bindRoomChatMerged20260910(...args) {
    const result = previousBindRoomChat.apply(this, args);
    if (this.chatSendHandler) window.removeEventListener('clbwz:room-chat-send', this.chatSendHandler);
    this.chatSendHandler = (event) => handleRoomChatSend(this, event.detail || {});
    window.addEventListener('clbwz:room-chat-send', this.chatSendHandler);
    installUi(this);
    return result;
  };

  const previousAppendChat = RoomView.prototype.appendChat;
  RoomView.prototype.appendChat = function appendChatMerged20260910(message = {}) {
    const result = previousAppendChat.call(this, message);
    if (!message || !this.room) return result;
    const channel = lobbyChannelOf(message.channel);
    if (!channel) return result; // 当前/队伍/系统已由既有链路写进房间聊天
    const entry = {
      channel,
      nickname: message.nickname ?? message.username ?? message.sender ?? '玩家',
      text: message.text ?? message.message,
      spectator: Boolean(message.spectator),
    };
    appendRoomLog(this, entry);
    rememberExtra(this, entry);
    return result;
  };

  // 房间快照刷新会重放房间历史（replaceChildren），把大厅频道的消息补回去。
  const previousRefreshRoom = RoomView.prototype.refreshRoom;
  RoomView.prototype.refreshRoom = function refreshRoomMergedChat20260910(...args) {
    const result = previousRefreshRoom.apply(this, args);
    replayExtras(this);
    return result;
  };

  const previousDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyMergedChat20260910(...args) {
    if (retryHandle) cancelAnimationFrame(retryHandle);
    retryHandle = 0;
    this.__roomChatPrivateTarget20260910 = null;
    this.__lobbyChatDetached20260910 = null;
    return previousDestroy.apply(this, args);
  };

  // 验证/调试用：允许直接用任意 root 装配一次合并聊天 UI。
  window.__installRoomChatMergeUi20260910 = (view) => installUi(view);
  // 验证/调试用：手动置底 / 查看观察器状态
  window.__scrollRoomChatToBottom20260911 = () => scrollRoomChatToBottom();
  window.__roomChatScrollWatching20260911 = () => Boolean(
    document.querySelector('.game-room.room-exact')?.[CHAT_SCROLL_FLAG],
  );

  window.__verifyRoomChatMerge20260910 = () => {
    const chat = document.querySelector('.game-room.room-exact .exact-room-chat');
    return {
      enabled: true,
      tabs: [...(chat?.querySelectorAll('.exact-room-chat-tabs button') ?? [])].map((b) => b.dataset.mergeChannel),
      duplicatedLobbyChatInRoom: Boolean(
        document.querySelector('.game-room.room-exact .lobby-chat')
        || document.querySelector('#lobby-room-inside .lobby-chat'),
      ),
    };
  };
}
