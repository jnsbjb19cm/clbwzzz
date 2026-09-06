import assert from 'node:assert/strict';
import fs from 'node:fs';

const mod = await import('../src/ui/RoomChatPersistence20260906.js');
const { mergeRoomChatHistory20260906, replayRoomChatHistory20260906 } = mod;

assert.equal(typeof mergeRoomChatHistory20260906, 'function');
assert.equal(typeof replayRoomChatHistory20260906, 'function');

const view = { _roomChatHistory20260906: [] };
mergeRoomChatHistory20260906(view, [
  { id: '1', nickname: '甲', text: '第一条', channel: 'current', team: 'blue' },
  { id: '2', nickname: '乙', text: '第二条', channel: 'team', team: 'red' },
]);
mergeRoomChatHistory20260906(view, [
  { id: '2', nickname: '乙', text: '第二条', channel: 'team', team: 'red' },
  { id: '3', nickname: '系统', text: '第三条', channel: 'system', system: true },
]);
assert.deepEqual(view._roomChatHistory20260906.map((m) => m.id), ['1', '2', '3'], 'room chat must dedupe by message id');
assert.equal(view._roomChatHistory20260906[1].channel, 'team');
assert.equal(view._roomChatHistory20260906[1].team, 'red');
assert.equal(view._roomChatHistory20260906[2].system, true);

const rows = [];
const log = {
  replaceChildren() { rows.length = 0; },
  append(row) { rows.push(row); },
  scrollTop: 0,
  scrollHeight: 120,
};
const chat = { dataset: { activeChannel: 'current' } };
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
view.root = {
  querySelector(selector) {
    if (selector === '.exact-room-chat-log') return log;
    if (selector === '.exact-room-chat') return chat;
    return null;
  },
};

assert.equal(replayRoomChatHistory20260906(view), true, 'room chat should replay once exact chat DOM exists');
assert.equal(rows.length, 1, 'current tab must show current-channel messages only');
assert.equal(rows[0].children[1].text, '第一条');
assert.match(rows[0].className, /channel-current/, 'current-room chat needs its own presentation class');

chat.dataset.activeChannel = 'team';
assert.equal(replayRoomChatHistory20260906(view), true);
assert.equal(rows.length, 1, 'team tab must show team-channel messages only');
assert.equal(rows[0].children[1].text, '第二条');
assert.match(rows[0].className, /channel-team/, 'team-room chat needs its own presentation class');
assert.match(rows[0].className, /team-red/, 'team-room chat needs sender-team presentation');

chat.dataset.activeChannel = 'system';
assert.equal(replayRoomChatHistory20260906(view), true);
assert.equal(rows.length, 1, 'system tab must show system-channel messages only');
assert.equal(rows[0].children[1].text, '第三条');
assert.match(rows[0].className, /channel-system/, 'system-room chat needs its own presentation class');

for (let i = 4; i <= 70; i += 1) {
  mergeRoomChatHistory20260906(view, [{ id: String(i), nickname: '测', text: String(i), channel: 'current' }]);
}
assert.equal(view._roomChatHistory20260906.length, 50, 'room chat cache must stay capped at 50 messages');
assert.equal(view._roomChatHistory20260906.at(-1).id, '70');

globalThis.document = oldDocument;

const clientSource = fs.readFileSync(new URL('../src/ui/RoomChatChannelFix20260906.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../server/socket/BattleChatService.js', import.meta.url), 'utf8');
const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../src/ui/RoomChatChannelFix20260906.css', import.meta.url), 'utf8');
const persistenceSource = fs.readFileSync(new URL('../src/ui/RoomChatPersistence20260906.js', import.meta.url), 'utf8');

assert.match(clientSource, /room:chat:v2/, 'room client must use the channel-aware chat protocol');
assert.match(clientSource, /event\.detail\?\.channel/, 'room UI must preserve the selected channel when sending');
assert.match(clientSource, /系统频道为只读频道/, 'system room-chat channel must be read-only');
assert.match(clientSource, /mergeRoomChatHistory20260906/, 'room snapshots must hydrate public chat history after reconnect/rerender');
assert.match(clientSource, /replayRoomChatHistory20260906/, 'tab changes and room rerenders must replay the selected channel');
assert.match(clientSource, /RoomView\.prototype\.enterRoom/, 'entering a room must hydrate snapshot chat history');
assert.match(clientSource, /RoomView\.prototype\.refreshRoom/, 'room snapshot refreshes must preserve chat history');
assert.match(persistenceSource, /messageChannel !== activeChannel/, 'room chat replay must filter by the selected channel');

assert.match(serverSource, /socket\.on\('room:chat:v2'/, 'server must handle the channel-aware room chat protocol');
assert.match(serverSource, /channel === 'team'/, 'server must implement team-only room chat delivery');
assert.match(serverSource, /socketsForUser/, 'team chat must target only the matching team sockets');
assert.match(serverSource, /系统频道为只读频道/, 'server must reject forged system-channel messages');
assert.match(
  serverSource,
  /if \(channel === 'team'\) \{[\s\S]*?emitTeamChat\([\s\S]*?\} else \{[\s\S]*?pushRoomChat\(room, entry\)/,
  'team chat must never enter public room.chat snapshot history',
);

assert.match(bootstrapSource, /installRoomChatChannelFix20260906\(\)/, 'channel fix must be installed before RoomView instances are created');
assert.match(cssSource, /channel-current/, 'current channel needs a dedicated high-contrast style');
assert.match(cssSource, /channel-team/, 'team channel needs a dedicated high-contrast style');
assert.match(cssSource, /channel-system/, 'system channel needs a dedicated high-contrast style');
assert.match(cssSource, /team-blue/, 'blue team names need a dedicated color');
assert.match(cssSource, /team-red/, 'red team names need a dedicated color');

console.log('PASS room chat lifecycle + channel authority + privacy 20260906');