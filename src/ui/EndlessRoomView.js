import { RoomView } from './RoomView.js';
import { authStore } from '../core/AuthStore.js';

// Reuse the live multiplayer room, authority sync, renderer and controls. The
// camp already chooses the run deck, so this room never saves permanent decks.
export class EndlessRoomView extends RoomView {
  constructor(db, run, { onExit, onResult }) {
    super(db, { player: authStore.snapshot?.profile ?? { level: 1 }, onNavigate: () => this.exitBattle() });
    this.run = run; this.onExitRun = onExit; this.onRunResult = onResult; this.closed = false;
    this.socket.startGame = () => this.socket.emitAck('room:start').then(data => data.room);
  }
  refreshRooms() {} // Private room: never show or join the public lobby.
  render(root) {
    super.render(root);
    root.addEventListener('click', event => {
      if (event.target.closest?.('#result-retry,#result-next,#result-exit,#battle-back')) {
        event.preventDefault(); event.stopImmediatePropagation(); void this.exitBattle();
      }
    }, true);
  }
  bindEvents() {
    super.bindEvents();
    const receive = snapshot => {
      if (this.closed || this.resultReceived || snapshot?.endless?.attempt !== this.run.attempt
        || snapshot.status !== 'finished' || !snapshot.endless.result) return;
      this.resultReceived = true;
      this.onRunResult(snapshot.endless.result);
    };
    this.unsubs.push(this.socket.on('pvp:authority:snapshot', receive), this.socket.on('pvp:authority:finished', receive));
  }
  autoCreateRoom() {
    if (this.ready) return;
    this.ready = this.socket.createRoom({ mode: 'pve', size: '1v1', endless: this.run }).then(room => {
      if (!room.endless || room.endless.attempt !== this.run.attempt) throw new Error('服务器尚未支持无尽房间，请更新并重启服务端');
      if (this.closed) return this.socket.leaveRoom();
      this.run = room.endless;
      const slots = room.endless.roster;
      this.cardInventory = { getSlots: () => slots, findFirstInstance: id => {
        const index = slots.findIndex(c => c.cardId === Number(id));
        return index < 0 ? null : { index, slot: slots[index] };
      } };
      this.enterRoom(room);
      if (['starting', 'battling'].includes(room.status)) this.enterBattle();
    });
    // The parent awaits this promise and shows a retryable error, never a local fallback.
    this.ready.catch(() => {});
  }
  renderRoomInside() {
    if (!this.room || this.closed || this.roomBattleView) return;
    const panel = this.root.querySelector('#lobby-room-inside');
    panel.innerHTML = '<section class="endless-room-ready endless-panel"><small>单人专用 · 正式战斗房间</small><h2></h2><p>使用本局已选卡组；换卡请返回营地。不会覆盖永久战团。</p><div class="endless-cards"></div><p role="alert"></p><button class="primary" data-endless-start>开始战斗</button><button data-endless-back>返回营地</button></section>';
    panel.querySelector('h2').textContent = `${this.room.name} · 房间 ${this.room.id}`;
    for (const uid of this.run.deck) {
      const instance = this.run.roster.find(c => c.uid === uid), card = this.db.getById(instance.cardId);
      const tile = document.createElement('span'); tile.className = 'endless-card';
      const img = document.createElement('img'); img.src = `/sprites/cards/${card.spriteRes}.png`; img.alt = card.name;
      const label = document.createElement('span'); label.textContent = card.name;
      tile.append(img, label); panel.querySelector('.endless-cards').append(tile);
    }
    panel.querySelector('[data-endless-back]').onclick = () => this.exitBattle();
    const button = panel.querySelector('[data-endless-start]');
    button.onclick = async () => {
      button.disabled = true;
      try { await this.socket.startGame(); }
      catch (error) { panel.querySelector('[role=alert]').textContent = error.message; button.disabled = false; }
    };
  }
  enterBattle() {
    if (this.closed || !this.room?.endless || this.roomBattleView) return;
    return super.enterBattle();
  }
  async exitBattle() {
    if (this.closed) return;
    await this.destroy();
    this.onExitRun();
  }
  leaveRoom() { return this.exitBattle(); }
  destroy() {
    if (this.cleanup) return this.cleanup;
    this.closed = true;
    this.roomBattleView?.destroy?.(); this.roomBattleView = null;
    for (const off of this.unsubs) off(); this.unsubs = [];
    this.cleanup = this.socket.leaveRoom().catch(() => {}).finally(() => {
      this.room = null; this.snap = null;
      super.destroy();
      document.body.classList.remove('battle-immersive', 'pvp-battle-active', 'coop-pve-active');
    });
    return this.cleanup;
  }
}
