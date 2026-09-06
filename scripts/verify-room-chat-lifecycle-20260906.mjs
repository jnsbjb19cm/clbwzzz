import assert from 'node:assert/strict';

const mod = await import('../src/ui/RoomChatPersistence20260906.js');
const { mergeRoomChatHistory20260906, replayRoomChatHistory20260906 } = mod;

assert.equal(typeof mergeRoomChatHistory20260906, 'function');
assert.equal(typeof replayRoomChatHistory20260906, 'function');

const view = { _roomChatHistory20260906: [] };
mergeRoomChatHistory20260906(view, [
  { id: '1', nickname: '甲', text: '第一条' },
  { id: '2', nickname: '乙', text: '第二条' },
]);
mergeRoomChatHistory20260906(view, [
  { id: '2', nickname: '乙', text: '第二条' },
  { id: '3', nickname: '丙', text: '第三条' },
]);
assert.deepEqual(view._roomChatHistory20260906.map((m) => m.id), ['1', '2', '3'], 'room chat must dedupe by message id');

const rows = [];
const log = {
  replaceChildren() { rows.length = 0; },
  append(row) { rows.push(row); },
  scrollTop: 0,
  scrollHeight: 120,
};
const oldDocument = globalThis.document;
globalThis.document = {
  createElement() {
    return {
      className: '',
      children: [],
      append(...nodes) { this.children.push(...nodes); },
    };
  },
  createTextNode(text) { return { text: String(text) }; },
};
view.root = { querySelector(selector) { return selector === '.exact-room-chat-log' ? log : null; } };
assert.equal(replayRoomChatHistory20260906(view), true, 'room chat should replay once exact chat DOM exists');
assert.equal(rows.length, 3, 'rerendered room chat must restore all cached room messages');
assert.equal(rows[2].children[1].text, '第三条');

for (let i = 4; i <= 70; i += 1) {
  mergeRoomChatHistory20260906(view, [{ id: String(i), nickname: '测', text: String(i) }]);
}
assert.equal(view._roomChatHistory20260906.length, 50, 'room chat cache must stay capped at 50 messages');
assert.equal(view._roomChatHistory20260906.at(-1).id, '70');

globalThis.document = oldDocument;
console.log('PASS room chat lifecycle 20260906');
