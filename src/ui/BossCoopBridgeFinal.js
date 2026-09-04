import { audio } from '../core/AudioManager.js';
import { markBossCleared } from '../core/BossProgress.js';
import { DeckSelectView } from './DeckSelectView.js';
import { BattleView } from './BattleView.js';
import { RoomView } from './RoomView.js';
import { ensurePlayerStands } from './PvpCombatPolishFinal.js';

const PATCH_FLAG = Symbol.for('clbwzzz.bossCoopBridgeFinal');

function normalizeDeck(value) {
  return Array.isArray(value)
    ? value.map(Number).filter((index) => Number.isInteger(index) && index >= 0).slice(0, 10)
    : [];
}

function bossTitle(room, snapshot = null) {
  const bossName = snapshot?.boss?.name;
  const difficulty = snapshot?.boss?.difficulty || room?.difficulty || '简单';
  if (bossName) return `${bossName}：${difficulty}`;
  return snapshot?.title || room?.name || `BOSS：${difficulty}`;
}

function decorateBossBattle(view, snapshot = null) {
  const root = view.viewRoot;
  root?.querySelector?.('.battle-page')?.classList.add('coop-boss-battle');
  const title = bossTitle(view.pvp?.room, snapshot);
  const stage = root?.querySelector?.('.immersive-stage');
  if (stage) stage.textContent = `☠ ${title}`;
  const wrap = root?.querySelector?.('.battle-game-wrap');
  if (wrap) {
    wrap.dataset.battleMode = 'boss';
    wrap.dataset.bossId = String(snapshot?.boss?.id || view.pvp?.bossId || '');
    wrap.dataset.bossDifficulty = String(snapshot?.boss?.difficulty || view.pvp?.difficulty || '');
  }
  ensurePlayerStands(view, snapshot?.players ?? view.__pvpLatestSnapshot?.players ?? []);
  const bossName = snapshot?.boss?.name || title.split('：')[0];
  const enemyName = root?.querySelector?.('#orb-enemy-name');
  if (enemyName) enemyName.textContent = bossName;

  const bossUid = Number((snapshot?.units ?? []).find((unit) => unit.boss)?.uid);
  const bossCardId = Number(snapshot?.boss?.cardId);
  const bossData = (snapshot?.units ?? []).find((unit) => Number(unit.uid) === bossUid || unit.boss);
  const bossUnit = (view.engine?.units ?? []).find((unit) =>
    (bossUid && Number(unit.uid) === bossUid)
      || (bossCardId && Number(unit.cardId) === bossCardId && unit.team === 'enemy'));
  if (bossUnit) {
    bossUnit.name = bossName;
    bossUnit.isBoss = true;
    bossUnit.pvpBoss = true;
    bossUnit.moveSpeed = 0;
    bossUnit.__bossDisplayScale = Math.max(
      1,
      Number(bossData?.bossScale) || Number(snapshot?.boss?.displayScale) || 4,
    );
  }

  document.body.classList.add('pvp-battle-active', 'boss-coop-active');
  audio.playBgm('boss', { fade: true });
}

function enterCoopBossBattle(roomView) {
  const inside = roomView.root?.querySelector?.('#lobby-room-inside');
  const panel = roomView.root?.querySelector?.('#lobby-battle');
  inside?.classList.add('hidden');
  panel?.classList.remove('hidden');
  document.body.classList.add('battle-immersive', 'pvp-battle-active', 'boss-coop-active');

  const deckSlots = normalizeDeck(
    DeckSelectView.loadSavedDeck(roomView.cardInventory, roomView.db)
      ?? DeckSelectView.defaultDeckSlots(roomView.cardInventory, roomView.db),
  );
  roomView.roomBattleView?.destroy?.();
  roomView.roomBattleView = new BattleView(roomView.db, {
    cardInventory: roomView.cardInventory,
    heroSkills: globalThis.__clbwzHeroSkills ?? null,
    pvp: {
      mode: 'boss',
      roomId: roomView.room.id,
      room: roomView.room,
      team: 'blue',
      socket: roomView.socket,
      deckSlots,
      mapId: roomView.room.mapId || '4',
      bossId: roomView.room.bossId,
      difficulty: roomView.room.difficulty,
    },
    onNavigate: roomView.onNavigate,
  });
  roomView.roomBattleView.render(panel);

  roomView._pvpExitBtn?.remove?.();
  roomView._pvpSettingsBtn?.remove?.();
  roomView._pvpOverlayControls?.remove?.();

  const controls = document.createElement('div');
  controls.id = 'pvp-overlay-controls';
  controls.style.cssText = 'position:fixed;top:12px;right:14px;z-index:400;display:flex;gap:8px;';

  const settings = document.createElement('button');
  settings.id = 'pvp-settings-ov';
  settings.className = 'pvp-exit-btn pvp-wilderness-battle-exit boss-coop-settings';
  settings.type = 'button';
  settings.textContent = '设置';
  settings.style.position = 'static';
  settings.addEventListener('click', () => {
    const panel = roomView.roomBattleView?.viewRoot?.querySelector?.('#settings-panel');
    panel?.classList.toggle('hidden');
  });

  const exit = document.createElement('button');
  exit.id = 'pvp-exit-ov';
  exit.className = 'pvp-exit-btn pvp-wilderness-battle-exit boss-coop-exit';
  exit.type = 'button';
  exit.textContent = '退出挑战';
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
}

