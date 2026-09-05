import { audio } from '../core/AudioManager.js';
import { RoomView } from './RoomView.js';

let installed = false;

/** 让 2 小时到期/只剩人机的房间在客户端立即退出，而不是停留在失效房间画面。 */
export function installRoomLifetimeClientPatch() {
  if (installed) return;
  installed = true;

  const originalBindEvents = RoomView.prototype.bindEvents;
  RoomView.prototype.bindEvents = function bindEventsWithRoomLifetime(...args) {
    const result = originalBindEvents.apply(this, args);

    const unsub = this.socket?.on?.('room:expired', (payload = {}) => {
      const expiredId = Number(payload.roomId);
      const currentId = Number(this.room?.id || this.watchingRoomId || this.watchingRoom?.id || 0);
      if (expiredId && currentId && expiredId !== currentId) return;

      this.room = null;
      this.watchingRoomId = null;
      this.watchingRoom = null;
      this.roomBattleView?.destroy?.();
      this.roomBattleView = null;
      this.notice?.(payload.message || '房间已被系统自动解散。');
      audio.playBgm('room', { fade: true });
      this.exitRoom?.();
      void this.refreshRooms?.();
    });

    if (typeof unsub === 'function') this.unsubs?.push?.(unsub);
    return result;
  };
}
