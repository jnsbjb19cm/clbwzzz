/**
 * 2026-09-11：野外冒险(PVE)联机桥接。
 *
 * 背景：野外冒险「进入战斗」原本走 onNavigate('room', {stageId, autoCreate})，
 * 但房主按开始后 RoomView.enterBattle() 会 `onNavigate('battle', {stageId})`，
 * 把所有人各自丢进原来的**单机**战斗 —— 这不是多人房间。
 *
 * 现在：mode==='pve' 的房间启动后，所有成员进入**同一个服务端权威合作战斗**
 * （复用 BOSS 联机那套 CoopBossBattle + pvp:authority:* 快照管线），
 * 共享同一波敌人、各自部署；胜负由服务端判定，奖励按「各自结算」由每个客户端
 * 走现有冒险结算（App.handleBattleResult → /player/stage-result）。
 */
import { audio } from '../core/AudioManager.js';
import { DeckSelectView } from './DeckSelectView.js';
import { BattleView } from './BattleView.js';
import { RoomView } from './RoomView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.adventureCoopBridge20260911');

function normalizeDeck(value) {
  return Array.isArray(value)
    ? value.map(Number).filter((index) => Number.isInteger(index) && index >= 0).slice(0, 10)
    : [];
}

function stageTitle(view, snapshot = null) {
  return snapshot?.title
    || view.pvp?.room?.name
    || view.__pvpLatestSnapshot?.stage?.name
    || '冒险';
}

function decoratePveBattle(view, snapshot = null) {
  const root = view.viewRoot;
  if (!root) return;
  root.querySelector('.battle-page')?.classList.add('coop-pve-battle');
  const stage = root.querySelector('.immersive-stage');
  if (stage) stage.textContent = `🗺 ${stageTitle(view, snapshot)}`;
  const wrap = root.querySelector('.battle-game-wrap');
  if (wrap) {
    wrap.dataset.battleMode = 'pve';
    wrap.dataset.stageId = String(snapshot?.stage?.id ?? view.pvp?.stageId ?? '');
  }
  if (snapshot?.wave) {
    const waveNum = root.querySelector('#wave-num');
    const waveTotal = root.querySelector('#wave-total');
    if (waveNum) waveNum.textContent = String(snapshot.wave.number ?? 0);
    if (waveTotal) waveTotal.textContent = String(snapshot.wave.total ?? 0);
  }
  const enemyName = root.querySelector('#orb-enemy-name');
  if (enemyName && snapshot?.stage?.name) enemyName.textContent = snapshot.stage.name;
  document.body.classList.add('pvp-battle-active', 'coop-pve-active');
  audio.playBgm?.('battle', { fade: true });
}

function buildOverlayControls(roomView, view) {
  roomView._pvpExitBtn?.remove?.();
  roomView._pvpSettingsBtn?.remove?.();
  roomView._pvpOverlayControls?.remove?.();

  const controls = document.createElement('div');
  controls.id = 'coop-pve-overlay-controls';
  controls.style.cssText = 'position:fixed;top:12px;right:14px;z-index:400;display:flex;gap:8px;';

  const settings = document.createElement('button');
  settings.id = 'pvp-settings-ov';
  settings.className = 'pvp-exit-btn pvp-wilderness-battle-exit coop-pve-settings';
  settings.type = 'button';
  settings.textContent = '设置';
  settings.style.position = 'static';
  settings.addEventListener('click', () => {
    const panel = roomView.roomBattleView?.viewRoot?.querySelector?.('#settings-panel');
    panel?.classList.toggle('hidden');
  });

  const exit = document.createElement('button');
  exit.id = 'pvp-exit-ov';
  exit.className = 'pvp-exit-btn pvp-wilderness-battle-exit coop-pve-exit';
  exit.type = 'button';
  exit.textContent = '退出战斗';
  exit.style.position = 'static';
  exit.addEventListener('click', () => {
    roomView.roomBattleView?.destroy?.();
    roomView.roomBattleView = null;
    controls.remove();
    roomView._pvpExitBtn = null;
    roomView._pvpSettingsBtn = null;
    roomView._pvpOverlayControls = null;
    roomView.exitBattle();
  });

  controls.append(settings, exit);
  document.body.append(controls);
  roomView._pvpExitBtn = exit;
  roomView._pvpSettingsBtn = settings;
  roomView._pvpOverlayControls = controls;
  return view;
}

