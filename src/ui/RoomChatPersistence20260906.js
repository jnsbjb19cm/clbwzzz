const MAX_ROOM_CHAT_MESSAGES_20260906 = 50;

function normalizeRoomChatMessage20260906(view, message = {}) {
  const text = String(message.text ?? message.message ?? '').trim();
  if (!text) return null;

  let id = String(message.id ?? message.messageId ?? message.chatId ?? '').trim();
  if (!id) {
    view._roomChatSyntheticId20260906 = (Number(view._roomChatSyntheticId20260906) || 0) + 1;
    id = `local-${view._roomChatSyntheticId20260906}`;
  }

  return {
    ...message,
    id,
    nickname: String(message.nickname ?? message.username ?? message.sender ?? '玩家'),
    text,
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
  row.className = `exact-room-chat-message${message.system ? ' system' : ''}`;

  const name = document.createElement('b');
  const spectatorPrefix = message.spectator ? '[观战] ' : '';
  name.append(document.createTextNode(`${spectatorPrefix}${message.nickname || '玩家'}：`));
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
