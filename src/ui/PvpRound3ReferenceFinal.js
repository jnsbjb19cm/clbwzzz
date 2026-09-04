import { BattleRenderer } from '../battle/BattleRenderer.js';
import {
  COLS,
  FIELD_H,
  FIELD_W,
  LANES,
  cellCenterY,
  formatBattleDelta,
  fracColToCenterX,
} from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';
import { PROVIDED_GRASS_BACKGROUND_URL } from '../battle/BattleBackground.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpRound3ReferenceFinal');
const FLOAT_DURATION = 0.82;
const FLOAT_RISE_PX = 14;
const REFERENCE_RECT = Object.freeze({ left: 0.092, top: 0.233, width: 0.78, height: 0.613 });

const SCENES = Object.freeze({
  default: {
    key: 'default',
    base: PROVIDED_GRASS_BACKGROUND_URL,
    map: PROVIDED_GRASS_BACKGROUND_URL,
    left: '/battle/background/mushroomleft-column.png',
    right: '/battle/background/mushroomright-column.png',
    leftWidth: '42.4vh',
    rightWidth: '42.4vh',
  },
  ice: {
    key: 'ice',
    base: '/battle/background/backice.png',
    map: '/battle/background/backice.png',
    left: '/battle/background/leftice-column.png',
    right: '/battle/background/rightice-column.png',
    leftWidth: '53.9vh',
    rightWidth: '39.7vh',
  },
  rock: {
    key: 'rock',
    base: '/battle/background/backrock.png',
    map: '/battle/background/backrock.png',
    left: '/battle/background/leftrock-column.png',
    right: '/battle/background/rightrock-column.png',
    leftWidth: 'clamp(210px, 17vw, 360px)',
    rightWidth: 'clamp(210px, 17vw, 360px)',
  },
  bossDot: {
    key: 'boss-dot',
    base: PROVIDED_GRASS_BACKGROUND_URL,
    map: PROVIDED_GRASS_BACKGROUND_URL,
    left: '/battle/background/mushroomleft-column.png',
    right: '/battle/background/mushroomright-column.png',
    leftWidth: '42.4vh',
    rightWidth: '42.4vh',
  },
  bossGravo: {
    key: 'boss-gravo',
    base: '/battle/background/backrock.png',
    map: '/battle/background/backrock.png',
    // BOSS 战不显示右柱；仍保留正确的左右资源供场景审计与回退。
    left: '/battle/background/leftrock-column.png',
    right: '/battle/background/rightrock-column.png',
    leftWidth: 'clamp(210px, 17vw, 360px)',
    rightWidth: 'clamp(210px, 17vw, 360px)',
  },
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveBossId(view, snapshot = null) {
  return String(
    snapshot?.boss?.id
    || view?.pvp?.bossId
    || view?.pvp?.room?.bossId
    || view?.boss?.id
    || view?.bossId
    || view?.viewRoot?.querySelector?.('.battle-game-wrap')?.dataset?.bossId
    || '',
  );
}

function resolveScene(view, snapshot = null) {
  const bossId = resolveBossId(view, snapshot);
  const bossName = String(snapshot?.boss?.name || view?.pvp?.room?.name || '');
  // BOSS 场景（按 BOSS 定义：多特=草地、沃里尔=黄沙、安娜=冰川、火焰=火山(未做→草地)、树妖=黄沙）
  if (bossId === 'boss_dot' || bossName.includes('痴情的多特')) return SCENES.bossDot;
  if (bossId === 'boss_gravo' || bossName.includes('愤怒的格拉沃') || bossName.includes('愤怒的沃里尔')) return SCENES.bossGravo;
  if (bossId === 'boss_ice' || bossName.includes('疯狂的安娜') || bossName.includes('愤怒的安娜')) return SCENES.ice;
  if (bossId === 'boss_forest' || bossName.includes('树妖洛丽塔')) return SCENES.bossGravo;
  if (bossId === 'boss_fire' || bossName.includes('火焰的复仇')) return SCENES.bossDot;

  // 房间 dice「随机地图」选择（进战斗时一次性消费到 pvp.mapScene）
  const chosen = view?.pvp?.mapScene
    ?? ({ '2': 'grass', '4': 'ice', '7': 'rock' }[String(view?.pvp?.mapId ?? '')]);
  if (chosen === 'rock' || chosen === 'ice' || chosen === 'grass') {
    return SCENES[chosen] ?? SCENES.default;
  }
  // 默认黄沙场景（PVP 轮换核心 = 黄沙）；dice 可随机其它场景
  if (!view.__round3FixedScene) {
    view.__round3FixedScene = SCENES.rock;
  }
  return view.__round3FixedScene;
}

function setBackgroundImage(element, url) {
  if (!(element instanceof HTMLElement)) return;
  element.style.setProperty('background-image', `url('${url}')`, 'important');
}

function applyScene(view, snapshot = null, { force = false } = {}) {
  if (!view?.pvp) return null;
  const wrap = view.viewRoot?.querySelector?.('.battle-game-wrap');
  const game = view.viewRoot?.querySelector?.('.game-container');
  if (!(wrap instanceof HTMLElement) || !(game instanceof HTMLElement)) return null;
  const scene = resolveScene(view, snapshot);
  if (!force && view.__round3SceneKey === scene.key) return scene.key;
  view.__round3SceneKey = scene.key;

  wrap.dataset.round3Scene = scene.key;
  game.dataset.round3Scene = scene.key;
  // 同步顶部地图名标签（与实际场景一致）
  const labelMap = { default: '草地', ice: '冰川', rock: '黄沙', 'boss-dot': '草地', 'boss-gravo': '黄沙' };
  const label = wrap.querySelector('.battle-map-label');
  if (label) label.textContent = `🗺️ ${labelMap[scene.key] ?? '草地'}地图`;
  for (const root of [wrap, game]) {
    root.style.setProperty('--bg-base', `url('${scene.base}')`);
    root.style.setProperty('--bg-grass', `url('${scene.base}')`);
    root.style.setProperty('--bg-map', `url('${scene.map}')`);
    root.style.setProperty('--bg-left', `url('${scene.left}')`);
    root.style.setProperty('--bg-right', `url('${scene.right}')`);
    // 全屏修复层仍通过 --ice-* 变量绘制实际可见背景；必须与最终 BOSS 场景同步。
    root.style.setProperty('--ice-back-url', `url('${scene.base}')`);
    root.style.setProperty('--ice-left-url', `url('${scene.left}')`);
    root.style.setProperty('--ice-right-url', `url('${scene.right}')`);
    root.style.setProperty('--column-left-width', scene.leftWidth);
    root.style.setProperty('--column-right-width', scene.rightWidth);
  }

  setBackgroundImage(game.querySelector('.bg-layer-base'), scene.base);
  setBackgroundImage(game.querySelector('.bg-layer-map'), scene.map);
  setBackgroundImage(wrap.querySelector('.bg-layer-left-column'), scene.left);
  setBackgroundImage(wrap.querySelector('.bg-layer-right-column'), scene.right);
  setBackgroundImage(wrap.querySelector('.pvp-authority-column.left'), scene.left);
  setBackgroundImage(wrap.querySelector('.pvp-authority-column.right'), scene.right);
  return scene.key;
}

function setImportantPx(element, property, value) {
  element.style.setProperty(property, `${finite(value).toFixed(4)}px`, 'important');
}

function desiredReferenceRect() {
  return {
    left: window.innerWidth * REFERENCE_RECT.left,
    top: window.innerHeight * REFERENCE_RECT.top,
    width: window.innerWidth * REFERENCE_RECT.width,
    height: window.innerHeight * REFERENCE_RECT.height,
  };
}

function neutralizeFieldAncestors(field) {
  let ancestor = field.parentElement;
  while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
    const style = getComputedStyle(ancestor);
    if (style.transform !== 'none') ancestor.style.setProperty('transform', 'none', 'important');
    if (style.perspective !== 'none') ancestor.style.setProperty('perspective', 'none', 'important');
    if (style.filter !== 'none') ancestor.style.setProperty('filter', 'none', 'important');
    if (style.backdropFilter && style.backdropFilter !== 'none') {
      ancestor.style.setProperty('backdrop-filter', 'none', 'important');
    }
    ancestor = ancestor.parentElement;
  }
}

function placeFieldInViewport(field) {
  const desired = desiredReferenceRect();
  neutralizeFieldAncestors(field);

  field.style.setProperty('position', 'fixed', 'important');
  field.style.setProperty('inset', 'auto', 'important');
  field.style.setProperty('right', 'auto', 'important');
  field.style.setProperty('bottom', 'auto', 'important');
  field.style.setProperty('transform', 'none', 'important');
  field.style.setProperty('transform-origin', '0 0', 'important');

  setImportantPx(field, 'left', desired.left);
  setImportantPx(field, 'top', desired.top);
  setImportantPx(field, 'width', desired.width);
  setImportantPx(field, 'height', desired.height);
  let rect = field.getBoundingClientRect();

  const scaleX = rect.width > 0 ? rect.width / desired.width : 1;
  const scaleY = rect.height > 0 ? rect.height / desired.height : 1;
  const originX = rect.left - desired.left * scaleX;
  const originY = rect.top - desired.top * scaleY;
  let cssLeft = (desired.left - originX) / Math.max(0.001, scaleX);
  let cssTop = (desired.top - originY) / Math.max(0.001, scaleY);
  let cssWidth = desired.width / Math.max(0.001, scaleX);
  let cssHeight = desired.height / Math.max(0.001, scaleY);

  setImportantPx(field, 'left', cssLeft);
  setImportantPx(field, 'top', cssTop);
  setImportantPx(field, 'width', cssWidth);
  setImportantPx(field, 'height', cssHeight);
  rect = field.getBoundingClientRect();

  const residualScaleX = rect.width > 0 ? rect.width / cssWidth : 1;
  const residualScaleY = rect.height > 0 ? rect.height / cssHeight : 1;
  cssLeft += (desired.left - rect.left) / Math.max(0.001, residualScaleX);
  cssTop += (desired.top - rect.top) / Math.max(0.001, residualScaleY);
  cssWidth *= desired.width / Math.max(0.001, rect.width);
  cssHeight *= desired.height / Math.max(0.001, rect.height);
  setImportantPx(field, 'left', cssLeft);
  setImportantPx(field, 'top', cssTop);
  setImportantPx(field, 'width', cssWidth);
  setImportantPx(field, 'height', cssHeight);

  const finalRect = field.getBoundingClientRect();
  field.dataset.pvpRound3TargetLeft = desired.left.toFixed(3);
  field.dataset.pvpRound3TargetTop = desired.top.toFixed(3);
  field.dataset.pvpRound3TargetWidth = desired.width.toFixed(3);
  field.dataset.pvpRound3TargetHeight = desired.height.toFixed(3);
  field.dataset.pvpRound3ActualLeft = finalRect.left.toFixed(3);
  field.dataset.pvpRound3ActualTop = finalRect.top.toFixed(3);
  field.dataset.pvpRound3ActualWidth = finalRect.width.toFixed(3);
  field.dataset.pvpRound3ActualHeight = finalRect.height.toFixed(3);
}

function fitReferenceBattlefield(view, root) {
  const field = root?.querySelector?.('.battlefield-wrap');
  const canvas = root?.querySelector?.('#battle-canvas');
  const overlay = root?.querySelector?.('#place-grid-overlay');
  const obstacle = root?.querySelector?.('.battle-obstacle-layer');
  const wrap = root?.querySelector?.('.battle-game-wrap');
  const game = root?.querySelector?.('.game-container');
  if (!field || !canvas || !wrap || !game) return;

  wrap.style.setProperty('transform', 'none', 'important');
  game.style.setProperty('transform', 'none', 'important');
  game.style.setProperty('--battle-scale', '1');
  placeFieldInViewport(field);

  if (canvas.width !== FIELD_W) canvas.width = FIELD_W;
  if (canvas.height !== FIELD_H) canvas.height = FIELD_H;
  canvas.style.setProperty('position', 'absolute', 'important');
  canvas.style.setProperty('left', '0px', 'important');
  canvas.style.setProperty('top', '0px', 'important');
  canvas.style.setProperty('right', 'auto', 'important');
  canvas.style.setProperty('bottom', 'auto', 'important');
  canvas.style.setProperty('width', '100%', 'important');
  canvas.style.setProperty('height', '100%', 'important');
  if (view.renderer) {
    view.renderer.fieldScale = 1;
    view.renderer.fieldOffsetX = 0;
    view.renderer.fieldOffsetY = 0;
  }

  field.dataset.pvpRound3Reference = 'true';
  for (const layer of [overlay, obstacle]) {
    if (!(layer instanceof HTMLElement)) continue;
    layer.style.setProperty('left', '0px', 'important');
    layer.style.setProperty('top', '0px', 'important');
    layer.style.setProperty('width', '100%', 'important');
    layer.style.setProperty('height', '100%', 'important');
    layer.style.setProperty('transform', 'none', 'important');
  }
  // 布局链中的旧模块可能在场景 key 不变时改写背景变量；每次显式重排都重新落盘最终场景。
  applyScene(view, view.__pvpLatestSnapshot, { force: true });
}

function pointerToReferenceCell(event, root) {
  const field = root?.querySelector?.('.battlefield-wrap');
  if (!field) return { lane: -1, col: -1 };
  const rect = field.getBoundingClientRect();
  if (!rect.width || !rect.height) return { lane: -1, col: -1 };
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return { lane: -1, col: -1 };
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor(x * COLS))),
    lane: Math.max(0, Math.min(LANES - 1, Math.floor(y * LANES))),
  };
}

