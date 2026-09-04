import { BattleView } from './BattleView.js';
import {
  BUFFER_COLS,
  COLS,
  LANES,
  PLAYER_MOVABLE_MAX_COL,
  PLAYER_PLACE_MAX,
  PLAYER_PLACE_MIN,
} from '../battle/BattleConfig.js';
import { resolveBattleBackground } from '../battle/BattleBackground.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldGridRebuild');
const ALIEN_SENTINEL_CARD_ID = 38;
const TRANSPARENT_DRAG_IMAGE = document.createElement('canvas');
TRANSPARENT_DRAG_IMAGE.width = 1;
TRANSPARENT_DRAG_IMAGE.height = 1;
TRANSPARENT_DRAG_IMAGE.setAttribute('aria-hidden', 'true');
TRANSPARENT_DRAG_IMAGE.style.cssText = 'position:fixed;left:1px;top:1px;width:1px;height:1px;opacity:.001;pointer-events:none;z-index:2147483647';

function ensureTransparentDragImage() {
  if (!TRANSPARENT_DRAG_IMAGE.isConnected && document.body) {
    document.body.appendChild(TRANSPARENT_DRAG_IMAGE);
  }
}

function zoneForCol(col) {
  if (col <= PLAYER_PLACE_MAX) return 'ally';
  if (BUFFER_COLS.includes(col)) return 'obstacle';
  return 'enemy';
}

function isPvpMode(view) {
  return Boolean(
    view?.pvpMode
    || view?.battleMode === 'pvp'
    || view?.engine?.pvpMode
    || view?.engine?.battleMode === 'pvp',
  );
}

function createGridMarkup() {
  const cells = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    for (let col = 0; col < COLS; col += 1) {
      cells.push(
        `<div class="place-grid-cell zone-${zoneForCol(col)}" data-lane="${lane}" data-col="${col}" aria-hidden="true"></div>`,
      );
    }
  }
  return cells.join('');
}

function getLivingPlayerUnits(engine, lane, col) {
  return (engine?.getUnitsAt?.(lane, col) ?? []).filter(
    (unit) => unit?.alive
      && unit.team === 'player'
      && !unit?.isPvpBarrier
      && Math.abs(Number(unit.col) - col) < 0.48,
  );
}

function createPvpBarrierMarkup() {
  const obstacles = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    for (const col of BUFFER_COLS) {
      obstacles.push(`
        <span class="battle-obstacle" data-lane="${lane}" data-col="${col}" style="grid-row:${lane + 1};grid-column:${col + 1}">
          <span class="battle-obstacle-core" aria-hidden="true"></span>
          <span class="battle-obstacle-hp" aria-hidden="true"><i></i></span>
        </span>
      `);
    }
  }
  return obstacles.join('');
}

function syncPvpBarrierLayer(view, root) {
  const wrap = root?.querySelector?.('.battlefield-wrap');
  const layer = wrap?.querySelector?.('.battle-obstacle-layer');
  if (!wrap || !layer) return;

  const pvp = isPvpMode(view);
  wrap.classList.toggle('pvp-barriers-active', pvp);
  layer.classList.toggle('hidden', !pvp);
  if (!pvp) return;

  view.engine?.ensurePvpBarriers?.();
  for (const element of layer.querySelectorAll('.battle-obstacle')) {
    const lane = Number(element.dataset.lane);
    const col = Number(element.dataset.col);
    const barrier = view.engine?.units?.find(
      (unit) => unit?.isPvpBarrier
        && unit.alive
        && unit.lane === lane
        && Math.round(unit.col) === col,
    );
    const hp = Number(barrier?.hp ?? 0);
    const maxHp = Math.max(1, Number(barrier?.maxHp ?? 1));
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    element.classList.toggle('destroyed', !barrier);
    element.dataset.team = barrier?.team ?? (col === BUFFER_COLS[0] ? 'player' : 'enemy');
    element.title = barrier ? `${barrier.name} ${Math.ceil(hp)}/${Math.ceil(maxHp)}` : '壁垒已摧毁';
    const fill = element.querySelector('.battle-obstacle-hp > i');
    if (fill) fill.style.width = `${(ratio * 100).toFixed(2)}%`;
  }
}

