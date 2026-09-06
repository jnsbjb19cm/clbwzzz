import { roomManager } from '../rooms/RoomManager.js';
import { socketsForUser } from '../online.js';

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

function pushRoomChat(room, entry) {
  room.chat ??= [];
  room.chat.push(entry);
  if (room.chat.length > MAX_ROOM_CHAT) room.chat.splice(0, room.chat.length - MAX_ROOM_CHAT);
}

function roomChatEntry(socket, room, text, { channel = 'current', spectator = false } = {}) {
  const member = room.members?.get?.(Number(socket.user.id)) ?? null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: Number(socket.user.id),
    nickname: socket.user.nickname || socket.user.username || (spectator ? '观战者' : '玩家'),
    text,
    channel,
    team: member?.team ?? null,
    spectator,
    createdAt: Date.now(),
  };
}

function emitTeamChat(io, room, team, event, entry) {
  const sentSocketIds = new Set();
  for (const member of room.members?.values?.() ?? []) {
    if (member?.team !== team || member?.isBot) continue;
    for (const socketId of socketsForUser(Number(member.userId))) {
      if (!socketId || sentSocketIds.has(socketId)) continue;
      sentSocketIds.add(socketId);
      io.to(socketId).emit(event, entry);
    }
  }
}

/**
 * 战斗“本局”聊天 + 准备房频道聊天。
 * 世界/公会/私聊继续走 lobby:chat。
 * room:chat:v2 支持：
 * - current：房间全员
 * - team：仅同队玩家
 * - system：只读，客户端不得伪造系统消息
 */
export function installBattleChatService(io) {
  io.on('connection', (socket) => {
    socket.on('room:chat:v2', (payload = {}, ack) => {
      try {
        const resolved = roomFromSocket(socket);
        if (!resolved?.room) throw new Error('当前没有可聊天的战斗房间');
        if (resolved.spectator) throw new Error('观战状态不能在准备房频道发言');

        const text = String(payload.text || '').trim().slice(0, 200);
        if (!text) throw new Error('消息不能为空');

        const channel = String(payload.channel || 'current').toLowerCase();
        if (channel === 'system') throw new Error('系统频道为只读频道');
        if (!['current', 'team'].includes(channel)) throw new Error('聊天频道无效');

        const { room } = resolved;
        const member = room.members?.get?.(Number(socket.user.id));
        if (!member) throw new Error('你不在房间中');
        if (channel === 'team' && !member.team) throw new Error('当前没有可用队伍频道');

        const entry = roomChatEntry(socket, room, text, { channel, spectator: false });
        pushRoomChat(room, entry);

        if (channel === 'team') {
          emitTeamChat(io, room, member.team, 'room:chat', entry);
        } else {
          io.to(`room:${room.id}`).emit('room:chat', entry);
        }
        ackOk(ack, { message: entry, roomId: room.id, channel });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('battle:chat:current', (payload = {}, ack) => {
      try {
        const resolved = roomFromSocket(socket);
        if (!resolved?.room) throw new Error('当前没有可聊天的战斗房间');
        const text = String(payload.text || '').trim().slice(0, 200);
        if (!text) throw new Error('消息不能为空');

        const { room, spectator } = resolved;
        const entry = roomChatEntry(socket, room, text, { channel: 'current', spectator });
        pushRoomChat(room, entry);

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
