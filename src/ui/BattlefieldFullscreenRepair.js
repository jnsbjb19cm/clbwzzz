import { BattleView } from './BattleView.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { placeGhostAtClientPoint } from './BattlefieldTransformCompensationFinal.js';
import {
  PROVIDED_GRASS_BACKGROUND_URL,
  resolveBattleBackground,
} from '../battle/BattleBackground.js';
import {
  COLS,
  FIELD_H,
  FIELD_LEFT,
  FIELD_TOP,
  FIELD_W,
  GAME_H,
  GAME_W,
  GRID_BODY_W,
  GRID_GAP,
  GRID_ORIGIN_X,
  LANES,
  PLAYER_PLACE_MAX,
  PLAYER_PLACE_MIN,
} from '../battle/BattleConfig.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldFullscreenRepair');
const POINTER_DRAG_THRESHOLD = 6;

/*
 * 这三张图来自 resources/xinsucai 目录。
 * 使用 import.meta.url 交给 Vite 处理，开发环境与 build 后路径保持一致。
 */
const ICE_BACK_URL = new URL(
  '../../resources/xinsucai/backrock.png',
  import.meta.url,
).href;
const ICE_LEFT_URL = new URL(
  '../../resources/xinsucai/leftrock.png',
  import.meta.url,
).href;
const ICE_RIGHT_URL = new URL(
  '../../resources/xinsucai/rightrock.png',
  import.meta.url,
).href;

/* 图2使用窄而高的矩形格，不由横向宽度强行锁成正方形。 */
const REFERENCE_GRID_Y = 105;
const REFERENCE_GRID_W = GRID_BODY_W;
const REFERENCE_GRID_H = 574;
const REFERENCE_CELL_H =
  (REFERENCE_GRID_H - GRID_GAP * (LANES - 1)) / LANES;

function referenceCellTop(lane) {
  return REFERENCE_GRID_Y + lane * (REFERENCE_CELL_H + GRID_GAP);
}

function installGeometry(root, view) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const game = root?.querySelector?.('.game-container');
  const wrap = root?.querySelector?.('.battlefield-wrap');
  const overlay = root?.querySelector?.('#place-grid-overlay');
  if (!viewport || !game || !wrap) return;

  const mapScene = view?.pvp?.mapScene;
  const bossId = String(
    view?.__pvpLatestSnapshot?.boss?.id
    || view?.pvp?.bossId
    || view?.pvp?.room?.bossId
    || view?.bossId
    || viewport.dataset.bossId
    || '',
  );
  const bossScene = bossId
    ? resolveBattleBackground(view?.engine?.stage, {
        pvpMode: Boolean(view?.pvp),
        bossId,
      })
    : null;

  // 背景/柱子按场景（PVP dice 随机 / 默认黄沙）：grass=草地+蘑菇柱，ice=冰川+冰柱，rock=黄沙+岩柱
  // BOSS 的稳定身份优先于普通 PVP 随机场景，避免晚到的布局刷新把多特覆盖回黄沙。
  const scene = bossScene?.sceneKey
    || (mapScene === 'ice' ? 'ice' : mapScene === 'grass' ? 'grass' : 'rock');
  const back = scene === 'ice' ? 'backice' : scene === 'grass' ? 'grassbg' : 'backrock';
  const left = scene === 'ice' ? 'leftice' : scene === 'grass' ? 'mushroomleft' : 'leftrock';
  const right = scene === 'ice' ? 'rightice' : scene === 'grass' ? 'mushroomright' : 'rightrock';
  const backUrl = bossScene?.baseUrl
    || (scene === 'grass' ? PROVIDED_GRASS_BACKGROUND_URL : `/battle/background/${back}.png`);
  const leftUrl = bossScene?.leftColumnUrl || `/battle/background/${left}.png`;
  const rightUrl = bossScene?.rightColumnUrl || `/battle/background/${right}.png`;
  viewport.classList.add('ice-reference-preview');
  viewport.style.setProperty('--ice-back-url', `url(${backUrl})`);
  viewport.style.setProperty('--ice-left-url', `url(${leftUrl})`);
  viewport.style.setProperty('--ice-right-url', `url(${rightUrl})`);

  game.classList.add('battlefield-fullscreen-repair', 'battlefield-reference-exact');
  game.style.setProperty('--battle-grid-x', `${GRID_ORIGIN_X}px`);
  game.style.setProperty('--battle-grid-y', `${REFERENCE_GRID_Y}px`);
  game.style.setProperty('--battle-grid-w', `${REFERENCE_GRID_W}px`);
  game.style.setProperty('--battle-grid-h', `${REFERENCE_GRID_H}px`);
  game.style.setProperty('--battle-grid-gap', `${GRID_GAP}px`);

  wrap.dataset.logicalWidth = String(FIELD_W);
  wrap.dataset.logicalHeight = String(FIELD_H);
  overlay?.setAttribute('data-fullscreen-grid-repaired', '1');
}

