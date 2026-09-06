const MAX_ROOM_CHAT_MESSAGES_20260906 = 50;
export const ROOM_CHAT_STORAGE_KEY = 'clbwz_room_chat_history_20260906';

function normalizeRoomChatMessage20260906(view, message = {}) {
  const text = String(message.text ?? message.message ?? '').trim();
  if (!text) return null;

  let id = String(message.id ?? message.messageId ?? message.chatId ?? '').trim();
  if (!id) {
    view._roomChatSyntheticId20260906 = (Number(view._roomChatSyntheticId20260906) || 0) + 1;
    id = `local-${view._roomChatSyntheticId20260906}`;
  }

  const rawChannel = String(message.channel ?? '').toLowerCase();
  const channel = message.system || rawChannel === 'system'
    ? 'system'
    : rawChannel === 'team'
      ? 'team'
      : 'current';
  const rawTeam = String(message.team ?? '').toLowerCase();
  const team = ['blue', 'red'].includes(rawTeam) ? rawTeam : null;

  return {
    ...message,
    id,
    nickname: String(message.nickname ?? message.username ?? message.sender ?? '玩家'),
    text,
    channel,
    team,
    system: Boolean(message.system || channel === 'system'),
  };
}

/**
 * Merge room-chat snapshots/events into the RoomView-owned cache.
 * Server message ids are authoritative for dedupe; local messages without an id receive
 * a per-view synthetic id so repeated DOM renders never manufacture duplicate rows.
 */
export function mergeRoomChatHistory20260906(view, messages = []) {
  if (!view || typeof view !== 'object') return [];
  if (!Array.isArray(view._roomChatHistory20260906)) view._roomChatHistory20260906 = [];

  const existingById = new Map(
    view._roomChatHistory20260906
      .filter((message) => message?.id != null)
      .map((message) => [String(message.id), message]),
  );

  for (const raw of Array.isArray(messages) ? messages : [messages]) {
    const message = normalizeRoomChatMessage20260906(view, raw);
    if (!message) continue;
    if (existingById.has(message.id)) continue;
    view._roomChatHistory20260906.push(message);
    existingById.set(message.id, message);
  }

  if (view._roomChatHistory20260906.length > MAX_ROOM_CHAT_MESSAGES_20260906) {
    view._roomChatHistory20260906.splice(
      0,
      view._roomChatHistory20260906.length - MAX_ROOM_CHAT_MESSAGES_20260906,
    );
  }
  return view._roomChatHistory20260906;
}

function createRoomChatRow20260906(message) {
  const row = document.createElement('div');
  const channel = message.system ? 'system' : (message.channel || 'current');
  const teamClass = message.team === 'blue' || message.team === 'red' ? ` team-${message.team}` : '';
  row.className = `exact-room-chat-message channel-${channel}${teamClass}${message.system ? ' system' : ''}`;

  const name = document.createElement('b');
  const spectatorPrefix = message.spectator ? '[观战] ' : '';
  const channelPrefix = channel === 'team' ? '[队伍] ' : channel === 'system' ? '[系统] ' : '';
  name.append(document.createTextNode(`${channelPrefix}${spectatorPrefix}${message.nickname || '玩家'}：`));
  row.append(name, document.createTextNode(String(message.text ?? '')));
  return row;
}

/**
 * Replay the cached structured messages after BattleRoomExact replaces the room DOM.
 * Returns false while the exact chat log is not mounted yet, allowing the ready event to retry.
 */
export function replayRoomChatHistory20260906(view) {
  const log = view?.root?.querySelector?.('.exact-room-chat-log');
  if (!log || typeof document === 'undefined') return false;

  if (!Array.isArray(view._roomChatHistory20260906)) view._roomChatHistory20260906 = [];
  log.replaceChildren();
  for (const message of view._roomChatHistory20260906) {
    log.append(createRoomChatRow20260906(message));
  }
  try { log.scrollTop = log.scrollHeight; } catch {}
  return true;
}

export const ROOM_CHAT_HISTORY_LIMIT_20260906 = MAX_ROOM_CHAT_MESSAGES_20260906;

// Compatibility exports for the interrupted first implementation. The active runtime patch below
// uses structured per-RoomView history, but keeping these names prevents an older loaded UI patch
// from breaking during a rolling client update.
const hydratedContainers = new WeakSet();

function resolveStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readStoredRows(storage, storageKey) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((row) => typeof row === 'string').slice(-50) : [];
  } catch {
    return [];
  }
}

export function appendRoomChatMessage({ storage = null, storageKey = ROOM_CHAT_STORAGE_KEY, messageHtml = '', container = null } = {}) {
  const target = resolveStorage(storage);
  const rows = readStoredRows(target, storageKey);
  const html = String(messageHtml || '');
  if (html) rows.push(html);
  while (rows.length > 50) rows.shift();
  try { target?.setItem(storageKey, JSON.stringify(rows)); } catch {}

  if (container && typeof container.insertAdjacentHTML === 'function') {
    if (!hydratedContainers.has(container)) {
      for (const row of rows) container.insertAdjacentHTML('beforeend', row);
      hydratedContainers.add(container);
    } else if (html) {
      container.insertAdjacentHTML('beforeend', html);
    }
    try { container.scrollTop = container.scrollHeight; } catch {}
  }
  return rows.length;
}

export function hydrateRoomChatHistory({ storage = null, storageKey = ROOM_CHAT_STORAGE_KEY, container = null } = {}) {
  return appendRoomChatMessage({ storage, storageKey, container, messageHtml: '' });
}

export function clearRoomChatOnSessionExit({ storage = null, storageKey = ROOM_CHAT_STORAGE_KEY } = {}) {
  const target = resolveStorage(storage);
  try { target?.removeItem(storageKey); } catch {}
}
