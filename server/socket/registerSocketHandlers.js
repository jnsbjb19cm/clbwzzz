import { getSocketUser, db } from '../database.js';
import { verifyToken } from '../middleware/auth.js';
import { roomManager } from '../rooms/RoomManager.js';
import { registerSocket, unregisterSocket, socketsForUser } from '../online.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Card } = await import('../../src/core/Card.js');
const cardJson = require('../../src/data/card.json');

// 服务端 PVP 卡牌库(仅 getById + stages，无渲染依赖)
let pvpCardDb = null;
function getPvpCardDb() {
  if (!pvpCardDb) {
    const cards = cardJson.map((raw) => new Card(raw));
    pvpCardDb = {
      getById: (id) => cards.find((c) => c.id === Number(id)) ?? null,
      stages: [{ stage_id: 1, stage_name: 'pvp', hp: 3000, enemy_res: 5 }],
    };
  }
  return pvpCardDb;
}

const { PvpBattle } = await import('../battle/PvpBattle.js');

// roomId -> { battle, timer }
const pvpBattles = new Map();

// 大厅观战订阅：userId -> { roomId, socketId }，只加入 Socket.IO room 接收房间快照/开始事件，
// 不算房间成员，也不能参与准备/部署/踢人。
const watchRooms = new Map();

function ackOk(ack, data = {}) {
  if (typeof ack === 'function') ack({ ok: true, ...data });
}

function ackError(ack, error) {
  if (typeof ack === 'function') ack({ ok: false, message: error instanceof Error ? error.message : String(error) });
}

function loadSocketUser(userId) {
  return getSocketUser(userId);
}

/** 启动服务端权威 PVP 对战(每 100ms tick + 广播快照) */
function startPvpBattle(roomId, io) {
  const teams = roomManager.getTeams(roomId);
  if (!teams) return;
  const { room } = teams;
  // PVP 采用「本地引擎 + 部署转发」：双方客户端各自在房间容器内运行野外战斗(BattleView 完整实现)，
  // 服务端只校验并转发部署事件，不再跑权威快照。
  room.status = 'battling';
}