/*
 * 旧实现分别使用 scaleX/scaleY，会把人物、卡牌和背景横向拉扁。
 * 现在只使用同一个 contain 比例：完整画面全部可见；剩余区域由冰雪背景和
 * 左右柱填满，所以视觉上仍然是全屏战场，而不是黑边或绿色网页底色。
 */
function updateFullscreenScale(root) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const game = root?.querySelector?.('.game-container');
  if (!viewport || !game) return;

  const width = viewport.clientWidth || window.innerWidth || GAME_W;
  const height = viewport.clientHeight || window.innerHeight || GAME_H;
  const scale = Math.min(width / GAME_W, height / GAME_H);
  const renderedWidth = GAME_W * scale;
  const renderedHeight = GAME_H * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;

  game.style.setProperty('--battle-uniform-scale', String(scale));
  game.style.setProperty('--battle-offset-x', `${offsetX}px`);
  game.style.setProperty('--battle-offset-y', `${offsetY}px`);
  game.dataset.viewportScale = scale.toFixed(6);
  game.dataset.viewportOffsetX = offsetX.toFixed(2);
  game.dataset.viewportOffsetY = offsetY.toFixed(2);
}

function moveGhostToPointer(event, root = document) {
  const ghost = root.querySelector?.('#drag-ghost:not(.hidden)')
    ?? document.querySelector('#drag-ghost:not(.hidden)');
  if (!(ghost instanceof HTMLElement)) return;
  placeGhostAtClientPoint(ghost, event.clientX, event.clientY);
}

function pointerToReferenceCell(event, root) {
  const overlay = root?.querySelector?.('#place-grid-overlay');
  if (!(overlay instanceof HTMLElement)) return { lane: -1, col: -1 };
  const rect = overlay.getBoundingClientRect();
  if (!rect.width || !rect.height) return { lane: -1, col: -1 };

  const rx = event.clientX - rect.left;
  const ry = event.clientY - rect.top;
  if (rx < 0 || ry < 0 || rx >= rect.width || ry >= rect.height) {
    return { lane: -1, col: -1 };
  }

  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor((rx / rect.width) * COLS))),
    lane: Math.max(0, Math.min(LANES - 1, Math.floor((ry / rect.height) * LANES))),
  };
}

function addZoneClasses(root) {
  const overlay = root?.querySelector?.('#place-grid-overlay');
  if (!overlay) return;
  for (const cell of overlay.querySelectorAll('.place-grid-cell')) {
    const col = Number(cell.dataset.col);
    cell.classList.remove('zone-ally', 'zone-obstacle', 'zone-enemy');
    if (col <= 4) cell.classList.add('zone-ally');
    else if (col <= 6) cell.classList.add('zone-obstacle');
    else cell.classList.add('zone-enemy');
  }
}

function disableNativeHandDrag(root) {
  const hand = root?.querySelector?.('#hand');
  if (!hand) return;
  hand.classList.add('pointer-drag-hand');
  for (const item of hand.querySelectorAll('[data-hand-idx], img')) {
    item.setAttribute('draggable', 'false');
    item.draggable = false;
    item.style.setProperty('-webkit-user-drag', 'none');
  }
}

function startPointerDrag(view, root, state, event) {
  const entry = view.engine?.deck?.[state.handIndex];
  const card = entry?.card;
  if (!card || !view.canDragCard?.(state.handIndex)) return false;

  state.dragging = true;
  view.dropSucceeded = false;
  view.dragHandIndex = state.handIndex;
  view.engine.skills?.cancelTargeting();
  view.engine.skillTargetError = '';
  view.engine.selectCard(state.handIndex);
  view.engine.lastDeployError = '';

  const ghost = root.querySelector('#drag-ghost');
  view.startDragGhostAnim?.(card.spriteRes);
  ghost?.classList.remove('hidden');

  view.lastHandKey = '';
  view.lastInfoKey = '';
  view.lastSkillKey = '';
  view.renderHand?.(root);
  view.renderCardInfo?.(root);
  view.renderSkillPanel?.(root);
  view.syncPlaceGridOverlay?.(root);
  addZoneClasses(root);
  disableNativeHandDrag(root);
  moveGhostToPointer(event, root);
  document.body.classList.add('battle-pointer-dragging');
  return true;
}

