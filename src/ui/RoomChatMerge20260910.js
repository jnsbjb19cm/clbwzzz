/**
 * 2026-09-10：战斗准备房间聊天合并。
 * 2026-09-11：改为「单一合并日志」并加清屏（按用户反馈）。
 *
 * 房间里有好几套聊天补丁叠在一起，历史问题：
 *   - 大厅聊天 `.lobby-chat` 进房间后只是被 hidden，DOM 还在；
 *   - `RoomChatChannelFix` / `RoomChatRuntimePatch` 在切换频道 / 收到快照时会
 *     `replaceChildren()` 只重放「当前频道」，其它频道消息立刻消失；
 *   - `DeckSelectView.render()` 每次房间快照刷新都会重建整个 `.game-room`，
 *     连带把聊天日志整块清掉（只剩 BattleRoomExact 的欢迎语）。
 *
 * 本补丁是最后安装的一层，直接**接管房间聊天日志**：
 *   - 每个 RoomView 维护一份 `entries`（当前/队伍/系统/世界/公会/私聊都进同一份）；
 *   - 切换频道只改发送目标与高亮，永远不动日志内容；
 *   - 房间 DOM 被重建后，在 `clbwz:room-exact-ready` 上把 entries 重新贴回去；
 *   - 提供「清屏」按钮，清空日志与本地记录（之后可继续收新消息）；
 *   - 世界/公会/私聊沿用大厅的 socket 通道（lobby:chat）。
 * 同时保留原有职责：进房间时把重复的 `.lobby-chat` 从 DOM 摘下来，退出再挂回。
 */
import { authStore } from '../core/AuthStore.js';
import { containsBlockedWord, maskBlockedWords } from '../core/ContentFilter.js';
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

const LOBBY_CHANNELS = new Set(['world', 'guild', 'private']);

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

/** 把来自 socket / 快照的消息归一到六个频道之一。 */
function normalizeIncomingChannel(message = {}) {
  if (message?.system || String(message?.nickname ?? '').trim() === '系统') return 'system';
  const raw = String(message?.channel ?? message?.type ?? '').trim().toLowerCase();
  if (raw === '当前' || raw === 'current' || raw === '') return 'current';
  if (raw === '队伍' || raw === 'team') return 'team';
  if (raw === '系统' || raw === 'system') return 'system';
  if (raw === '世界' || raw === 'world') return 'world';
  if (raw === '公会' || raw === 'guild') return 'guild';
  if (raw === '私聊' || raw === 'private') return 'private';
  return 'current';
}

/** 每个 RoomView 一份聊天记录（跨房间 DOM 重建保留）。 */
function chatState(view) {
  if (!view.__roomChatState20260911) {
    view.__roomChatState20260911 = { entries: [], seenIds: new Set(), localSeq: 0 };
  }
  return view.__roomChatState20260911;
}

function resetChatState(view) {
  view.__roomChatState20260911 = { entries: [], seenIds: new Set(), localSeq: 0 };
}

function entryKey(entry) {
  return entry.id ? `id:${entry.id}` : null;
}

function recordRoomMessage(view, message = {}) {
  // 2026-09-11：显示兜底——收到的（或被绕过的）消息里的违规词一律打码。
  const text = maskBlockedWords(cleanText(message.text ?? message.message));
  if (!text) return null;
  const state = chatState(view);
  const channel = normalizeIncomingChannel(message);
  const rawId = String(message.id ?? message.messageId ?? message.chatId ?? '').trim();
  const id = rawId || `local-${++state.localSeq}`;
  const key = `id:${id}`;
  if (state.seenIds.has(key)) return null;
  state.seenIds.add(key);

  const entry = {
    id,
    channel,
    nickname: cleanText(message.nickname ?? message.username ?? message.sender) || '玩家',
    text,
    system: Boolean(message.system || channel === 'system'),
    spectator: Boolean(message.spectator),
  };
  state.entries.push(entry);
  if (state.entries.length > MAX_LOG_ROWS) {
    const dropped = state.entries.splice(0, state.entries.length - MAX_LOG_ROWS);
    for (const row of dropped) {
      const k = entryKey(row);
      if (k) state.seenIds.delete(k);
    }
  }
  return entry;
}

function createRoomChatRow(entry) {
  const row = document.createElement('div');
  row.className = `exact-room-chat-message channel-${entry.channel}${entry.system ? ' system' : ''}`;
  const name = document.createElement('b');
  const prefix = entry.system
    ? '[系统] '
    : entry.channel === 'current'
      ? ''
      : `[${CHANNEL_LABEL[entry.channel] ?? entry.channel}] `;
  name.textContent = `${prefix}${entry.spectator ? '[观战] ' : ''}${entry.nickname || '玩家'}：`;
  const span = document.createElement('span');
  span.textContent = entry.text;
  row.append(name, span);
  return row;
}