function installBattlefieldLayers(view, root) {
  const game = root.querySelector('.game-container');
  const wrap = root.querySelector('.battlefield-wrap');
  const canvas = root.querySelector('#battle-canvas');
  const overlay = root.querySelector('#place-grid-overlay');
  const bgStack = root.querySelector('.bg-stack');
  if (!game || !wrap || !canvas || !overlay) return;

  game.classList.add('battlefield-grid-system');
  wrap.classList.add('battlefield-grid-v2');
  wrap.dataset.rows = String(LANES);
  wrap.dataset.cols = String(COLS);
  canvas.classList.add('battle-unit-health-layer');
  overlay.classList.add('battle-placement-layer');
  wrap.__battleView = view;

  const bg = resolveBattleBackground(view.engine?.stage, {
    trainingMode: view.trainingMode,
    pvpMode: isPvpMode(view),
    useMap: true,
  });
  game.style.setProperty('--bg-left', `url('${bg.leftColumnUrl}')`);
  game.style.setProperty('--bg-right', `url('${bg.rightColumnUrl}')`);

  if (bgStack && !bgStack.querySelector('.bg-layer-left-column')) {
    const left = document.createElement('div');
    left.className = 'bg-layer bg-layer-left-column';
    bgStack.appendChild(left);
  }

  let obstacleLayer = wrap.querySelector('.battle-obstacle-layer');
  if (!obstacleLayer) {
    obstacleLayer = document.createElement('div');
    obstacleLayer.className = 'battle-obstacle-layer hidden';
    obstacleLayer.setAttribute('aria-hidden', 'true');
    obstacleLayer.innerHTML = createPvpBarrierMarkup();
    wrap.insertBefore(obstacleLayer, canvas);
  }

  syncPvpBarrierLayer(view, root);
}

