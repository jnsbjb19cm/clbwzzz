import { RoomView } from './RoomView.js';
import {
  mergeRoomChatHistory20260906,
  replayRoomChatHistory20260906,
} from './RoomChatPersistence20260906.js';

const PATCH_FLAG = Symbol.for('clbwz.roomChatRuntimePatch20260906');

export function installRoomChatRuntimePatch20260906() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousAppendChat = RoomView.prototype.appendChat;
  RoomView.prototype.appendChat = function appendPersistentRoomChat20260906(message = {}) {
    if (!this.room) return previousAppendChat.call(this, message);
    mergeRoomChatHistory20260906(this, [message]);
    replayRoomChatHistory20260906(this);
  };

  const previousBindRoomChat = RoomView.prototype.bindRoomChat;
  RoomView.prototype.bindRoomChat = function bindPersistentRoomChat20260906(...args) {
    const result = previousBindRoomChat.apply(this, args);
    if (!this._roomChatReadyHandler20260906) {
      this._roomChatReadyHandler20260906 = () => replayRoomChatHistory20260906(this);
      this.root?.addEventListener?.('clbwz:room-exact-ready', this._roomChatReadyHandler20260906);
    }
    replayRoomChatHistory20260906(this);
    return result;
  };

  const previousDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyPersistentRoomChat20260906(...args) {
    if (this._roomChatReadyHandler20260906) {
      this.root?.removeEventListener?.('clbwz:room-exact-ready', this._roomChatReadyHandler20260906);
      this._roomChatReadyHandler20260906 = null;
    }
    return previousDestroy.apply(this, args);
  };
}
