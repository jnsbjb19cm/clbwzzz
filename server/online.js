// 简单在线用户注册表：Socket 连接/断开时维护，供好友“是否在线”查询。
const onlineUsers = new Set();

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
