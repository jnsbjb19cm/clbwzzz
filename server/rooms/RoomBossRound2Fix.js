import { getBossById } from '../../src/data/bossList.js';
import { RoomManager } from './RoomManager.js';

const PATCH_FLAG = Symbol.for('clbwzzz.roomBossRound2Fix');

function bossRoomName(room) {
  const boss = getBossById(room?.bossId);
  if (!boss) return 'BOSS 挑战';
  return `${boss.name}：${room?.difficulty || boss.difficulty}`;
}

export function installRoomBossRound2Fix() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousCreateRoom = RoomManager.prototype.createRoom;
  RoomManager.prototype.createRoom = function createBossRoomWithCorrectTitle(payload = {}) {
    const snapshot = previousCreateRoom.call(this, payload);
    if (snapshot?.mode !== 'boss') return snapshot;
    const room = this.getRoom(snapshot.id);
    if (!room) return snapshot;
    room.name = bossRoomName(room).slice(0, 24);
    room.size = '3v3';
    room.maxTeamSize = 3;
    for (const member of room.members.values()) member.team = 'blue';
    return this.snapshot(room.id);
  };

  const previousJoinRoom = RoomManager.prototype.joinRoom;
  RoomManager.prototype.joinRoom = function joinCooperativeRoom(payload = {}) {
    const room = this.getRoom(payload.roomId);
    if (!room || !['boss', 'pve'].includes(room.mode)) {
      return previousJoinRoom.call(this, payload);
    }
    if (this.teamCount(room, 'blue') >= room.maxTeamSize) {
      throw new Error('合作房间人数已满');
    }
    const snapshot = previousJoinRoom.call(this, { ...payload, preferredTeam: 'blue' });
    const actual = this.getRoom(snapshot.id);
    for (const member of actual?.members.values() ?? []) member.team = 'blue';
    return this.snapshot(snapshot.id);
  };
}
