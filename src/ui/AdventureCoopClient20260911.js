import { authStore } from '../core/AuthStore.js';
import { BattleView } from './BattleView.js';
import { RoomView } from './RoomView.js';
import { markWorldStageCleared } from './WorldMapView.js';

const FLAG = Symbol.for('clbwzzz.adventureCoop20260911');
export function installAdventureCoopClient20260911() {
  if (globalThis[FLAG]) return;
  globalThis[FLAG] = true;
  const render = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function(root) {
    const result = await render.call(this, root);
    if (this.pvp?.mode !== 'pve' || this.pvp.spectator || this._adventureUnsubs) return result;
    const receive = snapshot => {
      if (snapshot?.mode !== 'pve' || !snapshot.adventureResult || this._adventureResult) return;
      this._adventureResult = snapshot.adventureResult;
      if (snapshot.winner === 'blue') markWorldStageCleared(snapshot.stageId);
      // The server already granted rewards. Refresh the full personal snapshot;
      // never call the legacy client-submitted stage-result endpoint here.
      void authStore.api.get('/player/snapshot').then(data => {
        authStore.snapshot = data;
        this.cardInventory?.applyServerSnapshot?.(data.cardInventory);
      }).catch(() => { this._adventureRefreshFailed = true; });
    };
    this._adventureUnsubs = ['pvp:authority:snapshot','pvp:authority:finished'].map(event => this.pvpSocket.on(event, receive));
    return result;
  };
  const overlay = BattleView.prototype.updateResultOverlay;
  BattleView.prototype.updateResultOverlay = function(root) {
    const result = overlay.call(this, root);
    if (this.pvp?.mode === 'pve' && !this.pvp.spectator) {
      const desc = root?.querySelector('#result-desc');
      const reward = this._adventureResult;
      if (desc && ['win','lose'].includes(this.engine?.status)) {
        desc.textContent = reward
          ? `${this.engine.status === 'win' ? '合作通关成功' : '本次挑战失败'} · 金币 +${reward.goldGain} · 经验 +${reward.expGain}${reward.firstClear ? ' · 首通奖励已发放' : ''}`
          : '战斗已结束，正在等待服务器结算…';
      }
    }
    return result;
  };
  const destroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function(...args) {
    this._adventureUnsubs?.forEach(unsubscribe => unsubscribe?.());
    this._adventureUnsubs = null;
    return destroy.apply(this,args);
  };
  // On a refresh/reconnect the server restores an existing room. Enter that
  // authoritative battle instead of treating it as a stale room and leaving it.
  const bind = RoomView.prototype.bindEvents;
  RoomView.prototype.bindEvents = function(...args) {
    const result = bind.apply(this,args);
    this.unsubs.push(this.socket.on('room:snapshot', room => {
      if (room?.mode !== 'pve' || !room.members?.some(member => Number(member.userId) === Number(this.currentUserId()))) return;
      if (!this.room) this.enterRoom(room);
      if (['starting','battling','finished'].includes(room.status) && !this.roomBattleView) this.enterBattle();
    }));
    return result;
  };
}