function drawAuthorityFloats(renderer, ctx, engine) {
  const now = performance.now();
  const queue = (engine.__pvpAuthorityFloats ?? []).filter((item) =>
    (now - finite(item.bornAt, now)) / 1000 < FLOAT_DURATION);
  engine.__pvpAuthorityFloats = queue;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 16px "Microsoft YaHei", sans-serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  for (const item of queue) {
    const age = Math.max(0, (now - finite(item.bornAt, now)) / 1000);
    const progress = Math.max(0, Math.min(1, age / FLOAT_DURATION));
    const eased = 1 - (1 - progress) * (1 - progress);
    const alpha = progress < 0.68 ? 1 : Math.max(0, (1 - progress) / 0.32);
    const x = fracColToCenterX(finite(item.col));
    const y = cellCenterY(finite(item.lane, 2)) - eased * FLOAT_RISE_PX;
    const text = formatBattleDelta(finite(item.amount));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(24, 20, 17, 0.86)';
    ctx.fillStyle = item.amount > 0 ? '#70f58a' : '#ff6b66';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function scheduleStableFit(view) {
  if (view.__pvpRound3FitRaf) cancelAnimationFrame(view.__pvpRound3FitRaf);
  view.__pvpRound3FitRaf = requestAnimationFrame(() => {
    view.__pvpRound3FitRaf = null;
    fitReferenceBattlefield(view, view.viewRoot);
    requestAnimationFrame(() => fitReferenceBattlefield(view, view.viewRoot));
  });
}

function installForView(view) {
  if (!view.pvp || view.__pvpRound3ReferenceInstalled) return;
  view.__pvpRound3ReferenceInstalled = true;

  if (view.pvpSocket?.on) {
    view.__pvpRound3SnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      // 快照是战斗数据，不是布局事件。这里只在场景真正改变时更新背景；
      // 禁止每 50ms 读取/写入布局，否则 Canvas 会被浏览器强制重排拖慢。
      queueMicrotask(() => applyScene(view, snapshot));
    });
    view.__pvpRound3FinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      queueMicrotask(() => applyScene(view, snapshot));
    });
  }

  view.__pvpRound3ResizeHandler = () => scheduleStableFit(view);
  window.addEventListener('resize', view.__pvpRound3ResizeHandler, { passive: true });
  window.addEventListener('orientationchange', view.__pvpRound3ResizeHandler, { passive: true });
  document.addEventListener('fullscreenchange', view.__pvpRound3ResizeHandler);
  window.visualViewport?.addEventListener?.('resize', view.__pvpRound3ResizeHandler, { passive: true });

  applyScene(view, view.__pvpLatestSnapshot, { force: true });
  scheduleStableFit(view);
}

