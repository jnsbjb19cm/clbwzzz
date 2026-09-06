export const ROOM_CHAT_STORAGE_KEY = 'clbwz_room_chat_history_20260906';

const MAX_ROOM_CHAT_LINES = 80;
const hydratedContainers = new WeakMap();

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readHistory(storage, storageKey) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry === 'string' && entry.length > 0)
      .slice(-MAX_ROOM_CHAT_LINES);
  } catch {
    return [];
  }
}

function writeHistory(storage, storageKey, history) {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(history.slice(-MAX_ROOM_CHAT_LINES)));
  } catch {
    // Storage may be unavailable (private mode / quota). Chat must keep working in-memory/DOM.
  }
}

function appendHtml(container, html) {
  if (!container || !html) return;
  if (typeof container.insertAdjacentHTML === 'function') {
    container.insertAdjacentHTML('beforeend', html);
  }
}

function scrollToBottom(container) {
  if (!container) return;
  try {
    container.scrollTop = container.scrollHeight;
  } catch {
    // Non-DOM test doubles may expose read-only scroll state.
  }
}

/**
 * Persist a room-chat row before touching the visible DOM. This deliberately works even when
 * the room chat container has not mounted yet; the next mounted container is hydrated first.
 */
export function appendRoomChatMessage({
  storage = null,
  storageKey = ROOM_CHAT_STORAGE_KEY,
  messageHtml = '',
  container = null,
} = {}) {
  const targetStorage = resolveStorage(storage);
  const key = String(storageKey || ROOM_CHAT_STORAGE_KEY);
  const history = readHistory(targetStorage, key);
  const html = String(messageHtml || '');

  if (html) {
    history.push(html);
    if (history.length > MAX_ROOM_CHAT_LINES) {
      history.splice(0, history.length - MAX_ROOM_CHAT_LINES);
    }
    writeHistory(targetStorage, key, history);
  }

  if (!container) return history.length;

  const hydratedKey = hydratedContainers.get(container);
  if (hydratedKey !== key) {
    for (const rowHtml of history) appendHtml(container, rowHtml);
    hydratedContainers.set(container, key);
  } else if (html) {
    appendHtml(container, html);
  }

  scrollToBottom(container);
  return history.length;
}

/** Hydrate a newly mounted room-chat container without creating a synthetic message. */
export function hydrateRoomChatHistory({
  storage = null,
  storageKey = ROOM_CHAT_STORAGE_KEY,
  container = null,
} = {}) {
  return appendRoomChatMessage({ storage, storageKey, container, messageHtml: '' });
}

/** Explicit authenticated-session exit is the only lifecycle point that clears room history. */
export function clearRoomChatOnSessionExit({
  storage = null,
  storageKey = ROOM_CHAT_STORAGE_KEY,
} = {}) {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return;
  try {
    targetStorage.removeItem(String(storageKey || ROOM_CHAT_STORAGE_KEY));
  } catch {
    // Ignore unavailable storage; logout itself must never be blocked by chat cleanup.
  }
}
