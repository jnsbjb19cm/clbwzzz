import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleUnit } from '../battle/BattleUnit.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { DeckSelectView } from './DeckSelectView.js';
import { BattleView } from './BattleView.js';
import { SocketClient } from '../network/SocketClient.js';
import { authStore } from '../core/AuthStore.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpBattleBridgeFinal');

function normalizeDeck(value) {
  return Array.isArray(value)
    ? value.map(Number).filter((index) => Number.isInteger(index) && index >= 0).slice(0, 10)
    : [];
}

function stageName(mapId) {
  if (String(mapId) === '4') return '极寒冰原';
  if (String(mapId) === '7') return '熔岩峡谷';
  return '野外草原';
}

function spawnAlly(view, payload, card) {
  const engine = view.engine;
  const lane = Math.max(0, Math.min(4, Math.round(Number(payload.lane) || 0)));
  const col = Math.max(0, Math.min(11, Math.round(Number(payload.col) || 0)));
  const unit = new BattleUnit({ card, lane, col, team: 'player' });
  unit.pvpOwner = payload.nickname || '队友';
  unit.pvpRemote = true;
  unitAnimPlayer.resetClock(unit);
  engine.initUnitSpawnFade?.(unit);
  engine.units.push(unit);
  engine.pushDeployEffect?.(lane, col, 1);
  engine.pushLog?.(`队友【${card.name}】→ 第${lane + 1}路 ${col}列`);
}

function applyRemoteDeploy(view, payload) {
  if (!payload || !view.engine) return;
  const card = view.db?.getById?.(payload.cardId);
  if (!card) return;
  if (String(payload.team || '') === String(view.pvp?.team || 'blue')) {
    spawnAlly(view, payload, card);
  } else {
    view.engine.spawnOpponent(card, payload.lane, payload.col);
  }
  view.renderer?.requestSprite?.(card.spriteRes);
  view.renderer?.requestBullet?.(card.spriteRes);
}

function bindPvpSocket(view) {
  if (!view.pvp || view.pvpUnsub) return;
  if (view.pvp.socket) {
    view.pvpSocket = view.pvp.socket;
    view._ownsPvpSocket = false;
  } else {
    view.pvpSocket = new SocketClient({ getToken: () => authStore.token });
    view._ownsPvpSocket = true;
  }
  view.pvpUnsub = view.pvpSocket.on('pvp:deploy', (payload) => applyRemoteDeploy(view, payload));
}

function decorate(view, root) {
  root?.querySelector?.('.battle-page')?.classList.add('pvp-wilderness-battle');
  const wrap = root?.querySelector?.('.battle-game-wrap');
  if (wrap) {
    wrap.dataset.pvpRoomId = String(view.pvp?.roomId ?? '');
    wrap.dataset.pvpTeam = String(view.pvp?.team ?? 'blue');
    wrap.dataset.pvpMapId = String(view.pvp?.mapId ?? '4');
    wrap.dataset.pvpSpectator = String(Boolean(view.pvp?.spectator));
  }
  const ownLabel = root?.querySelector?.('.base-hp-slot.player .label');
  const enemyLabel = root?.querySelector?.('.base-hp-slot.enemy .label');
  if (ownLabel) ownLabel.textContent = view.pvp?.spectator ? '蓝方基地' : (view.pvp?.team === 'red' ? '红方基地' : '蓝方基地');
  if (enemyLabel) enemyLabel.textContent = view.pvp?.spectator ? '红方基地' : (view.pvp?.team === 'red' ? '蓝方基地' : '红方基地');
  const label = root?.querySelector?.('.immersive-stage');
  if (label) {
    label.textContent = view.pvp?.spectator
      ? `观众 · ${view.pvp?.mode === 'boss' ? 'BOSS' : 'PVP'} · ${stageName(view.pvp?.mapId)}`
      : `⚔ PVP · ${stageName(view.pvp?.mapId)}`;
  }
  root?.querySelector?.('.immersive-wave')?.remove?.();
  root?.querySelector?.('#stage-picker')?.closest?.('label')?.remove?.();
  root?.querySelector?.('#restart-btn')?.remove?.();
  if (view.pvp?.spectator) root?.querySelector?.('.battle-page')?.classList.add('spectator-battle');
  document.body.classList.add('pvp-battle-active');
}

function unbind(view) {
  view.pvpUnsub?.();
  view.pvpUnsub = null;
  if (view._ownsPvpSocket) view.pvpSocket?.disconnect?.();
  view.pvpSocket = null;
  view._ownsPvpSocket = false;
  document.body.classList.remove('pvp-battle-active');
}

export function installPvpBattleBridgeFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalRender = BattleView.prototype.render;
  BattleView.prototype.render = function renderPvpRoomBattle(root) {
    if (!this.pvp) return originalRender.call(this, root);
    this.viewRoot = root;
    const preferred = normalizeDeck(this.pvp.deckSlots);
    this.deckSlots = preferred.length
      ? preferred
      : DeckSelectView.loadSavedDeck(this.cardInventory, this.db)
        ?? DeckSelectView.defaultDeckSlots(this.cardInventory, this.db);
    return this.enterBattle(this.deckSlots, 1, {});
  };

  const originalEnterBattle = BattleView.prototype.enterBattle;
  BattleView.prototype.enterBattle = async function enterPvpBattle(deckSlots, stageId, options = {}) {
    if (!this.pvp) return originalEnterBattle.call(this, deckSlots, stageId, options);
    this.deckSlots = normalizeDeck(deckSlots);
    this.stageId = Number(stageId) || 1;
    this.trainingMode = false;
    // 观战不保存/覆盖玩家卡组，也不参与部署。
    if (this.pvp?.spectator !== true) DeckSelectView.saveDeck(this.deckSlots, this.cardInventory);
    this.phase = 'fighting';
    this.engine = new BattleEngine(this.db, this.stageId, this.deckSlots, this.cardInventory, {
      skillLoadout: this.heroSkills?.getLoadout?.() ?? [],
      heroMpMax: this.heroSkills?.getMpMax?.() ?? 100,
      trainingMode: false,
      pvp: true,
    });
    this.engine.pvp = true;
    this.engine.waveNumber = 0;
    this.engine.totalWaves = 0;
    this.engine.stage = {
      ...this.engine.stage,
      mapBg_res: Number(this.pvp.mapId) || 4,
      stage_name: `PVP · ${stageName(this.pvp.mapId)}`,
      enemy_name: this.pvp.team === 'red' ? '蓝方基地' : '红方基地',
      stage_type: 0,
    };
    bindPvpSocket(this);
    await this.renderBattle(this.viewRoot);
  };

  BattleView.prototype.initPvpSocket = function initSharedPvpSocket() {
    bindPvpSocket(this);
  };

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderPvpWilderness(root) {
    const result = await originalRenderBattle.call(this, root);
    if (this.pvp) decorate(this, root);
    return result;
  };

  const originalDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpBridge() {
    unbind(this);
    return originalDestroy.call(this);
  };

  window.__verifyPvpBattleBridgeFinal = () => {
    const wrap = document.querySelector('.battle-game-wrap[data-pvp-room-id]');
    return {
      enabled: true,
      active: Boolean(wrap),
      roomId: wrap?.dataset.pvpRoomId ?? null,
      team: wrap?.dataset.pvpTeam ?? null,
      mapId: wrap?.dataset.pvpMapId ?? null,
      hasWaves: Boolean(document.querySelector('.pvp-wilderness-battle .immersive-wave')),
      hasRestart: Boolean(document.querySelector('.pvp-wilderness-battle #restart-btn')),
    };
  };
}
