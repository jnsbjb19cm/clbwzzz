import { RoomView } from './RoomView.js';
import { authStore } from '../core/AuthStore.js';
import { DeckSelectView } from './DeckSelectView.js';

// Reuse the live multiplayer room, authority sync, renderer and controls. The
// run owns its deck: the shared drawer never saves permanent account groups.
export class EndlessRoomView extends RoomView {
  constructor(db, run, { onExit, onResult, onDeckUpdate, onStart, inventory, preparationOnly = false }) {
    super(db, { player: authStore.snapshot?.profile ?? { level: 1 }, onNavigate: () => this.exitBattle() });
    this.run = run; this.onExitRun = onExit; this.onRunResult = onResult; this.closed = false;
    this.onDeckUpdate = onDeckUpdate; this.onStartRun = onStart; this.ownedInventory = inventory;
    this.preparationOnly = preparationOnly;
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
      this.buildSelectionPool();
      this.enterRoom(room);
      if (['starting', 'battling'].includes(room.status)) this.enterBattle();
    });
    // The parent awaits this promise and shows a retryable error, never a local fallback.
    this.ready.catch(() => {});
  }
  buildSelectionPool() {
    const slots = [...this.run.roster.filter(c => this.run.mode !== 'trial' || this.run.deck.includes(c.uid))];
    if (this.run.mode === 'trial') (this.ownedInventory?.getSlots() ?? []).forEach((card, index) => {
      if (!card || !this.db.getById(card.cardId)?.isCollectible?.() || (card.expiresAt && card.expiresAt <= Date.now())) return;
      if (slots.some(c => c._ownedKey === `bag:${index}` && c.cardId === card.cardId)) return;
      slots.push({ ...card, uid: `owned-${index}-${card.cardId}`, _ownedKey: `bag:${index}` });
    });
    this.cardInventory = { getSlots: () => slots, findFirstInstance: id => {
      const index = slots.findIndex(c => c.cardId === Number(id));
      return index < 0 ? null : { index, slot: slots[index] };
    } };
  }
  async saveSelection(indices) {
    if (this.savingSelection) throw new Error('正在确认战团，请稍候');
    const entries = indices.map(i => this.cardInventory.getSlots()[i]);
    if (entries.length === this.run.deck.length && entries.every((c, i) => c?.uid === this.run.deck[i])) return;
    this.savingSelection = true;
    try {
      const result = await this.socket.emitAck('room:endless-deck', { attempt: this.run.attempt, entries });
      if (this.closed) return;
      this.run = result.endless; this.room.endless = result.endless;
      this.onDeckUpdate?.(result.endless);
      this.buildSelectionPool(); this.renderRoomInside();
    } finally { this.savingSelection = false; }
  }
  renderRoomInside() {
    if (!this.room || this.closed || this.roomBattleView) return;
    const panel = this.root.querySelector('#lobby-room-inside');
    panel.dataset.endlessPreparation = 'true';
    window.__pvpMapScene = ({2:'grass',4:'ice',7:'rock',8:'forest',9:'fire',10:'beach',11:'temple'})[this.room.mapId] || 'grass';
    const start = async () => {
      if (this.startPending) return;
      this.startPending = true;
      try {
        if (this.deckSelect._drawerOpen) throw new Error('请先确定或取消换卡，再开始');
        await this.saveSelection(this.deckSelect._selected);
        await this.onStartRun?.();
        if (this.preparationOnly) await this.exitBattle();
        else await this.socket.startGame();
      }
      catch (error) { this.deckSelect._showToast?.(panel, error.message); }
      finally { this.startPending = false; }
    };
    this.deckSelect ??= new DeckSelectView();
    this.deckSelect.render(panel, {
      db: this.db, cardInventory: this.cardInventory,
      deckSlots: this.run.deck.map(uid => this.cardInventory.getSlots().findIndex(card => card.uid === uid)),
      stageId: Number(this.room.stageId), stages: this.db.stages, mode: 'pve', isOwner: true,
      playerName: this.room.members[0]?.nickname, playerLv: this.room.members[0]?.level,
      roomState: { endless: true, roomId: this.room.id, myUserId: this.currentUserId(),
        stageName: `${this.room.name} · 单人`, members: this.room.members, myTeam: 'blue',
        onStart: start, onReady: start, onSaveRunDeck: indices => this.saveSelection(indices) },
      onConfirm: start, onBack: () => this.exitBattle(),
    });
    panel.querySelector('.game-room')?.classList.add('endless-preparation-room');
    const tab = panel.querySelector('.deck-tab[data-tab="default"]');
    if (tab) tab.textContent = '本局战团';
    // The reference-layout enhancer writes inline !important display values.
    // Remove inapplicable controls instead of letting it resurrect hidden tabs.
    panel.querySelectorAll('.deck-tab:not([data-tab="default"]),.dice-btn,.team-btn,.skill-btn').forEach(el => el.remove());
    const swap = panel.querySelector('#swap-card-btn');
    const canSwap = this.run.preparation?.initial || this.run.preparation?.swapsLeft > 0;
    if (swap) { swap.textContent = canSwap ? '调整本局战团' : '查看本局卡牌'; swap.title = '只影响本次挑战，不修改永久战团'; }
    const ready = panel.querySelector('#room-ready-btn');
    if (ready && this.preparationOnly) ready.textContent = '完成整备';
    const note = document.createElement('div'); note.className = 'endless-room-note';
    note.textContent = `${this.run.mode === 'trial' ? '自有背包选卡' : '本局储备选卡'} · ${this.run.preparation?.initial ? '出发前自由组队（1–10 张）' : `剩余 ${this.run.preparation?.swapsLeft || 0} 次替换`} · 确定后仅保存本局`;
    panel.querySelector('.game-room')?.append(note);
    // Keep account group/team controls isolated; selection itself uses the
    // shared drawer and the dedicated run-only save callback above.
    if (!panel.__endlessLockedDeck) {
      panel.__endlessLockedDeck = true;
      for (const type of ['click', 'dblclick']) panel.addEventListener(type, event => {
        if (!event.target.closest?.('.deck-tab,.dice-btn,.team-btn,.skill-btn,.room-invite-btn')) return;
        event.preventDefault(); event.stopImmediatePropagation();
      }, true);
    }
  }
  enterBattle() {
    if (this.closed || !this.room?.endless || this.roomBattleView) return;
    return super.enterBattle();
  }
  refreshRoom(room) {
    // Normal rooms reconcile saved account groups; run decks must not enter that path.
    if (room && room.endless?.attempt === this.run.attempt) this.room = room;
    if (!this.closed && !this.roomBattleView) this.renderRoomInside();
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
