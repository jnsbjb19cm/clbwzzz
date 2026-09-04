import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleUnit } from '../battle/BattleUnit.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BUFFER_COLS, LANES } from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';
import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpBarrierSystem');
const PVP_BARRIER_HP = 750;

const PVP_BARRIER_CARD = Object.freeze({
  id: -9001,
  name: '中央壁垒',
  spriteRes: null,
  atk: 0,
  hp: PVP_BARRIER_HP,
  cooldown: 6,
  atkSpeed: 0,
  moveSpeed: 0,
  atkStyle: 1,
  viewType: 0,
  quality: 2,
  type: 2,
  atk_rate: 1,
  special_atk_effect: 0,
});

function normalizeMode(value, fallback = 'pve') {
  const mode = String(value ?? fallback).toLowerCase();
  return mode === 'pvp' || mode === 'boss' ? mode : 'pve';
}

function makeBarrier(lane, col, team) {
  const barrier = new BattleUnit({
    card: PVP_BARRIER_CARD,
    lane,
    col,
    team,
    instance: { craftQuality: 2, strengthLv: 0, star: 0 },
  });
  barrier.isPvpBarrier = true;
  barrier.name = team === 'player' ? '蓝方中央壁垒' : '红方中央壁垒';
  barrier.maxHp = PVP_BARRIER_HP;
  barrier.baseMaxHp = PVP_BARRIER_HP;
  barrier.hp = PVP_BARRIER_HP;
  barrier.atk = 0;
  barrier.moveSpeed = 0;
  barrier.atkStyle = 1;
  barrier.cardType = 2;
  barrier.craftQuality = 2;
  return barrier;
}

function applyModeToEngine(view) {
  if (!view?.engine) return;
  const mode = normalizeMode(view.battleMode, view.pvpMode ? 'pvp' : 'pve');
  view.battleMode = mode;
  view.pvpMode = mode === 'pvp';
  view.engine.battleMode = mode;
  view.engine.pvpMode = view.pvpMode;
  view.engine.ensurePvpBarriers?.();
}

export function installBattlePvpBarrierSystem() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleEngine.prototype.ensurePvpBarriers = function ensurePvpBarriers() {
    const pvp = Boolean(this.pvpMode || this.battleMode === 'pvp');
    if (!pvp) {
      this.units = (this.units ?? []).filter((unit) => !unit?.isPvpBarrier);
      this._pvpBarriersInitialized = false;
      return [];
    }

    if (!this._pvpBarriersInitialized) {
      for (let lane = 0; lane < LANES; lane += 1) {
        const specs = [
          { col: BUFFER_COLS[0], team: 'player' },
          { col: BUFFER_COLS[1], team: 'enemy' },
        ];
        for (const spec of specs) {
          const exists = this.units.some(
            (unit) => unit?.isPvpBarrier
              && unit.lane === lane
              && Math.round(unit.col) === spec.col
              && unit.team === spec.team,
          );
          if (!exists) this.units.push(makeBarrier(lane, spec.col, spec.team));
        }
      }
      this._pvpBarriersInitialized = true;
    }

    return this.units.filter((unit) => unit?.isPvpBarrier && unit.alive);
  };

  const originalComputeUnitLayout = BattleRenderer.prototype.computeUnitLayout;
  BattleRenderer.prototype.computeUnitLayout = function computeWithoutDomBarriers(engine, unit) {
    if (unit?.isPvpBarrier) return null;
    return originalComputeUnitLayout.call(this, engine, unit);
  };

  const originalDeckRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderWithBattleMode(root, options = {}) {
    const mode = normalizeMode(options.mode, this._mode ?? 'pve');
    const originalConfirm = options.onConfirm;
    return originalDeckRender.call(this, root, {
      ...options,
      mode,
      onConfirm: (slots, stageId, confirmOptions = {}) => originalConfirm?.(
        slots,
        stageId,
        {
          ...confirmOptions,
          mode,
          pvpMode: mode === 'pvp',
        },
      ),
    });
  };

  const originalEnterBattle = BattleView.prototype.enterBattle;
  BattleView.prototype.enterBattle = async function enterBattleWithMode(
    deckSlots,
    stageId,
    options = {},
  ) {
    const mode = normalizeMode(options.mode, options.pvpMode ? 'pvp' : (this.battleMode ?? 'pve'));
    this.battleMode = mode;
    this.pvpMode = mode === 'pvp';
    const result = await originalEnterBattle.call(this, deckSlots, stageId, options);
    applyModeToEngine(this);
    window.__rebuildBattlefieldGrid?.();
    this.syncPlaceGridOverlay?.(this.viewRoot);
    return result;
  };

  const originalRestartBattle = BattleView.prototype.restartBattle;
  BattleView.prototype.restartBattle = async function restartBattleWithMode(stageId) {
    const result = await originalRestartBattle.call(this, stageId);
    applyModeToEngine(this);
    window.__rebuildBattlefieldGrid?.();
    this.syncPlaceGridOverlay?.(this.viewRoot);
    return result;
  };

  window.__syncPvpBattleBarriers = () => {
    const wrap = document.querySelector('.battlefield-wrap');
    const view = wrap?.__battleView;
    if (!view) return false;
    applyModeToEngine(view);
    window.__rebuildBattlefieldGrid?.();
    return true;
  };
}