export function installBattlefieldGridRebuild() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithLayeredGrid(root) {
    const result = await originalRenderBattle.call(this, root);
    installBattlefieldLayers(this, root);
    this.buildPlaceGridOverlay(root);
    this.syncPlaceGridOverlay(root);
    return result;
  };

  BattleView.prototype.buildPlaceGridOverlay = function buildTwelveByFiveGrid(root) {
    const overlay = root?.querySelector?.('#place-grid-overlay');
    if (!overlay) return;
    overlay.innerHTML = createGridMarkup();
    overlay.style.setProperty('--battle-grid-cols', String(COLS));
    overlay.style.setProperty('--battle-grid-rows', String(LANES));
  };

  BattleView.prototype.pointerToCell = function pointerToTwelveByFiveCell(event) {
    const overlay = this.viewRoot?.querySelector?.('#place-grid-overlay');
    const canvas = this.viewRoot?.querySelector?.('#battle-canvas');
    const target = overlay && !overlay.classList.contains('hidden') ? overlay : canvas;
    if (!target) return { lane: -1, col: -1 };
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return { lane: -1, col: -1 };
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    if (px < 0 || px >= 1 || py < 0 || py >= 1) return { lane: -1, col: -1 };
    return {
      col: Math.min(COLS - 1, Math.max(0, Math.floor(px * COLS))),
      lane: Math.min(LANES - 1, Math.max(0, Math.floor(py * LANES))),
    };
  };

  BattleView.prototype.getPlaceCellState = function getLayeredPlaceCellState(lane, col) {
    const handIndex = this.engine?.selectedHandIndex;
    const card = this.engine?.selectedCard;
    if (!card || !Number.isInteger(handIndex)) return 'place-forbidden';

    // 外星哨兵的合法落点由战斗权威层判断，可越过己方半场限制，
    // 直接放在敌方不可移动单位所在格。
    const sentinel = Number(card.id) === ALIEN_SENTINEL_CARD_ID;
    if (sentinel) {
      if (BUFFER_COLS.includes(col)) return 'place-forbidden';
      try {
        return this.engine.canDeploy(lane, col, handIndex, { silent: true })
          ? 'place-ok'
          : 'place-forbidden';
      } catch {
        return 'place-forbidden';
      }
    }

    /* 中央2列与敌方5列永远不可作为己方落点。 */
    if (BUFFER_COLS.includes(col) || col < PLAYER_PLACE_MIN || col > PLAYER_PLACE_MAX) {
      return 'place-forbidden';
    }

    const movable = (Number(card.moveSpeed) || 0) > 0;
    if (movable && col > PLAYER_MOVABLE_MAX_COL) return 'place-forbidden';

    const units = getLivingPlayerUnits(this.engine, lane, col);
    const hasFixed = units.some((unit) => !unit.isMovable?.());

    if (!movable && hasFixed) return 'place-occupied';

    try {
      if (this.engine.canDeploy?.(lane, col, handIndex, { silent: true })) {
        return 'place-ok';
      }
    } catch {
      // 视觉层继续按明确的空间规则显示，最终落点仍由 engine.deploy 二次校验。
    }

    /*
     * 卡牌已能进入选卡状态，资源与冷却在 canDragCard 中已校验。
     * 这里不再因旧 canDeploy 的瞬态判断把整个己方区域错误染红。
     */
    return 'place-ok';
  };

  BattleView.prototype.syncPlaceGridOverlay = function syncLayeredPlacementGrid(root) {
    const overlay = root?.querySelector?.('#place-grid-overlay');
    if (!overlay || !this.engine) return;
    const placing = this.engine.placingActive && this.engine.status === 'playing';
    const skillTarget = this.isSkillTargeting?.() ?? false;
    const show = placing || skillTarget;
    const hoverLane = this.renderer?.hoverLane ?? -1;
    const hoverCol = this.renderer?.hoverCol ?? -1;

    root.querySelector('.game-container')?.classList.toggle('placing', placing);
    overlay.classList.toggle('hidden', !show);
    overlay.classList.toggle('placement-active', show);
    overlay.classList.toggle('skill-placement-active', skillTarget);
    overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    syncPvpBarrierLayer(this, root);

    if (!show) return;

    for (const cell of overlay.querySelectorAll('.place-grid-cell')) {
      const lane = Number(cell.dataset.lane);
      const col = Number(cell.dataset.col);
      cell.className = `place-grid-cell zone-${zoneForCol(col)}`;
      if (skillTarget) {
        cell.classList.add('skill-target-ok');
        if (lane === hoverLane && col === hoverCol) cell.classList.add('skill-target-hover');
        continue;
      }
      const state = this.getPlaceCellState(lane, col);
      cell.classList.add(state);
      if (state === 'place-ok' && lane === hoverLane && col === hoverCol) {
        cell.classList.add('place-hover');
      }
    }
  };

  const originalBindEvents = BattleView.prototype.bindEvents;
  BattleView.prototype.bindEvents = function bindEventsWithTransparentDrag(root) {
    originalBindEvents.call(this, root);
    const hand = root.querySelector('#hand');
    const canvas = root.querySelector('#battle-canvas');
    if (!hand || hand.dataset.layeredDragBound === '1') return;
    hand.dataset.layeredDragBound = '1';

    hand.addEventListener('dragstart', (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-hand-idx]')
        : null;
      if (!button || !event.dataTransfer || event.defaultPrevented) return;
      ensureTransparentDragImage();
      event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
      requestAnimationFrame(() => this.syncPlaceGridOverlay(root));
    });

    hand.addEventListener('dragend', () => {
      requestAnimationFrame(() => this.syncPlaceGridOverlay(root));
    });

    canvas?.addEventListener('dragover', () => {
      this.syncPlaceGridOverlay(root);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureTransparentDragImage, { once: true });
  } else {
    ensureTransparentDragImage();
  }

  document.addEventListener(
    'dragstart',
    (event) => {
      if (!event?.dataTransfer) return;
      ensureTransparentDragImage();
      event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
    },
    true,
  );

  window.__rebuildBattlefieldGrid = () => {
    document.querySelectorAll('.battlefield-wrap').forEach((wrap) => {
      const view = wrap.__battleView;
      if (!view) return;
      installBattlefieldLayers(view, view.viewRoot);
      view.buildPlaceGridOverlay(view.viewRoot);
      view.syncPlaceGridOverlay(view.viewRoot);
    });
  };
}
