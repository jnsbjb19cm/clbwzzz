import { RoomManager } from './RoomManager.js';

let installed = false;

function normalizeDeckNo(value) {
  return Math.max(0, Math.min(3, Math.trunc(Number(value) || 0)));
}

/**
 * RoomManager historically treated deck 1 as the implicit default and clamped room:set-deck
 * to 1..3, while the client exposes four tabs: default + team1/team2/team3.  Make the room
 * protocol authoritative for all four tabs: default=0 and team1..3=1..3.
 */
export function installRoomDeckSelection20260907() {
  if (installed || RoomManager.prototype.__roomDeckSelection20260907) return;
  installed = true;
  RoomManager.prototype.__roomDeckSelection20260907 = true;

  const originalAddMember = RoomManager.prototype.addMember;
  RoomManager.prototype.addMember = function patchedAddMember(room, user, team, isHost) {
    const member = originalAddMember.call(this, room, user, team, isHost);
    member.selectedDeckNo = normalizeDeckNo(user?.selectedDeckNo ?? 0);
    return member;
  };

  RoomManager.prototype.setDeck = function patchedSetDeck(userId, deckNo) {
    const room = this.getRoomByUser(userId);
    if (!room) throw new Error('你不在房间中');
    const member = room.members.get(Number(userId));
    if (!member) throw new Error('你不在房间中');
    member.selectedDeckNo = normalizeDeckNo(deckNo);
    if (!member.isHost) member.ready = false;
    return this.snapshot(room.id);
  };
}

export function normalizeRoomDeckNo20260907(value) {
  return normalizeDeckNo(value);
}
