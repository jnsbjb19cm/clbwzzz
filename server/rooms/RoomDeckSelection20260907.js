import { RoomManager } from './RoomManager.js';

let installed = false;

function normalizeDeckNo(value) {
  return Math.max(0, Math.min(3, Math.trunc(Number(value) || 0)));
}

const DECK_NO_BY_GROUP = Object.freeze({ default: 0, team1: 1, team2: 2, team3: 3 });

/**
 * 2026-09-12：房间成员一开始的战团，必须来自**权威字段 selected_deck_group**。
 * 之前用的是兼容旧数据的 selected_deck_no（1~3，默认组被写成 1），
 * 于是"玩家存的是默认组/战团3，进房间却变成战团1（或账号里很久以前的战团2）"，
 * 界面上就成了"选中的战团被重定向到别的战团 / 战团和卡组串了"（用户报告）。
 */
function preferredDeckNoForUser(user) {
  const group = String(user?.selectedDeckGroup ?? '').trim().toLowerCase();
  if (group in DECK_NO_BY_GROUP) return DECK_NO_BY_GROUP[group];
  return user?.selectedDeckNo ?? 0;
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
    member.selectedDeckNo = normalizeDeckNo(preferredDeckNoForUser(user));
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
