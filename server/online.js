// 简单在线用户注册表：Socket 连接/断开时维护，供好友“是否在线”查询和频道定向推送。
const onlineUsers = new Set();
const userSockets = new Map(); // userId -> Set<socketId>

export function markOnline(userId) {
  const id = Number(userId);
  if (Number.isFinite(id)) onlineUsers.add(id);
}

export function markOffline(userId) {
  const id = Number(userId);
  if (Number.isFinite(id)) onlineUsers.delete(id);
}

export function isOnline(userId) {
  return onlineUsers.has(Number(userId));
}

export function onlineUserIds() {
  return [...onlineUsers];
}

export function registerSocket(userId, socketId) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return;
  markOnline(id);
  if (!userSockets.has(id)) userSockets.set(id, new Set());
  userSockets.get(id).add(socketId);
}

export function unregisterSocket(userId, socketId) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return;
  const sockets = userSockets.get(id);
  if (sockets) {
    sockets.delete(socketId);
    if (!sockets.size) userSockets.delete(id);
  }
  if (!userSockets.has(id)) markOffline(id);
}

export function socketsForUser(userId) {
  return [...(userSockets.get(Number(userId)) ?? [])];
}
