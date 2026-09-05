import { roomManager } from './RoomManager.js';

export const RANDOM_MATCH_BOT_DELAY_MS = 10_000;

/**
 * 随机匹配补人机：
 * - 房主开启 randomMatch 后等待 10 秒真人匹配；
 * - 10 秒后仍有空位则用人机补齐；
 * - 人机补齐后若真人后来加入，会优先踢掉一个人机给真人腾位置；
 * - 只处理 waiting PVP 房间，不干扰已经开始的战斗。
 */
export function startRandomMatchBotService(io) {
  const timers = new Map();
  const originalSetRandomMatch = roomManager.setRandomMatch.bind(roomManager);
  const originalJoinRoom = roomManager.joinRoom.bind(roomManager);
  const originalDestroyRoom = roomManager.destroyRoom?.bind(roomManager);

  const clearTimer = (roomId) => {
    const timer = timers.get(Number(roomId));
    if (timer) clearTimeout(timer);
    timers.delete(Number(roomId));
  };

  const emitRoom = (roomId) => {
    const snapshot = roomManager.snapshot?.(roomId);
    if (snapshot) io.to(`room:${roomId}`).emit('room:snapshot', snapshot);
    io.emit('rooms:list', roomManager.listRooms());
  };

  const schedule = (room) => {
    if (!room) return;
    clearTimer(room.id);
    room.randomMatchStartedAt = Date.now();
    room.randomMatchBotAt = room.randomMatchStartedAt + RANDOM_MATCH_BOT_DELAY_MS;

    const timer = setTimeout(() => {
      timers.delete(Number(room.id));
      const current = roomManager.getRoom(room.id);
      if (!current || current.status !== 'waiting' || current.mode !== 'pvp' || !current.randomMatch) return;

      roomManager.fillRandomBots(current);
      current.randomMatchBotsFilledAt = Date.now();
      emitRoom(current.id);
      console.log(`[clbwzzz][random-match] room=${current.id} waited 10s; bots filled`);
    }, RANDOM_MATCH_BOT_DELAY_MS);
    timer.unref?.();
    timers.set(Number(room.id), timer);
  };

  roomManager.setRandomMatch = function setRandomMatchWithDelay(userId, enabled) {
    const snapshot = originalSetRandomMatch(userId, enabled);
    const room = roomManager.getRoom(snapshot?.id);
    if (room) {
      if (room.randomMatch) schedule(room);
      else {
        clearTimer(room.id);
        room.randomMatchStartedAt = null;
        room.randomMatchBotAt = null;
      }
    }
    return room ? roomManager.snapshot(room.id) : snapshot;
  };

  roomManager.joinRoom = function joinRoomPreferRealPlayer(args) {
    const room = roomManager.getRoom(args?.roomId);
    if (room?.mode === 'pvp' && room.status === 'waiting') {
      const members = [...room.members.values()];
      const blue = members.filter((m) => m.team === 'blue');
      const red = members.filter((m) => m.team === 'red');

      // 与原 joinRoom 的自动平衡方向一致，但真人优先：若目标阵营已被 bot 占满，先移走一个 bot。
      let targetTeam = args?.preferredTeam === 'red' ? 'red' : 'blue';
      if (room.mode === 'pvp' && args?.preferredTeam !== 'red' && red.length < blue.length) targetTeam = 'red';

      const removeBotFrom = (team) => {
        const bot = [...room.members.values()].find((m) => m.team === team && m.isBot === true);
        if (!bot) return false;
        room.members.delete(bot.userId);
        return true;
      };

      const targetCount = targetTeam === 'blue' ? blue.length : red.length;
      if (targetCount >= room.maxTeamSize) {
        if (!removeBotFrom(targetTeam)) {
          const other = targetTeam === 'blue' ? 'red' : 'blue';
          removeBotFrom(other);
        }
      }
    }

    const snapshot = originalJoinRoom(args);
    const joinedRoom = roomManager.getRoom(snapshot?.id);
    if (joinedRoom?.randomMatch && joinedRoom.status === 'waiting' && !joinedRoom.randomMatchBotsFilledAt) {
      // 真人加入不会把 10 秒窗口重置；仍以房主开启匹配时刻为准。
      if (!timers.has(Number(joinedRoom.id))) schedule(joinedRoom);
    }
    return snapshot;
  };

  if (originalDestroyRoom) {
    roomManager.destroyRoom = function destroyRoomWithMatchTimer(roomId) {
      clearTimer(roomId);
      return originalDestroyRoom(roomId);
    };
  }

  return () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    roomManager.setRandomMatch = originalSetRandomMatch;
    roomManager.joinRoom = originalJoinRoom;
    if (originalDestroyRoom) roomManager.destroyRoom = originalDestroyRoom;
  };
}
