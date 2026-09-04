const DISCONNECT_GRACE_MS = 30_000;
import { getBossById } from '../../src/data/bossList.js';

/** 房间规模 → 每队人数(1v1 / 2v2 / 3v3) */
const SIZE_TO_TEAM = { '1v1': 1, '2v2': 2, '3v3': 3 };

function publicMember(member) {
  return {
    userId: member.userId,
    nickname: member.nickname,
    level: member.level,
    team: member.team,
    ready: member.ready,
    connected: member.connected,
    isHost: member.isHost,
    selectedDeckNo: member.selectedDeckNo,
    joinOrder: member.joinOrder,
  };
}

function cloneRoom(room) {
  return {
    id: room.id,
    name: room.name,
    bossId: room.bossId,
    difficulty: room.difficulty,
    allowUnbalanced: room.allowUnbalanced,
    randomMatch: room.randomMatch,
    mode: room.mode,
    size: room.size,
    maxTeamSize: room.maxTeamSize,
    stageId: room.stageId,
    mapId: room.mapId,
    status: room.status,
    createdAt: room.createdAt,
    members: [...room.members.values()].sort((a, b) => a.joinOrder - b.joinOrder).map(publicMember),
    chat: room.chat.slice(-50),
  };
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.userRoom = new Map();
    this.joinSequence = 0;
  }

  allocateRoomId() {
    let id = 1;
    while (this.rooms.has(id)) id += 1;
    return id;
  }

  listRooms() {
    // 大厅列表展示等待/即将开始/进行中的房间：等待房可加入，战斗房可打观战入口。
    return [...this.rooms.values()]
      .filter((room) => ['waiting', 'starting', 'battling'].includes(room.status))
      .map(cloneRoom);
  }

  getRoomByUser(userId) {
    const roomId = this.userRoom.get(Number(userId));
    return roomId ? this.rooms.get(roomId) ?? null : null;
  }

  getRoom(roomId) {
    return this.rooms.get(Number(roomId)) ?? null;
  }

  createRoom({ user, mode, stageId, mapId, size = '3v3', name, bossId, difficulty }) {
    if (this.getRoomByUser(user.id)) throw new Error('你已经在其他房间中');
    if (!['pve', 'boss', 'pvp'].includes(mode)) throw new Error('房间模式无效');

    const maxTeamSize = SIZE_TO_TEAM[size] ?? 3;
    const id = this.allocateRoomId();
    // 房间简介：PVP={昵称}的房间；BOSS={BOSS名}[难度]；PVE/其它=传入名称或关卡名
    let displayName = String(name || '').trim();
    if (!displayName) {
      if (mode === 'pvp') {
        displayName = `${user.nickname || user.username || '玩家'}的房间`;
      } else if (mode === 'boss') {
        const boss = getBossById(bossId);
        displayName = boss ? `${boss.name}[${difficulty || boss.difficulty}]` : 'BOSS 挑战';
      } else {
        displayName = '冒险房间';
      }
    }
    const room = {
      id,
      name: displayName.slice(0, 24),
      bossId: bossId ? String(bossId) : null,
      difficulty: difficulty ? String(difficulty) : null,
      allowUnbalanced: false,
      randomMatch: false,
      mode,
      size,
      maxTeamSize,
      stageId: String(stageId || ''),
      // PVP 默认黄沙场景(7=黄沙/沙丘)；房主可 dice 随机 2=草地/4=冰川
      mapId: String(mapId || (mode === 'pvp' ? '7' : '')),
      status: 'waiting',
      createdAt: Date.now(),
      members: new Map(),
      chat: [],
    };
    this.rooms.set(id, room);
    this.addMember(room, user, 'blue', true);
    return cloneRoom(room);
  }

  joinRoom({ roomId, user, preferredTeam }) {
    if (this.getRoomByUser(user.id)) throw new Error('你已经在其他房间中');
    const room = this.getRoom(roomId);
    if (!room) throw new Error('房间不存在');
    if (room.status !== 'waiting') throw new Error('房间已经开始战斗');

    // PVP：未指定队伍时自动进入人数较少的队伍(自动平衡)；指定红队才强制红队
    let team = preferredTeam === 'red' ? 'red' : 'blue';
    if (room.mode === 'pvp' && preferredTeam !== 'red') {
      const blueCount = this.teamCount(room, 'blue');
      const redCount = this.teamCount(room, 'red');
      if (redCount < blueCount) team = 'red';
    }
    if (this.teamCount(room, team) >= room.maxTeamSize) {
      // 该队满：尝试另一队
      const other = team === 'blue' ? 'red' : 'blue';
      if (this.teamCount(room, other) < room.maxTeamSize) team = other;
      else throw new Error('房间人数已满');
    }
    this.addMember(room, user, team, false);
    this.resetReady(room);
    return cloneRoom(room);
  }

  addMember(room, user, team, isHost) {
    const member = {
      userId: Number(user.id),
      nickname: user.nickname || user.username,
      level: Number(user.level || 1),
      team,
      ready: false,
      connected: true,
      isHost,
      selectedDeckNo: Number(user.selectedDeckNo || 1),
      joinOrder: ++this.joinSequence,
      socketId: user.socketId || null,
      disconnectTimer: null,
    };
    room.members.set(member.userId, member);
    this.userRoom.set(member.userId, room.id);
    return member;
  }

  teamCount(room, team) {
    return [...room.members.values()].filter((member) => member.team === team).length;
  }

  resetReady(room) {
    for (const member of room.members.values()) {
      if (!member.isHost) member.ready = false;
    }
  }

  setReady(userId, ready) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const member = room.members.get(Number(userId));
    if (member.isHost) throw new Error('房主不需要准备');
    member.ready = Boolean(ready);
    return cloneRoom(room);
  }

  setDeck(userId, deckNo) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const member = room.members.get(Number(userId));
    member.selectedDeckNo = Math.max(1, Math.min(3, Number(deckNo) || 1));
    if (!member.isHost) member.ready = false;
    return cloneRoom(room);
  }

  switchTeam(userId) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    if (room.mode !== 'pvp') throw new Error('只有PVP房间可以换队');
    const member = room.members.get(Number(userId));
    const target = member.team === 'blue' ? 'red' : 'blue';
    if (this.teamCount(room, target) >= room.maxTeamSize) throw new Error('目标阵营已满');
    member.team = target;
    this.resetReady(room);
    return cloneRoom(room);
  }

  changeMap(userId, mapId) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const member = room.members.get(Number(userId));
    if (!member?.isHost) throw new Error('只有房主可以切换地图');
    if (room.mode !== 'pvp') throw new Error('只有PVP房间可以随机地图');
    room.mapId = String(mapId || '');
    this.resetReady(room);
    return cloneRoom(room);
  }

  canStart(userId) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const host = room.members.get(Number(userId));
    if (!host?.isHost) throw new Error('只有房主可以开始');
    if (room.status !== 'waiting') throw new Error('房间状态不允许开始');

    const members = [...room.members.values()];
    if (members.length < 1) throw new Error('房间没有玩家');
    if (members.some((member) => !member.connected)) throw new Error('存在断线玩家');
    if (members.some((member) => !member.isHost && !member.ready)) throw new Error('还有玩家没有准备');

    if (room.mode === 'pvp' && room.randomMatch) {
      console.log('[clbwzzz][random-match] canStart randomMatch=true', room.id);
      // 随机匹配：人数不足由系统补人机，只需要至少1名真实玩家即可开始
      if (members.filter((m) => !m.isBot).length < 1) throw new Error('随机匹配至少需要1名玩家');
    } else if (room.mode === 'pvp') {
      console.log('[clbwzzz][random-match] canStart randomMatch=false', room.id);
      const blueCount = this.teamCount(room, 'blue');
      const redCount = this.teamCount(room, 'red');
      if (blueCount < 1 || redCount < 1) {
        throw new Error('PVP至少需要蓝红双方各一名玩家');
      }
      // 双方人数必须相等才能开始；房主勾选「允许不对等战斗」后可不等(无掉落无经验)
      if (!room.allowUnbalanced && blueCount !== redCount) {
        throw new Error(`双方人数需相等才能开始(蓝${blueCount} vs 红${redCount})；可开启「允许不对等战斗」`);
      }
    }
    return room;
  }

  /** 房主设置房间规则：允许不对等战斗(其他玩家可见) */
  setRule(userId, { allowUnbalanced } = {}) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const member = room.members.get(Number(userId));
    if (!member?.isHost) throw new Error('只有房主可以设置房间规则');
    if (room.mode !== 'pvp') throw new Error('仅 PVP 房间支持该规则');
    room.allowUnbalanced = Boolean(allowUnbalanced);
    return cloneRoom(room);
  }

  /** 房主开启/关闭随机匹配：人数不足时由服务端补人机 */
  setRandomMatch(userId, enabled) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const member = room.members.get(Number(userId));
    if (!member?.isHost) throw new Error('只有房主可以设置随机匹配');
    if (room.mode !== 'pvp') throw new Error('仅 PVP 房间支持随机匹配');
    room.randomMatch = Boolean(enabled);
    this.resetReady(room);
    return cloneRoom(room);
  }

  fillRandomBots(room) {
    if (!room.randomMatch || room.mode !== 'pvp') return;
    for (const team of ['blue', 'red']) {
      let count = this.teamCount(room, team);
      while (count < room.maxTeamSize) {
        count += 1;
        const botSeq = (room._botSeq = (room._botSeq || 0) + 1);
        const userId = -100000 - botSeq;
        const member = {
          userId,
          nickname: `人机${botSeq}`,
          level: 1,
          team,
          ready: true,
          connected: true,
          isHost: false,
          isBot: true,
          selectedDeckNo: 1,
          joinOrder: ++this.joinSequence,
          socketId: null,
          disconnectTimer: null,
        };
        room.members.set(member.userId, member);
      }
    }
  }

  markStarted(userId) {
    const room = this.canStart(userId);
    this.fillRandomBots(room);
    room.status = 'starting';
    return cloneRoom(room);
  }

  /** 获取房间双方成员(供创建 PvpBattle 使用) */
  getTeams(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const members = [...room.members.values()];
    return {
      room,
      teamBlue: members.filter((m) => m.team === 'blue').map((m) => ({ userId: m.userId, nickname: m.nickname })),
      teamRed: members.filter((m) => m.team === 'red').map((m) => ({ userId: m.userId, nickname: m.nickname })),
    };
  }

  addChat(userId, text) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const member = room.members.get(Number(userId));
    const message = String(text || '').trim().slice(0, 200);
    if (!message) throw new Error('消息不能为空');
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: member.userId,
      nickname: member.nickname,
      text: message,
      createdAt: Date.now(),
    };
    room.chat.push(entry);
    if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
    return { room: cloneRoom(room), message: entry };
  }

  kick(hostUserId, targetUserId) {
    const room = this.getRoomByUser(hostUserId);
    if (!room) throw new Error('你不在房间中');
    const host = room.members.get(Number(hostUserId));
    if (!host?.isHost) throw new Error('只有房主可以踢人');
    if (Number(hostUserId) === Number(targetUserId)) throw new Error('房主不能踢自己');
    if (!room.members.has(Number(targetUserId))) throw new Error('玩家不在房间中');
    this.removeMember(room, Number(targetUserId));
    this.resetReady(room);
    return cloneRoom(room);
  }

  leave(userId) {
    const room = this.getRoomByUser(userId);
    if (!room) return null;
    this.removeMember(room, Number(userId));
    if (room.members.size === 0) {
      this.rooms.delete(room.id);
      return null;
    }
    this.ensureHost(room);
    this.resetReady(room);
    return cloneRoom(room);
  }

  removeMember(room, userId) {
    const member = room.members.get(userId);
    if (member?.disconnectTimer) clearTimeout(member.disconnectTimer);
    room.members.delete(userId);
    this.userRoom.delete(userId);
  }

  ensureHost(room) {
    const members = [...room.members.values()].sort((a, b) => a.joinOrder - b.joinOrder);
    if (members.some((member) => member.isHost)) return;
    if (members[0]) members[0].isHost = true;
  }

  reconnect(userId, socketId) {
    const room = this.getRoomByUser(userId);
    if (!room) return null;
    const member = room.members.get(Number(userId));
    if (!member) return null;
    if (member.disconnectTimer) clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null;
    member.connected = true;
    member.socketId = socketId;
    return cloneRoom(room);
  }

  disconnect(userId, onExpired) {
    const room = this.getRoomByUser(userId);
    if (!room) return null;
    const member = room.members.get(Number(userId));
    if (!member) return null;
    member.connected = false;
    member.socketId = null;
    if (member.disconnectTimer) clearTimeout(member.disconnectTimer);
    member.disconnectTimer = setTimeout(() => {
      const currentRoom = this.getRoomByUser(userId);
      if (!currentRoom) return;
      const current = currentRoom.members.get(Number(userId));
      if (!current || current.connected) return;
      const snapshot = this.leave(userId);
      onExpired?.(currentRoom.id, snapshot);
    }, DISCONNECT_GRACE_MS);
    return cloneRoom(room);
  }

  snapshot(roomId) {
    const room = this.getRoom(roomId);
    return room ? cloneRoom(room) : null;
  }
}

export const roomManager = new RoomManager();