function cleanupForView(view) {
  view.__pvpRound3SnapshotUnsub?.();
  view.__pvpRound3FinishedUnsub?.();
  view.__pvpRound3SnapshotUnsub = null;
  view.__pvpRound3FinishedUnsub = null;
  if (view.__pvpRound3ResizeHandler) {
    window.removeEventListener('resize', view.__pvpRound3ResizeHandler);
    window.removeEventListener('orientationchange', view.__pvpRound3ResizeHandler);
    document.removeEventListener('fullscreenchange', view.__pvpRound3ResizeHandler);
    window.visualViewport?.removeEventListener?.('resize', view.__pvpRound3ResizeHandler);
  }
  if (view.__pvpRound3FitRaf) cancelAnimationFrame(view.__pvpRound3FitRaf);
  view.__pvpRound3FitRaf = null;
  view.__pvpRound3ResizeHandler = null;
  view.__pvpRound3ReferenceInstalled = false;
  view.__round3SceneKey = null;
}

export function installPvpRound3ReferenceFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousFitBattleScale = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitRound3Reference(root) {
    if (!this.pvp) return previousFitBattleScale.call(this, root);
    return fitReferenceBattlefield(this, root);
  };

  BattleView.prototype.pointerToCell = function pointerToRound3Reference(event) {
    if (!this.pvp) {
      const canvas = this.viewRoot?.querySelector?.('#battle-canvas');
      if (!canvas) return { lane: -1, col: -1 };
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
      const y = (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
      return {
        col: Math.max(0, Math.min(COLS - 1, Math.floor((x / FIELD_W) * COLS))),
        lane: Math.max(0, Math.min(LANES - 1, Math.floor((y / FIELD_H) * LANES))),
      };
    }
    return pointerToReferenceCell(event, this.viewRoot);
  };

  const previousDrawFloats = BattleRenderer.prototype.drawFloats;
  BattleRenderer.prototype.drawFloats = function drawRound3PositionFloats(ctx, engine) {
    if (!engine?.__pvpAuthorityFloats) {
      return previousDrawFloats.call(this, ctx, engine);
    }
    const queue = engine.__pvpAuthorityFloats;
    engine.__pvpAuthorityFloats = [];
    try {
      previousDrawFloats.call(this, ctx, engine);
    } finally {
      engine.__pvpAuthorityFloats = queue;
    }
    drawAuthorityFloats(this, ctx, engine);
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderRound3Reference(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyRound3Reference() {
    cleanupForView(this);
    return previousDestroy.call(this);
  };

  window.__verifyPvpRound3ReferenceFinal = () => {
    const field = document.querySelector('.pvp-wilderness-battle .battlefield-wrap, .coop-boss-battle .battlefield-wrap');
    const rect = field?.getBoundingClientRect?.();
    const wrap = document.querySelector('.pvp-wilderness-battle .battle-game-wrap, .coop-boss-battle .battle-game-wrap');
    return {
      enabled: true,
      aligned: field?.dataset.pvpRound3Reference === 'true',
      rect: rect ? {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      } : null,
      target: field ? {
        left: Number(field.dataset.pvpRound3TargetLeft),
        top: Number(field.dataset.pvpRound3TargetTop),
        width: Number(field.dataset.pvpRound3TargetWidth),
        height: Number(field.dataset.pvpRound3TargetHeight),
      } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scene: wrap?.dataset.round3Scene ?? null,
      gridCells: field?.querySelectorAll?.('.place-grid-cell')?.length ?? 0,
      floatDuration: FLOAT_DURATION,
      floatRisePx: FLOAT_RISE_PX,
      snapshotLayoutThrash: false,
    };
  };
}