function updatePointerDrag(view, root, event) {
  moveGhostToPointer(event, root);
  const { lane, col } = pointerToReferenceCell(event, root);
  view.renderer?.setHover(lane, col);
  view.syncPlaceGridOverlay?.(root);
  addZoneClasses(root);
}

async function finishPointerDrag(view, root, state, event, cancelled = false) {
  if (!state.dragging) return;

  if (!cancelled) {
    const { lane, col } = pointerToReferenceCell(event, root);
    if (
      lane >= 0 &&
      col >= PLAYER_PLACE_MIN &&
      col <= PLAYER_PLACE_MAX
    ) {
      view.dropSucceeded = await view.tryDeployAt?.(
        root,
        lane,
        col,
        state.handIndex,
      );
    }
  }

  view.blockCanvasClick?.();
  view.dragHandIndex = null;
  view.stopDragGhostAnim?.();
  root.querySelector('#drag-ghost')?.classList.add('hidden');
  view.renderer?.setHover(-1, -1);
  view.syncPlaceGridOverlay?.(root);
  addZoneClasses(root);
  document.body.classList.remove('battle-pointer-dragging');
}

function installPointerDragging(view, root) {
  const hand = root?.querySelector?.('#hand');
  if (!hand) return;

  view.__fullscreenPointerCleanup?.();
  disableNativeHandDrag(root);

  let state = null;
  let suppressClickUntil = 0;

  const onNativeDragStart = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const button = event.target instanceof Element
      ? event.target.closest('[data-hand-idx]')
      : null;
    if (!button || !hand.contains(button)) return;

    const handIndex = Number(button.dataset.handIdx);
    if (!Number.isInteger(handIndex) || !view.canDragCard?.(handIndex)) return;

    state = {
      pointerId: event.pointerId,
      handIndex,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    button.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!state || event.pointerId !== state.pointerId) return;
    const distance = Math.hypot(
      event.clientX - state.startX,
      event.clientY - state.startY,
    );

    if (!state.dragging && distance >= POINTER_DRAG_THRESHOLD) {
      if (!startPointerDrag(view, root, state, event)) {
        state = null;
        return;
      }
    }

    if (!state.dragging) return;
    event.preventDefault();
    updatePointerDrag(view, root, event);
  };

  const endPointerDrag = async (event, cancelled) => {
    if (!state || event.pointerId !== state.pointerId) return;
    const finished = state;
    state = null;
    if (!finished.dragging) return;

    event.preventDefault();
    suppressClickUntil = performance.now() + 450;
    await finishPointerDrag(view, root, finished, event, cancelled);
  };

  const onPointerUp = (event) => void endPointerDrag(event, false);
  const onPointerCancel = (event) => void endPointerDrag(event, true);
  const onClickCapture = (event) => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  hand.addEventListener('dragstart', onNativeDragStart, true);
  hand.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false });
  window.addEventListener('pointercancel', onPointerCancel, { passive: false });
  hand.addEventListener('click', onClickCapture, true);

  view.__fullscreenPointerCleanup = () => {
    hand.removeEventListener('dragstart', onNativeDragStart, true);
    hand.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    hand.removeEventListener('click', onClickCapture, true);
  };
}

