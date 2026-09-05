import { roomManager } from './RoomManager.js';

/** 房间从创建起最多存在 2 小时。 */
export const ROOM_LIFETIME_MS = 2 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 15_000;

function realMembersOf(room) {
  return [...(room?.members?.values?.() ?? [])].filter((member) => member?.isBot !== true);
}

/**
 * RoomManager.destroyRoom 旧实现只删 rooms Map；这里做完整销毁，避免 TTL 到期后
 * userRoom 仍残留，导致玩家被误判为“仍在其他房间中”。
 */
function fullyDestroyRoom(room) {
  if (!room) return false;

  for (const member of room.members?.values?.() ?? []) {
    if (member?.disconnectTimer) clearTimeout(member.disconnectTimer);
    if (member?.isBot !== true) roomManager.userRoom.delete(Number(member.userId));
  }

  room.members?.clear?.();
  roomManager.rooms.delete(Number(room.id));
  return true;
}

/**
 * 启动房间寿命清理器。
 * - 创建满 2 小时：无论 waiting / starting / battling 都自动解散。
 * - 真人全部退出、只剩人机：自动回收，解决随机匹配后真人退出形成“死房间”。
 */
export function startRoomLifetimeService(io, { stopBattle } = {}) {
  let stopped = false;

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

    // 把仍订阅该 Socket.IO room 的成员/观战者移出，避免继续收到过期房间广播。
    try { io?.in?.(`room:${roomId}`)?.socketsLeave?.(`room:${roomId}`); } catch {}

    console.log(`[clbwzzz][room-lifetime] destroyed room=${roomId} reason=${reason}`);
    return true;
  };

  const sweep = () => {
    if (stopped) return;
    const now = Date.now();
    let changed = false;

    for (const room of [...roomManager.rooms.values()]) {
      const createdAt = Number(room?.createdAt) || now;
      if (now - createdAt >= ROOM_LIFETIME_MS) {
        changed = expire(room, 'lifetime') || changed;
        continue;
      }

      // 随机匹配补人机后，真人退出/断线宽限结束，只剩 bot 时立即回收。
      if ((room?.members?.size ?? 0) > 0 && realMembersOf(room).length === 0) {
        changed = expire(room, 'bot-only') || changed;
      }
    }

    if (changed) {
      try { io?.emit?.('rooms:list', roomManager.listRooms()); } catch {}
    }
  };

  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref?.();
  sweep();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