function scrollRoomChatToBottom(log = null) {
  const target = log ?? chatLog({ root: document });
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

/**
 * 把当前 RoomView 的全部记录画进日志。
 * 内容没变就跳过 replaceChildren，避免切换频道/快照刷新时闪一下或丢滚动位置。
 */
function renderRoomChat(view) {
  const log = chatLog(view);
  if (!log) return false;
  const entries = chatState(view).entries;
  const signature = entries.map((entry) => `${entry.id}|${entry.channel}|${entry.text}`).join('\n');
  if (log.dataset.chatSignature20260911 === signature
    && log.childElementCount === entries.length && entries.length > 0) {
    return true;
  }
  log.replaceChildren();
  for (const entry of entries) log.append(createRoomChatRow(entry));
  log.dataset.chatSignature20260911 = signature;
  scrollRoomChatToBottom(log);
  return true;
}

function clearRoomChat(view) {
  resetChatState(view);
  // 清屏后在当前房间内不再从快照把旧历史补回来（新消息照常接收显示）。
  view.__roomChatCleared20260911 = true;
  const log = chatLog(view);
  if (log) {
    log.replaceChildren();
    log.dataset.chatSignature20260911 = '';
  }
}

/** 首次进房间时补一条系统欢迎 + 服务端公开历史（current/team/system）。 */
function hydrateRoomChat(view) {
  if (!view?.room || view.__roomChatCleared20260911) return;
  const state = chatState(view);
  if (!state.entries.length) {
    recordRoomMessage(view, { id: 'local-welcome', nickname: '系统', text: '欢迎进入战斗房间。', system: true });
  }
  for (const message of Array.isArray(view.room.chat) ? view.room.chat : []) {
    recordRoomMessage(view, message);
  }
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

/**
 * 切换频道：只改发送目标与高亮，**不碰日志内容**（用户明确要求切换不刷新信息）。
 */
function selectChannel(view, value) {
  const chat = roomChat(view);
  if (!chat) return;
  const id = Object.hasOwn(CHANNEL_LABEL, value) ? value : 'current';
  // 记住选择：房间 DOM 被快照刷新重建后要恢复到同一频道。
  view.__roomChatActiveChannel20260911 = id;

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

/** 在标题行右侧补一个「清屏」按钮（房间 DOM 重建后会自动补回）。 */
function ensureClearButton(view, chat) {
  let button = chat.querySelector('.exact-room-chat-clear');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'exact-room-chat-clear';
    button.textContent = '清屏';
    button.title = '清空聊天记录';
    chat.querySelector('.exact-room-chat-head')?.append(button);
  }
  if (button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearRoomChat(view);
  });
}

function installUi(view) {
  const chat = roomChat(view);
  if (!chat) return;

  // 无障碍：把日志声明成 live log，只播报新增消息。
  const log = chat.querySelector('.exact-room-chat-log');
  if (log) {
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-relevant', 'additions');
    log.setAttribute('aria-atomic', 'false');
    log.setAttribute('aria-label', '房间聊天记录');
  }

  ensureClearButton(view, chat);

  if (chat.dataset.mergeChat20260910 !== '1') {
    chat.dataset.mergeChat20260910 = '1';
    const tabs = chat.querySelector('.exact-room-chat-tabs');
    // 捕获阶段拦下频道点击：既更新本站，也避免上层补丁按旧频道重放日志（会清空历史）。
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

  // 房间 DOM 重建后优先恢复用户上次选的频道（activeChannel 此时只会读到 HTML 默认的「当前」）。
  selectChannel(view, view.__roomChatActiveChannel20260911 ?? activeChannel(view));
  renderRoomChat(view);
  // 装配完成后挂上「新消息自动置底」观察器（隐藏时追加也能在显示后补上）
  watchRoomChatScroll(chat);
}

function handleRoomChatSend(view, detail = {}) {
  const text = cleanText(detail.message);
  if (!text) return;
  // 2026-09-11：发送前拦截违规词（服务端还有一层同样的校验）。
  if (containsBlockedWord(text)) {
    view.notice?.('消息包含违规词汇，已拦截');
    return;
  }
  // BattleRoomExact 自己的频道闭包会被本补丁的捕获监听拦住而不更新，
  // 所以发送目标一律以「当前高亮的标签」为准。
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
  if (LOBBY_CHANNELS.has(id)) {
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

const CHAT_SCROLL_FLAG = Symbol.for('clbwz.roomChatScroll20260911');

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

  // 房间 DOM 被 DeckSelectView 整块重建后，BattleRoomExact 会重新装配聊天并广播 ready。
  const onRoomExactReady = (view) => {
    scheduleInstall(view);
    // 新 DOM 可能先画了欢迎语，这里覆盖成统一的记录。
    queueMicrotask(() => renderRoomChat(view));
  };

  // 全局系统公告：房间内也落进「系统」频道（之前只在 detached 的大厅列表里更新，房间看不到）。
  window.addEventListener('clbwz:system-announcement', (event) => {
    const view = window.__activeRoomView;
    if (!view?.room) return;
    const data = event.detail || {};
    if (data.clear || !data.text) return;
    recordRoomMessage(view, {
      system: true,
      nickname: '系统',
      text: data.title ? `${data.title}：${data.text}` : data.text,
    });
    renderRoomChat(view);
  });

  const previousRenderRoomInside = RoomView.prototype.renderRoomInside;
  RoomView.prototype.renderRoomInside = function renderRoomInsideMergedChat20260910(...args) {
    const result = previousRenderRoomInside.apply(this, args);
    queueMicrotask(() => scheduleInstall(this));
    return result;
  };

  const previousEnterRoom = RoomView.prototype.enterRoom;
  RoomView.prototype.enterRoom = function enterRoomMergedChat20260910(...args) {
    // 新房间的聊天从空白开始，不要带上一个房间的消息。
    resetChatState(this);
    this.__roomChatPrivateTarget20260910 = null;
    this.__roomChatCleared20260911 = false;
    this.__roomChatActiveChannel20260911 = 'current';
    const result = previousEnterRoom.apply(this, args);
    window.__activeRoomView = this;
    detachLobbyChat(this);
    hydrateRoomChat(this);
    if (!this._roomChatReady20260911) {
      this._roomChatReady20260911 = () => onRoomExactReady(this);
      this.root?.addEventListener?.('clbwz:room-exact-ready', this._roomChatReady20260911);
    }
    queueMicrotask(() => scheduleInstall(this));
    return result;
  };

  const previousExitRoom = RoomView.prototype.exitRoom;
  RoomView.prototype.exitRoom = function exitRoomMergedChat20260910(...args) {
    if (window.__activeRoomView === this) window.__activeRoomView = null;
    resetChatState(this);
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
    if (!this._roomChatReady20260911) {
      this._roomChatReady20260911 = () => onRoomExactReady(this);
      this.root?.addEventListener?.('clbwz:room-exact-ready', this._roomChatReady20260911);
    }
    installUi(this);
    return result;
  };

  /**
   * 房间内由本补丁独占：直接写自己的统一日志。
   * 不再调用旧链路（LobbyChatPatch 只会把当前频道贴进房间日志、团队/系统会漏），
   * 也从根上避免旧补丁按频道 replaceChildren 清历史。
   */
  const previousAppendChat = RoomView.prototype.appendChat;
  RoomView.prototype.appendChat = function appendChatMerged20260910(message = {}) {
    if (!this.room) return previousAppendChat.call(this, message);
    if (!message) return undefined;
    const entry = recordRoomMessage(this, message);
    if (entry) renderRoomChat(this);
    return undefined;
  };

  // 房间快照刷新会重建房间 DOM（聊天日志被整块换掉），重建后把记录补回去。
  const previousRefreshRoom = RoomView.prototype.refreshRoom;
  RoomView.prototype.refreshRoom = function refreshRoomMergedChat20260910(...args) {
    const result = previousRefreshRoom.apply(this, args);
    hydrateRoomChat(this);
    // 房间 DOM 已在 refreshRoom 里重建；installUi 会按记住的频道恢复选中态并重贴记录。
    scheduleInstall(this);
    return result;
  };

  const previousDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyMergedChat20260910(...args) {
    if (retryHandle) cancelAnimationFrame(retryHandle);
    retryHandle = 0;
    if (window.__activeRoomView === this) window.__activeRoomView = null;
    if (this._roomChatReady20260911) {
      this.root?.removeEventListener?.('clbwz:room-exact-ready', this._roomChatReady20260911);
      this._roomChatReady20260911 = null;
    }
    this.__roomChatPrivateTarget20260910 = null;
    this.__roomChatCleared20260911 = false;
    this.__roomChatActiveChannel20260911 = 'current';
    this.__lobbyChatDetached20260910 = null;
    resetChatState(this);
    return previousDestroy.apply(this, args);
  };

  // 验证/调试用：允许直接用任意 root 装配一次合并聊天 UI。
  window.__installRoomChatMergeUi20260910 = (view) => installUi(view);
  // 验证/调试用：手动置底 / 查看观察器状态
  window.__scrollRoomChatToBottom20260911 = () => scrollRoomChatToBottom();
  window.__roomChatScrollWatching20260911 = () => Boolean(
    document.querySelector('.game-room.room-exact')?.[CHAT_SCROLL_FLAG],
  );
  // 验证/调试用：读取/清空当前房间聊天记录
  window.__roomChatEntries20260911 = (view = window.__activeRoomView) => (
    view?.__roomChatState20260911?.entries ?? []
  );

  window.__verifyRoomChatMerge20260910 = () => {
    const chat = document.querySelector('.game-room.room-exact .exact-room-chat');
    return {
      enabled: true,
      tabs: [...(chat?.querySelectorAll('.exact-room-chat-tabs button') ?? [])].map((b) => b.dataset.mergeChannel),
      hasClearButton: Boolean(chat?.querySelector('.exact-room-chat-clear')),
      rows: chat?.querySelectorAll('.exact-room-chat-message').length ?? 0,
      duplicatedLobbyChatInRoom: Boolean(
        document.querySelector('.game-room.room-exact .lobby-chat')
        || document.querySelector('#lobby-room-inside .lobby-chat'),
      ),
    };
  };
}