function enterCoopAdventureBattle(roomView) {
  const inside = roomView.root?.querySelector?.('#lobby-room-inside');
  const panel = roomView.root?.querySelector?.('#lobby-battle');
  inside?.classList.add('hidden');
  panel?.classList.remove('hidden');
  document.body.classList.add('battle-immersive', 'pvp-battle-active', 'coop-pve-active');

  const stageId = Number(roomView.room?.stageId) || 1;
  const deckSlots = normalizeDeck(
    DeckSelectView.loadSavedDeck(roomView.cardInventory, roomView.db)
      ?? DeckSelectView.defaultDeckSlots(roomView.cardInventory, roomView.db),
  );
  roomView.roomBattleView?.destroy?.();
  const view = new BattleView(roomView.db, {
    cardInventory: roomView.cardInventory,
    heroSkills: globalThis.__clbwzHeroSkills ?? null,
    stageId,
    pvp: {
      mode: 'pve',
      roomId: roomView.room.id,
      room: roomView.room,
      team: 'blue',
      socket: roomView.socket,
      deckSlots,
      mapId: roomView.room.mapId || stageId,
      stageId,
    },
    onNavigate: roomView.onNavigate,
    // 各自结算：把服务端权威战斗里的共享掉落带上，交给 App 走现有冒险结算。
    onBattleResult: (result) => {
      const snapshot = view.__pvpLatestSnapshot;
      const drops = result?.won && Array.isArray(snapshot?.lootDrops) ? snapshot.lootDrops : [];
      globalThis.__clbwzAppInstance?.handleBattleResult?.({ ...result, mode: 'pve', drops });
    },
  });
  roomView.roomBattleView = view;
  view.render(panel);
  buildOverlayControls(roomView, view);
  return view;
}

function installForBattleView(view) {
  if (view.pvp?.mode !== 'pve' || view.__adventureCoopInstalled) return;
  view.__adventureCoopInstalled = true;
  decoratePveBattle(view, view.__pvpLatestSnapshot);
  if (view.pvpSocket?.on) {
    view.__adventureCoopSnapUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      if (snapshot?.mode !== 'pve') return;
      queueMicrotask(() => decoratePveBattle(view, snapshot));
    });
    view.__adventureCoopFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      if (snapshot?.mode !== 'pve') return;
      queueMicrotask(() => {
        decoratePveBattle(view, snapshot);
        view.updateResultOverlay?.(view.viewRoot);
      });
    });
  }
}

function cleanupBattleView(view) {
  view.__adventureCoopSnapUnsub?.();
  view.__adventureCoopFinishedUnsub?.();
  view.__adventureCoopSnapUnsub = null;
  view.__adventureCoopFinishedUnsub = null;
  view.__adventureCoopInstalled = false;
  document.body.classList.remove('coop-pve-active');
}

export function installAdventureCoopBridge20260911() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousEnterBattle = RoomView.prototype.enterBattle;
  RoomView.prototype.enterBattle = function enterAuthorityAdventureBattle() {
    if (this.room?.mode !== 'pve') return previousEnterBattle.call(this);
    return enterCoopAdventureBattle(this);
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderCoopAdventureBattle(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp?.mode === 'pve') installForBattleView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyCoopAdventureBridge() {
    cleanupBattleView(this);
    return previousDestroy.call(this);
  };

  const previousRoomDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyCoopAdventureRoom() {
    document.getElementById('coop-pve-overlay-controls')?.remove();
    this._pvpExitBtn = null;
    this._pvpSettingsBtn = null;
    this._pvpOverlayControls = null;
    document.body.classList.remove('coop-pve-active');
    return previousRoomDestroy.call(this);
  };

  window.__verifyAdventureCoopBridge20260911 = () => {
    const battle = window.__pvpFixtureBattle;
    const wrap = document.querySelector('.coop-pve-battle .battle-game-wrap');
    return {
      enabled: true,
      active: Boolean(wrap),
      mode: wrap?.dataset.battleMode ?? null,
      stageId: wrap?.dataset.stageId ?? null,
      title: document.querySelector('.coop-pve-battle .immersive-stage')?.textContent ?? null,
      authority: Boolean(battle?.__pvpAuthorityActive),
    };
  };
}