export function installBattlefieldFullscreenRepair() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  /* 把五条单位行同步拉到完整574px棋盘高度。 */
  const originalComputeUnitLayout = BattleRenderer.prototype.computeUnitLayout;
  BattleRenderer.prototype.computeUnitLayout = function computeReferenceLayout(
    engine,
    unit,
  ) {
    const layout = originalComputeUnitLayout.call(this, engine, unit);
    if (!layout) return layout;

    const targetTop = referenceCellTop(unit.lane);
    const targetBottom = targetTop + REFERENCE_CELL_H;
    const shiftY = targetBottom - layout.cellBottom;
    layout.cellTop = targetTop;
    layout.cellBottom = targetBottom;
    layout.cy = targetTop + REFERENCE_CELL_H / 2;
    layout.portraitY += shiftY;
    layout.laneFootY += shiftY;
    layout.footY += shiftY;
    layout.barY += shiftY;
    return layout;
  };

  /*
   * 颜色只由当前卡牌是否能在该格部署决定。
   * 不再因为“该格已有单位”就直接判红；移动卡叠固定卡等规则由
   * BattleEngine.canDeploy 统一决定，中央两列和敌方区域也会自然返回 false。
   */
  BattleView.prototype.getPlaceCellState = function getCanDeployDrivenCellState(
    lane,
    col,
  ) {
    const handIndex = this.engine?.selectedHandIndex;
    if (!Number.isInteger(handIndex) || !this.engine?.selectedCard) {
      return 'place-forbidden';
    }
    try {
      return this.engine.canDeploy?.(lane, col, handIndex, { silent: true })
        ? 'place-ok'
        : 'place-forbidden';
    } catch {
      return 'place-forbidden';
    }
  };

  BattleView.prototype.fitBattleScale = function fitBattleExactlyToViewport(root) {
    installGeometry(root, this);
    updateFullscreenScale(root);
  };

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithFullscreenRepair(root) {
    const result = await originalRenderBattle.call(this, root);
    installGeometry(root, this);
    updateFullscreenScale(root);
    addZoneClasses(root);
    installPointerDragging(this, root);
    requestAnimationFrame(() => {
      updateFullscreenScale(root);
      disableNativeHandDrag(root);
      addZoneClasses(root);
    });
    return result;
  };

  const originalPointerToCell = BattleView.prototype.pointerToCell;
  BattleView.prototype.pointerToCell = function pointerToFullHeightGrid(event, canvas) {
    const mapped = pointerToReferenceCell(event, this.viewRoot);
    if (mapped.lane >= 0 && mapped.col >= 0) return mapped;
    return originalPointerToCell.call(this, event, canvas);
  };

  const originalSyncGrid = BattleView.prototype.syncPlaceGridOverlay;
  BattleView.prototype.syncPlaceGridOverlay = function syncReferenceGrid(root) {
    originalSyncGrid.call(this, root);
    addZoneClasses(root);
  };

  const originalRenderHand = BattleView.prototype.renderHand;
  BattleView.prototype.renderHand = function renderHandWithoutNativeDrag(root) {
    const result = originalRenderHand.call(this, root);
    disableNativeHandDrag(root);
    return result;
  };

  const originalSyncCooldown = BattleView.prototype.syncCooldownOverlay;
  BattleView.prototype.syncCooldownOverlay = function syncCooldownWithoutNativeDrag(root) {
    const result = originalSyncCooldown.call(this, root);
    disableNativeHandDrag(root);
    return result;
  };

  const originalBindEvents = BattleView.prototype.bindEvents;
  BattleView.prototype.bindEvents = function bindEventsWithPointerDrag(root) {
    originalBindEvents.call(this, root);
    installPointerDragging(this, root);
  };

  window.addEventListener('resize', () => {
    const page = document.querySelector('.battle-immersive-page');
    const root = page?.parentElement;
    if (root) updateFullscreenScale(root);
  });

  window.__verifyBattlefieldFullscreenRepair = () => {
    const viewport = document.querySelector('.battle-game-wrap');
    const game = document.querySelector('.game-container.battlefield-fullscreen-repair');
    const field = document.querySelector('.battlefield-wrap');
    const overlay = document.querySelector('#place-grid-overlay');
    const canvas = document.querySelector('#battle-canvas');
    const hand = document.querySelector('#hand');
    const ghost = document.querySelector('#drag-ghost');
    const rect = (element) => element?.getBoundingClientRect?.() ?? null;

    return {
      viewport: rect(viewport),
      game: rect(game),
      field: rect(field),
      overlay: rect(overlay),
      canvas: rect(canvas),
      hand: rect(hand),
      ghost: rect(ghost),
      logical: {
        game: `${GAME_W}x${GAME_H}`,
        field: `${FIELD_W}x${FIELD_H}`,
        fieldOffset: `${FIELD_LEFT},${FIELD_TOP}`,
        grid: `${REFERENCE_GRID_W.toFixed(2)}x${REFERENCE_GRID_H.toFixed(2)}`,
        gridOffset: `${GRID_ORIGIN_X},${REFERENCE_GRID_Y}`,
        cellHeight: REFERENCE_CELL_H.toFixed(2),
      },
      scale: Number(game?.dataset.viewportScale ?? 0),
      offset: {
        x: Number(game?.dataset.viewportOffsetX ?? 0),
        y: Number(game?.dataset.viewportOffsetY ?? 0),
      },
      iceAssets: {
        back: ICE_BACK_URL,
        left: ICE_LEFT_URL,
        right: ICE_RIGHT_URL,
      },
      nativeHtmlDragDisabled:
        [...(hand?.querySelectorAll?.('[data-hand-idx]') ?? [])].every(
          (card) => card.draggable === false,
        ),
      zones: { ally: '0-4', obstacle: '5-6', enemy: '7-11' },
      placementRule: 'BattleEngine.canDeploy',
      repaired: Boolean(game),
    };
  };
}
