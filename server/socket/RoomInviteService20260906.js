import { db } from '../database.js';
import { isOnline, onlineUserIds, socketsForUser } from '../online.js';
import { roomManager } from '../rooms/RoomManager.js';
import {
  ROOM_INVITE_TTL_MS_20260906,
  canInviteLobbyPlayer20260906,
  normalizeLobbyPresence20260906,
} from './RoomInvitePolicy20260906.js';

const presenceBySocket = new Map();
const invitesById = new Map();
const activeInviteByPair = new Map();
let inviteSequence = 0;

function ackOk(ack, data = {}) {
  if (typeof ack === 'function') ack({ ok: true, ...data });
}

function ackError(ack, error) {
  if (typeof ack === 'function') {
    ack({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}

function effectivePresence(userId) {
  const id = Number(userId);
  if (roomManager.getRoomByUser(id)) return 'room';
  let hasLobby = false;
  let hasBattle = false;
  for (const [socketId, record] of presenceBySocket) {
    if (Number(record.userId) !== id) continue;
    if (!socketsForUser(id).includes(socketId)) continue;
    if (record.state === 'lobby') hasLobby = true;
    if (record.state === 'battle') hasBattle = true;
  }
  if (hasLobby) return 'lobby';
  if (hasBattle) return 'battle';
  return 'offline';
}

function pairKey(roomId, inviterUserId, targetUserId) {
  return `${Number(roomId)}:${Number(inviterUserId)}:${Number(targetUserId)}`;
}

function deleteInvite(invite) {
  if (!invite) return;
  invitesById.delete(invite.id);
  activeInviteByPair.delete(pairKey(invite.roomId, invite.inviterUserId, invite.targetUserId));
}

function purgeExpiredInvites(now = Date.now()) {
  for (const invite of invitesById.values()) {
    if (invite.expiresAt <= now) deleteInvite(invite);
  }
}

function publicInvite(invite, room) {
  return {
    inviteId: invite.id,
    inviter: {
      userId: invite.inviterUserId,
      nickname: invite.inviterNickname,
    },
    room: {
      id: room.id,
      name: room.name,
      mode: room.mode,
      size: room.size,
      status: room.status,
      bossId: room.bossId ?? null,
      difficulty: room.difficulty ?? null,
    },
    expiresAt: invite.expiresAt,
  };
}

function assertInviterRoom(socket) {
  const room = roomManager.getRoomByUser(Number(socket.user.id));
  if (!room) throw new Error('你当前不在可邀请玩家的房间中');
  if (room.status !== 'waiting') throw new Error('房间已经开始，不能再邀请玩家');
  if (!room.members?.has?.(Number(socket.user.id))) throw new Error('你不是当前房间成员');
  return room;
}

function targetEligible(inviterUserId, targetUserId) {
  return canInviteLobbyPlayer20260906({
    inviterUserId,
    targetUserId,
    targetOnline: isOnline(targetUserId),
    targetPresence: effectivePresence(targetUserId),
    targetHasRoom: Boolean(roomManager.getRoomByUser(targetUserId)),
  });
}

async function loadCandidateProfile(userId) {
  return db.get(`
    SELECT u.id AS userId, u.username, p.nickname, p.level
    FROM users u
    JOIN player_profiles p ON p.user_id=u.id
    WHERE u.id=?
  `, [Number(userId)]);
}

function emitInviteResult(io, invite, payload) {
  for (const socketId of socketsForUser(invite.inviterUserId)) {
    io.to(socketId).emit('room:invite:result', {
      inviteId: invite.id,
      targetUserId: invite.targetUserId,
      ...payload,
    });
  }
  for (const socketId of socketsForUser(invite.targetUserId)) {
    io.to(socketId).emit('room:invite:resolved', {
      inviteId: invite.id,
      ...payload,
    });
  }
}

export function installRoomInviteService20260906(io) {
  io.on('connection', (socket) => {
    const userId = Number(socket.user?.id);
    presenceBySocket.set(socket.id, { userId, state: roomManager.getRoomByUser(userId) ? 'room' : 'offline' });

    socket.on('lobby:presence', (payload = {}, ack) => {
      try {
        let state = normalizeLobbyPresence20260906(payload.state);
        if (roomManager.getRoomByUser(userId) && state === 'lobby') state = 'room';
        presenceBySocket.set(socket.id, { userId, state });
        ackOk(ack, { state });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('room:invite:list', async (_payload = {}, ack) => {
      try {
        assertInviterRoom(socket);
        purgeExpiredInvites();
        const ids = onlineUserIds().filter((targetId) => targetEligible(userId, targetId));
        const profiles = (await Promise.all(ids.map((id) => loadCandidateProfile(id))))
          .filter(Boolean)
          .sort((a, b) => Number(b.level || 0) - Number(a.level || 0) || Number(a.userId) - Number(b.userId));
        ackOk(ack, { players: profiles });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('room:invite:send', async (payload = {}, ack) => {
      try {
        const room = assertInviterRoom(socket);
        const targetUserId = Number(payload.targetUserId);
        if (!targetEligible(userId, targetUserId)) {
          throw new Error('该玩家已不在大厅或当前不可邀请');
        }

        purgeExpiredInvites();
        const key = pairKey(room.id, userId, targetUserId);
        const previousId = activeInviteByPair.get(key);
        const previous = previousId ? invitesById.get(previousId) : null;
        if (previous && previous.expiresAt > Date.now()) {
          return ackOk(ack, { invite: publicInvite(previous, room), duplicated: true });
        }

        const targetProfile = await loadCandidateProfile(targetUserId);
        if (!targetProfile) throw new Error('玩家不存在');
        const id = `ri-${Date.now()}-${++inviteSequence}`;
        const invite = {
          id,
          roomId: Number(room.id),
          inviterUserId: userId,
          inviterNickname: socket.user.nickname || socket.user.username || '玩家',
          targetUserId,
          createdAt: Date.now(),
          expiresAt: Date.now() + ROOM_INVITE_TTL_MS_20260906,
        };
        invitesById.set(id, invite);
        activeInviteByPair.set(key, id);

        const publicPayload = publicInvite(invite, room);
        const targetSockets = socketsForUser(targetUserId);
        if (!targetSockets.length) {
          deleteInvite(invite);
          throw new Error('对方已经离线');
        }
        for (const socketId of targetSockets) io.to(socketId).emit('room:invite', publicPayload);
        ackOk(ack, { invite: publicPayload, target: targetProfile });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('room:invite:respond', (payload = {}, ack) => {
      try {
        purgeExpiredInvites();
        const inviteId = String(payload.inviteId || '').trim();
        const invite = invitesById.get(inviteId);
        if (!invite) throw new Error('邀请已过期或不存在');
        if (Number(invite.targetUserId) !== userId) throw new Error('这不是发给你的邀请');

        const accepted = Boolean(payload.accept);
        if (!accepted) {
          deleteInvite(invite);
          emitInviteResult(io, invite, { accepted: false, reason: 'rejected' });
          return ackOk(ack, { accepted: false });
        }

        if (!targetEligible(invite.inviterUserId, userId)) {
          deleteInvite(invite);
          throw new Error('你当前已经不在大厅或不能加入房间');
        }
        const room = roomManager.getRoom(invite.roomId);
        if (!room || room.status !== 'waiting') {
          deleteInvite(invite);
          throw new Error('邀请对应的房间已经失效');
        }
        if (!room.members?.has?.(Number(invite.inviterUserId))) {
          deleteInvite(invite);
          throw new Error('邀请人已经离开该房间');
        }

        const joinedRoom = roomManager.joinRoom({
          roomId: invite.roomId,
          user: { ...socket.user, socketId: socket.id },
        });
        socket.join(`room:${joinedRoom.id}`);
        presenceBySocket.set(socket.id, { userId, state: 'room' });
        deleteInvite(invite);

        io.emit('rooms:list', roomManager.listRooms());
        io.to(`room:${joinedRoom.id}`).emit('room:snapshot', joinedRoom);
        emitInviteResult(io, invite, { accepted: true, roomId: joinedRoom.id });
        ackOk(ack, { accepted: true, room: joinedRoom });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('disconnect', () => {
      presenceBySocket.delete(socket.id);
      purgeExpiredInvites();
    });
  });
}
