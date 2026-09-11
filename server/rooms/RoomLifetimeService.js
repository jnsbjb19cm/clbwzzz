import { roomManager } from './RoomManager.js';

/**
 * 房间从 createdAt 起最多存在 2 小时。
 *
 * 可用环境变量 ROOM_LIFETIME_MS 覆盖（默认 7200000 = 2 小时）。
 * 用途：运营调整上限；以及用很短的时长（例如 15000）验证"到期才解散、
 * 不会提前销毁"这条规则 —— 见 scripts/verify-room-lifetime.mjs。
 */
const DEFAULT_ROOM_LIFETIME_MS = 2 * 60 * 60 * 1000;
const MIN_ROOM_LIFETIME_MS = 10_000;

function resolveRoomLifetimeMs() {
  const raw = Number(process.env.ROOM_LIFETIME_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_ROOM_LIFETIME_MS;
  return Math.max(MIN_ROOM_LIFETIME_MS, Math.floor(raw));
}

export const ROOM_LIFETIME_MS = resolveRoomLifetimeMs();
const ORPHAN_SWEEP_INTERVAL_MS = 15_000;

/** 统一日志格式：带时间戳与房间年龄，便于核对"到底是多久被解散的"。 */
function lifetimeLog(message) {
  const stamp = new Date().toISOString();
  console.log(`[clbwzzz][room-lifetime] ${stamp} ${message}`);
}

function ageTextOf(room) {
  const createdAt = Number(room?.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return 'age=?';
  const ageMs = Math.max(0, Date.now() - createdAt);
  const limitMin = (ROOM_LIFETIME_MS / 60000).toFixed(1);
  return `age=${(ageMs / 1000).toFixed(1)}s limit=${limitMin}min`;
}

function remainingOf(room) {
  const expiresAt = Number(room?.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return 0;
  return Math.max(0, expiresAt - Date.now());
}

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
      ? `房间已达到 ${(ROOM_LIFETIME_MS / 60000).toFixed(0)} 分钟存在上限，已自动解散。`
      : '房间内已没有真人玩家，系统已自动回收该房间。';

    try {
      io?.to?.(`room:${roomId}`)?.emit?.('room:expired', {
        roomId,
        reason,
        message,
      });
    } catch {}

    try { stopBattle?.(roomId); } catch {}
    const ageText = ageTextOf(room);
    fullyDestroyRoom(room);

    // 让成员和观战者从过期的 Socket.IO room 离开。
    try { io?.in?.(`room:${roomId}`)?.socketsLeave?.(`room:${roomId}`); } catch {}
    try { io?.emit?.('rooms:list', roomManager.listRooms()); } catch {}

    lifetimeLog(`destroyed room=${roomId} reason=${reason} ${ageText}`);
    return true;
  };

  const scheduleLifetime = (room) => {
    if (!room || stopped) return;
    if (room._lifetimeTimer) clearTimeout(room._lifetimeTimer);

    const createdAt = Number(room.createdAt) || Date.now();
    const remaining = Math.max(0, createdAt + ROOM_LIFETIME_MS - Date.now());
    room.expiresAt = createdAt + ROOM_LIFETIME_MS;
    if (remaining <= 0) {
      // createdAt 异常古老（不该发生）：不要静默立刻解散，先记一条便于排查。
      lifetimeLog(`warn room=${room.id} 已超过存在上限，立即解散 remaining=0 ${ageTextOf(room)}`);
    }
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
    if (room) {
      scheduleLifetime(room);
      lifetimeLog(`created room=${room.id} expiresIn=${(remainingOf(room) / 60000).toFixed(1)}min expiresAt=${new Date(room.expiresAt).toISOString()}`);
    }
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