export function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || socket.handshake.headers.authorization || '';
      const token = String(raw).replace(/^Bearer\s+/i, '').trim();
      const payload = verifyToken(token);
      const user = await loadSocketUser(Number(payload.id));
      if (!user) return next(new Error('玩家不存在'));
      socket.user = user;
      return next();
    } catch {
      return next(new Error('未登录或登录状态失效'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    registerSocket(userId, socket.id);
    const restored = roomManager.reconnect(userId, socket.id);
    if (restored) {
      socket.join(`room:${restored.id}`);
      socket.emit('room:snapshot', restored);
      socket.to(`room:${restored.id}`).emit('room:snapshot', restored);
    }

    socket.emit('rooms:list', roomManager.listRooms());

    socket.on('rooms:list', (_payload, ack) => ackOk(ack, { rooms: roomManager.listRooms() }));

    socket.on('room:create', (payload = {}, ack) => {
      try {
        const previousWatch = watchRooms.get(userId);
        if (previousWatch) {
          socket.leave(`room:${previousWatch.roomId}`);
          watchRooms.delete(userId);
        }
        const room = roomManager.createRoom({
          user: { ...socket.user, socketId: socket.id },
          mode: payload.mode,
          stageId: payload.stageId,
          mapId: payload.mapId,
          size: payload.size,
          name: payload.name,
          bossId: payload.bossId,
          difficulty: payload.difficulty,
        });
        socket.join(`room:${room.id}`);
        io.emit('rooms:list', roomManager.listRooms());
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:join', (payload = {}, ack) => {
      try {
        const previousWatch = watchRooms.get(userId);
        if (previousWatch) {
          socket.leave(`room:${previousWatch.roomId}`);
          watchRooms.delete(userId);
        }
        const room = roomManager.joinRoom({
          roomId: payload.roomId,
          preferredTeam: payload.team,
          user: { ...socket.user, socketId: socket.id },
        });
        socket.join(`room:${room.id}`);
        io.emit('rooms:list', roomManager.listRooms());
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:watch', (payload = {}, ack) => {
      try {
        const roomId = Number(payload.roomId);
        const room = roomManager.getRoom(roomId);
        if (!room) throw new Error('房间不存在');
        if (roomManager.getRoomByUser(userId)) throw new Error('不能边玩边观战');
        const previousWatch = watchRooms.get(userId);
        if (previousWatch) socket.leave(`room:${previousWatch.roomId}`);
        watchRooms.set(userId, { roomId, socketId: socket.id });
        socket.join(`room:${roomId}`);
        ackOk(ack, { room: roomManager.snapshot(roomId) });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:leave-watch', (_payload, ack) => {
      const previousWatch = watchRooms.get(userId);
      if (previousWatch) {
        socket.leave(`room:${previousWatch.roomId}`);
        watchRooms.delete(userId);
      }
      ackOk(ack, { ok: true });
    });

    socket.on('room:leave', (_payload, ack) => {
      try {
        const oldRoom = roomManager.getRoomByUser(userId);
        const roomId = oldRoom?.id;
        const snapshot = roomManager.leave(userId);
        if (roomId) socket.leave(`room:${roomId}`);
        if (roomId && snapshot) io.to(`room:${roomId}`).emit('room:snapshot', snapshot);
        io.emit('rooms:list', roomManager.listRooms());
        ackOk(ack, { room: snapshot });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:ready', (payload = {}, ack) => {
      try {
        const room = roomManager.setReady(userId, payload.ready);
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:set-deck', (payload = {}, ack) => {
      try {
        const room = roomManager.setDeck(userId, payload.deckNo);
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:switch-team', (_payload, ack) => {
      try {
        const room = roomManager.switchTeam(userId);
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:change-map', (payload = {}, ack) => {
      try {
        const room = roomManager.changeMap(userId, payload.mapId);
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:set-rule', (payload = {}, ack) => {
      try {
        const room = roomManager.setRule(userId, { allowUnbalanced: payload.allowUnbalanced });
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:random-match', (payload = {}, ack) => {
      try {
        const room = roomManager.setRandomMatch(userId, payload.enabled);
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('lobby:chat', async (payload = {}, ack) => {
      const text = String(payload.text || '').trim().slice(0, 200);
      const channel = ['current', 'world', 'guild', 'private'].includes(payload.channel)
        ? payload.channel
        : 'current';
      if (!text) return ackError(ack, new Error('消息不能为空'));
      const senderId = Number(socket.user.id);
      const message = {
        nickname: socket.user.nickname || socket.user.username,
        text,
        channel,
        at: Date.now(),
        senderId,
      };

      if (channel === 'private') {
        const targetId = Number(payload.targetId);
        if (!Number.isFinite(targetId) || targetId <= 0) {
          return ackError(ack, new Error('缺少私聊目标'));
        }
        const targetSockets = socketsForUser(targetId);
        if (!targetSockets.length) return ackError(ack, new Error('对方不在线'));
        for (const sid of targetSockets) io.to(sid).emit('lobby:chat', message);
        for (const sid of socketsForUser(senderId)) io.to(sid).emit('lobby:chat', message);
        return ackOk(ack, { ok: true });
      }

      if (channel === 'guild') {
        const membership = await db.get('SELECT guild_id FROM guild_members WHERE user_id=?', [senderId]);
        if (!membership) return ackError(ack, new Error('你不在公会中'));
        const members = await db.all('SELECT user_id AS userId FROM guild_members WHERE guild_id=?', [membership.guild_id]);
        const socketIds = new Set();
        for (const member of members) {
          for (const sid of socketsForUser(member.userId)) socketIds.add(sid);
        }
        for (const sid of socketIds) io.to(sid).emit('lobby:chat', message);
        return ackOk(ack, { ok: true });
      }

      io.emit('lobby:chat', message);
      ackOk(ack, { ok: true });
    });

    socket.on('room:chat', (payload = {}, ack) => {
      try {
        const result = roomManager.addChat(userId, payload.text);
        io.to(`room:${result.room.id}`).emit('room:chat', result.message);
        ackOk(ack, { message: result.message });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:kick', (payload = {}, ack) => {
      try {
        const targetId = Number(payload.userId);
        const targetMember = roomManager.getRoomByUser(targetId)?.members.get(targetId);
        const targetSocket = targetMember?.socketId ? io.sockets.sockets.get(targetMember.socketId) : null;
        const room = roomManager.kick(userId, targetId);
        targetSocket?.leave(`room:${room.id}`);
        targetSocket?.emit('room:kicked', { roomId: room.id });
        io.to(`room:${room.id}`).emit('room:snapshot', room);
        io.emit('rooms:list', roomManager.listRooms());
        ackOk(ack, { room });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('room:start', (_payload, ack) => {
      try {
        const room = roomManager.markStarted(userId);
        io.to(`room:${room.id}`).emit('room:starting', {
          room,
          countdownMs: 3000,
          battleProtocol: 'server-authoritative-v1',
        });
        io.emit('rooms:list', roomManager.listRooms());
        ackOk(ack, { room });
        // PVP 房间：启动服务端权威对战(快照广播 + 部署/结束事件)
        // PVP 房间启动服务端权威对战；PVE(冒险)房间由客户端进入单机战斗
        if (room.mode === 'pvp') startPvpBattle(room.id, io);
      } catch (error) { ackError(ack, error); }
    });

    // 服务端权威 PVP：玩家部署卡牌
    socket.on('pvp:deploy', (payload = {}, ack) => {
      try {
        const room = roomManager.getRoomByUser(userId);
        if (!room) throw new Error('你不在房间中');
        if (room.status !== 'battling') throw new Error('对战未开始');
        const member = room.members.get(Number(userId));
        if (!member) throw new Error('你不在房间中');
        // 转发部署给房间其他成员(各自本地引擎渲染，col 由接收方按视角镜像)
        socket.to(`room:${room.id}`).emit('pvp:deploy', {
          cardId: payload.cardId,
          lane: payload.lane,
          col: payload.col,
          team: member.team,
          nickname: member.nickname,
        });
        ackOk(ack, { ok: true });
      } catch (error) { ackError(ack, error); }
    });

    socket.on('disconnect', () => {
      unregisterSocket(userId, socket.id);
      const previousWatch = watchRooms.get(userId);
      if (previousWatch) {
        socket.leave(`room:${previousWatch.roomId}`);
        watchRooms.delete(userId);
      }
      const snapshot = roomManager.disconnect(userId, (roomId, roomAfterExpiry) => {
        if (roomAfterExpiry) io.to(`room:${roomId}`).emit('room:snapshot', roomAfterExpiry);
        io.emit('rooms:list', roomManager.listRooms());
      });
      if (snapshot) io.to(`room:${snapshot.id}`).emit('room:snapshot', snapshot);
    });
  });
}
