import { roomManager } from '../rooms/RoomManager.js';

const MAX_ROOM_CHAT = 100;

function ackOk(ack, data = {}) {
  if (typeof ack === 'function') ack({ ok: true, ...data });
}

function ackError(ack, error) {
  if (typeof ack === 'function') {
    ack({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}

function roomFromSocket(socket) {
  const userId = Number(socket.user?.id);
  const memberRoom = roomManager.getRoomByUser(userId);
  if (memberRoom) return { room: memberRoom, spectator: false };

  for (const joined of socket.rooms ?? []) {
    const match = /^room:(\d+)$/.exec(String(joined));
    if (!match) continue;
    const room = roomManager.getRoom(Number(match[1]));
    if (room) return { room, spectator: true };
  }
  return null;
}

/**
 * 战斗“本局”聊天。
 * 世界/公会/私聊继续走 lobby:chat；本服务只负责当前战局，因此观战者也能发言。
 */
export function installBattleChatService(io) {
  io.on('connection', (socket) => {
    socket.on('battle:chat:current', (payload = {}, ack) => {
      try {
        const resolved = roomFromSocket(socket);
        if (!resolved?.room) throw new Error('当前没有可聊天的战斗房间');
        const text = String(payload.text || '').trim().slice(0, 200);
        if (!text) throw new Error('消息不能为空');

        const { room, spectator } = resolved;
        const entry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: Number(socket.user.id),
          nickname: socket.user.nickname || socket.user.username || (spectator ? '观战者' : '玩家'),
          text,
          channel: 'current',
          spectator,
          createdAt: Date.now(),
        };

        room.chat ??= [];
        room.chat.push(entry);
        if (room.chat.length > MAX_ROOM_CHAT) room.chat.splice(0, room.chat.length - MAX_ROOM_CHAT);

        io.to(`room:${room.id}`).emit('battle:chat', entry);
        // 兼容仍监听旧 room:chat 的房间界面。
        io.to(`room:${room.id}`).emit('room:chat', entry);
        ackOk(ack, { message: entry, roomId: room.id, spectator });
      } catch (error) {
        ackError(ack, error);
      }
    });
  });
}
