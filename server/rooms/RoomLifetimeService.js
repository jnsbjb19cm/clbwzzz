import { roomManager } from './RoomManager.js';

/** 房间从 createdAt 起最多存在 2 小时。 */
export const ROOM_LIFETIME_MS = 2 * 60 * 60 * 1000;
const ORPHAN_SWEEP_INTERVAL_MS = 15_000;

function realMembersOf(room) {
  return [...(room?.members?.values?.() ?? [])].filter((member) => member?.isBot !== true);
}

/** 完整销毁，避免 userRoom 残留导致玩家被误判为仍在旧房间。 */
function fullyDestroyRoom(room) {
  if (!room) return false;

  if (room._lifetimeTimer) clearTimeout(room._lifetimeTimer);
  room._lifetimeTimer = null;

  for (const member of room.members?.values?.() ?? []) {
    if (member?.disconnectTimer) clearTimeout(member.disconnectTimer);
    if (member?.isBot !== true) roomManager.userRoom.delete(Number(member.userId));
  }

  room.members?.clear?.();
  roomManager.rooms.delete(Number(room.id));
  return true;
}

/**
 * 房间生命周期：
 * 1. 每个房间创建时设置精确的 2 小时 setTimeout，时间一到立即解散；
 * 2. 另外每 15 秒回收“真人已经全部离开、只剩人机”的随机匹配死房间。
 */
export function startRoomLifetimeService(io, { stopBattle } = {}) {
  let stopped = false;
  const originalCreateRoom = roomManager.createRoom.bind(roomManager);

  const expire = (room, reason) => {
    const roomId = Number(room?.id);
    if (!roomId || !roomManager.getRoom(roomId)) return false;

    const isLifetime = reason === 'lifetime';
    const message = isLifetime
      ? '房间已达到 2 小时存在上限，已自动解散。'
      : '房间内已没有真人玩家，系统已自动回收该房间。';

    try {
      io?.to?.(`room:${roomId}`)?.emit?.('room:expired', {
        roomId,
        reason,
        message,
      });
    } catch {}

    try { stopBattle?.(roomId); } catch {}
    fullyDestroyRoom(room);

    // 让成员和观战者从过期的 Socket.IO room 离开。
    try { io?.in?.(`room:${roomId}`)?.socketsLeave?.(`room:${roomId}`); } catch {}
    try { io?.emit?.('rooms:list', roomManager.listRooms()); } catch {}

    console.log(`[clbwzzz][room-lifetime] destroyed room=${roomId} reason=${reason}`);
    return true;
  };

  const scheduleLifetime = (room) => {
    if (!room || stopped) return;
    if (room._lifetimeTimer) clearTimeout(room._lifetimeTimer);

    const createdAt = Number(room.createdAt) || Date.now();
    const remaining = Math.max(0, createdAt + ROOM_LIFETIME_MS - Date.now());
    room.expiresAt = createdAt + ROOM_LIFETIME_MS;
    room._lifetimeTimer = setTimeout(() => {
      const current = roomManager.getRoom(room.id);
      if (current) expire(current, 'lifetime');
    }, remaining);
    room._lifetimeTimer.unref?.();
  };

  // 给服务启动前已存在于内存中的房间补上寿命计时（通常为空，但逻辑完整）。
  for (const room of roomManager.rooms.values()) scheduleLifetime(room);

  // 包装创建房间：不改变原返回结构，只在创建完成后给真实 room 设置 2h 定时器。
  roomManager.createRoom = function createRoomWithLifetime(args) {
    const snapshot = originalCreateRoom(args);
    const room = roomManager.getRoom(snapshot?.id);
    if (room) scheduleLifetime(room);
    return snapshot;
  };

  const sweepOrphans = () => {
    if (stopped) return;
    for (const room of [...roomManager.rooms.values()]) {
      if ((room?.members?.size ?? 0) > 0 && realMembersOf(room).length === 0) {
        expire(room, 'bot-only');
      }
    }
  };

  const orphanTimer = setInterval(sweepOrphans, ORPHAN_SWEEP_INTERVAL_MS);
  orphanTimer.unref?.();
  sweepOrphans();

  return () => {
    stopped = true;
    clearInterval(orphanTimer);
    roomManager.createRoom = originalCreateRoom;
    for (const room of roomManager.rooms.values()) {
      if (room._lifetimeTimer) clearTimeout(room._lifetimeTimer);
      room._lifetimeTimer = null;
    }
  };
}