function installForBattleView(view) {
  if (view.pvp?.mode !== 'boss' || view.__bossCoopBridgeInstalled) return;
  view.__bossCoopBridgeInstalled = true;
  decorateBossBattle(view, view.__pvpLatestSnapshot);
  if (view.pvpSocket?.on) {
    view.__bossCoopSnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      if (snapshot?.mode !== 'boss') return;
      queueMicrotask(() => decorateBossBattle(view, snapshot));
    });
    view.__bossCoopFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      if (snapshot?.mode !== 'boss') return;
      if (snapshot?.winner === 'blue' && !view.__bossProgressReported) {
        markBossCleared(
          snapshot?.boss?.id || view.pvp?.bossId,
          snapshot?.boss?.difficulty || view.pvp?.difficulty,
        );
        view.__bossProgressReported = true;
      }
      queueMicrotask(() => {
        decorateBossBattle(view, snapshot);
        view.updateResultOverlay?.(view.viewRoot);
      });
    });
  }
}

function cleanupBattleView(view) {
  view.__bossCoopSnapshotUnsub?.();
  view.__bossCoopFinishedUnsub?.();
  view.__bossCoopSnapshotUnsub = null;
  view.__bossCoopFinishedUnsub = null;
  view.__bossCoopBridgeInstalled = false;
  document.body.classList.remove('boss-coop-active');
}

export function installBossCoopBridgeFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousEnterBattle = RoomView.prototype.enterBattle;
  RoomView.prototype.enterBattle = function enterAuthorityBossBattle() {
    if (this.room?.mode !== 'boss') return previousEnterBattle.call(this);
    return enterCoopBossBattle(this);
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderCoopBossBattle(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp?.mode === 'boss') installForBattleView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyCoopBossBridge() {
    cleanupBattleView(this);
    return previousDestroy.call(this);
  };

  const previousRoomDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyCoopBossRoom() {
    this._pvpExitBtn?.remove?.();
    this._pvpExitBtn = null;
    this._pvpSettingsBtn?.remove?.();
    this._pvpSettingsBtn = null;
    this._pvpOverlayControls?.remove?.();
    this._pvpOverlayControls = null;
    document.body.classList.remove('boss-coop-active');
    return previousRoomDestroy.call(this);
  };

  window.__verifyBossCoopBridgeFinal = () => {
    const wrap = document.querySelector('.coop-boss-battle .battle-game-wrap');
    const battle = window.__bossCoopFixtureBattle ?? window.__pvpFixtureBattle;
    const bossUnit = battle?.engine?.units?.find((unit) => unit.isBoss || unit.pvpBoss);
    return {
      enabled: true,
      active: Boolean(wrap),
      mode: wrap?.dataset.battleMode ?? null,
      bossId: wrap?.dataset.bossId ?? null,
      difficulty: wrap?.dataset.bossDifficulty ?? null,
      title: document.querySelector('.coop-boss-battle .immersive-stage')?.textContent ?? null,
      authority: Boolean(battle?.__pvpAuthorityActive),
      unitName: bossUnit?.name ?? null,
      unitCardId: Number(bossUnit?.cardId) || null,
      unitLane: Number(bossUnit?.lane),
      unitCol: Number(bossUnit?.col),
      unitMovable: Boolean(bossUnit?.isMovable?.()),
      unitDisplayScale: Number(bossUnit?.__bossDisplayScale) || 1,
    };
  };
}
