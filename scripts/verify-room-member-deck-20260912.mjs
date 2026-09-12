// 回归验证：服务端把玩家放进房间时，成员一开始的"战团"必须取自**权威字段 selected_deck_group**，
// 不能再用兼容旧数据的 selected_deck_no（1~3，默认组被写成 1）。
//
// 用户报告：把战团3 保存并选中，进战斗后变成默认/别的战团，甚至"在默认/战团1/战团3 都被重定向到战团2"——
// 根因就是账号里 selected_deck_no 的历史残留（比如 2）被当成房间成员的初始战团。
//
// 用法： node scripts/verify-room-member-deck-20260912.mjs
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms/RoomManager.js';
import { installRoomDeckSelection20260907 } from '../server/rooms/RoomDeckSelection20260907.js';

installRoomDeckSelection20260907();

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

function memberForUser(user) {
  const manager = Object.create(RoomManager.prototype);
  manager.userRoom = new Map();
  manager.joinSequence = 0;
  const room = { members: new Map() };
  manager.addMember(room, user, 'blue', true);
  return room.members.get(Number(user.id));
}

console.log('房间成员初始战团 = 权威组（selected_deck_group）');

check('账号旧字段=2(战团2) 但权威组=team3 → 成员必须是战团3', () => {
  const member = memberForUser({ id: 1, nickname: 'a', selectedDeckNo: 2, selectedDeckGroup: 'team3' });
  assert.equal(member.selectedDeckNo, 3, `实际 ${member.selectedDeckNo}`);
});

check('权威组=default → 成员是默认组 0（旧字段的 1 不能顶上来）', () => {
  const member = memberForUser({ id: 2, nickname: 'b', selectedDeckNo: 1, selectedDeckGroup: 'default' });
  assert.equal(member.selectedDeckNo, 0, `实际 ${member.selectedDeckNo}`);
});

check('权威组=team2 → 2（用户遇到"被重定向到战团2"的那种值）', () => {
  const member = memberForUser({ id: 3, nickname: 'c', selectedDeckNo: 3, selectedDeckGroup: 'team2' });
  assert.equal(member.selectedDeckNo, 2, `实际 ${member.selectedDeckNo}`);
});

check('老账号没有 group 字段 → 退回 selectedDeckNo（兼容）', () => {
  const member = memberForUser({ id: 4, nickname: 'd', selectedDeckNo: 2, selectedDeckGroup: undefined });
  assert.equal(member.selectedDeckNo, 2, `实际 ${member.selectedDeckNo}`);
});

check('setDeck(0) 允许选中默认组（不能被夹回 1）', () => {
  const manager = Object.create(RoomManager.prototype);
  manager.userRoom = new Map();
  manager.joinSequence = 0;
  const room = { id: 9, members: new Map(), status: 'waiting' };
  manager.addMember(room, { id: 5, nickname: 'e', selectedDeckGroup: 'team1' }, 'blue', true);
  manager.rooms = new Map([[9, room]]);
  manager.getRoomByUser = () => room;
  manager.snapshot = () => room;
  manager.setDeck(5, 0);
  assert.equal(room.members.get(5).selectedDeckNo, 0, `实际 ${room.members.get(5).selectedDeckNo}`);
});

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
