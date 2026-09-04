import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldTransformCompensationFinal');

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function centerOf(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/*
 * position:fixed 会在 transformed ancestor 下退化为“相对该祖先固定”。
 * 拖拽幽灵仍留在战斗 DOM 内，因此测量它的局部坐标系后反算 client 坐标。
 */
function measureElementCoordinateSystem(element) {
  const oldLeft = element.style.getPropertyValue('left');
  const oldTop = element.style.getPropertyValue('top');
  const oldRight = element.style.getPropertyValue('right');
  const oldBottom = element.style.getPropertyValue('bottom');

  element.style.setProperty('right', 'auto', 'important');
  element.style.setProperty('bottom', 'auto', 'important');
  element.style.setProperty('left', '0px', 'important');
  element.style.setProperty('top', '0px', 'important');
  const origin = centerOf(element.getBoundingClientRect());

  element.style.setProperty('left', '100px', 'important');
  const movedX = centerOf(element.getBoundingClientRect());

  element.style.setProperty('left', '0px', 'important');
  element.style.setProperty('top', '100px', 'important');
  const movedY = centerOf(element.getBoundingClientRect());

  if (oldLeft) element.style.setProperty('left', oldLeft, 'important');
  else element.style.removeProperty('left');
  if (oldTop) element.style.setProperty('top', oldTop, 'important');
  else element.style.removeProperty('top');
  if (oldRight) element.style.setProperty('right', oldRight, 'important');
  else element.style.removeProperty('right');
  if (oldBottom) element.style.setProperty('bottom', oldBottom, 'important');
  else element.style.removeProperty('bottom');

  return {
    originX: origin.x,
    originY: origin.y,
    scaleX: Math.max(0.001, Math.abs(movedX.x - origin.x) / 100),
    scaleY: Math.max(0.001, Math.abs(movedY.y - origin.y) / 100),
  };
}

export function placeGhostAtClientPoint(ghost, clientX, clientY) {
  if (!ghost) return;
  ghost.style.setProperty('position', 'fixed', 'important');
  ghost.style.setProperty('right', 'auto', 'important');
  ghost.style.setProperty('bottom', 'auto', 'important');
  ghost.style.setProperty('transform', 'translate(-50%, -50%)', 'important');

  const map = measureElementCoordinateSystem(ghost);
  let localX = (finite(clientX) - map.originX) / map.scaleX;
  let localY = (finite(clientY) - map.originY) / map.scaleY;
  ghost.style.setProperty('left', `${localX}px`, 'important');
  ghost.style.setProperty('top', `${localY}px`, 'important');

  const rect = ghost.getBoundingClientRect();
  const center = centerOf(rect);
  localX += (finite(clientX) - center.x) / map.scaleX;
  localY += (finite(clientY) - center.y) / map.scaleY;
  ghost.style.setProperty('left', `${localX}px`, 'important');
  ghost.style.setProperty('top', `${localY}px`, 'important');
  ghost.dataset.pointerX = String(clientX);
  ghost.dataset.pointerY = String(clientY);
}

function removePortalColumns(view) {
  document.querySelectorAll('[data-battle-viewport-portal]').forEach((column) => column.remove());
  view.__viewportColumnNodes = [];
}

function removeLateLegacyColumns() {
  document.querySelectorAll(
    '.bg-layer-left-column:not([data-battle-viewport-portal]), .bg-layer-right-column:not([data-battle-viewport-portal])',
  ).forEach((column) => column.remove());
}

function viewportColumnWidth() {
  const viewportWidth = Math.max(1, window.innerWidth);
  return Math.max(170, Math.min(viewportWidth * 0.115, 280));
}

function runtimeColumnBackground(backgroundImage) {
  return String(backgroundImage || '')
    .replace('leftrock.png', 'leftrock-column.png')
    .replace('rightrock.png', 'rightrock-column.png')
    .replace('leftice.png', 'leftice-column.png')
    .replace('rightice.png', 'rightice-column.png')
    .replace('mushroomleft.png', 'mushroomleft-column.png')
    .replace('mushroomright.png', 'mushroomright-column.png');
}

function captureColumnVisual(column) {
  const computed = getComputedStyle(column);
  return {
    width: viewportColumnWidth(),
    backgroundImage: runtimeColumnBackground(computed.backgroundImage),
    backgroundPosition: computed.backgroundPosition,
    backgroundRepeat: computed.backgroundRepeat,
  };
}

function portalBackgroundSize() {
  // 柱子素材本身包含大面积透明留白；在保持完整高度的同时横向放大可见柱体，
  // 避免旧的 100% 宽度把基地柱压成一条细线。
  return '100% 100%';
}

function createPortalColumn(source, side) {
  if (!source) return null;
  const visual = captureColumnVisual(source);

  /*
   * 不再把旧 .bg-layer 节点本身移到 body。旧节点承载了多轮场景 CSS，离开原父级后
   * 会被遗留规则折叠成 0 高。改为创建一个完全独立、all:initial 的视口装饰节点，
   * 只保留测试和语义需要的左右柱类名以及已经计算出的背景图片。
   */
  const portal = document.createElement('div');
  portal.className = side === 'right'
    ? 'bg-layer-right-column battle-viewport-column'
    : 'bg-layer-left-column battle-viewport-column';
  portal.dataset.battleViewportPortal = side;
  portal.dataset.viewportBaseWidth = String(visual.width);
  portal.setAttribute('aria-hidden', 'true');
  portal.style.setProperty('all', 'initial', 'important');
  portal.style.setProperty('background-image', visual.backgroundImage, 'important');
  portal.style.setProperty('background-size', portalBackgroundSize(visual.backgroundImage), 'important');
  portal.style.setProperty('background-position', visual.backgroundPosition || 'center top', 'important');
  portal.style.setProperty('background-repeat', visual.backgroundRepeat || 'no-repeat', 'important');

  source.remove();
  /*
   * 放在 #app 之前，确保公共选择器 .bg-layer-*-column 总是先命中真正的视口柱，
   * 不会命中其他补丁在稍后阶段重新生成的 0 高旧节点。
   */
  document.body.prepend(portal);
  return portal;
}

function alignPortalColumn(column, side) {
  if (!column) return;
  // 门户在 battle-immersive 类落地前创建，旧逻辑会永久锁住当时误测的 240px。
  // 每次对齐均按当前视口重算，宽屏和窗口缩放后都保持厚实边柱。
  const width = viewportColumnWidth();
  const height = Math.max(1, window.innerHeight);

  column.style.setProperty('position', 'fixed', 'important');
  column.style.setProperty('top', '0px', 'important');
  column.style.setProperty('bottom', 'auto', 'important');
  column.style.setProperty('height', `${height}px`, 'important');
  column.style.setProperty('min-height', `${height}px`, 'important');
  column.style.setProperty('max-height', `${height}px`, 'important');
  column.style.setProperty('block-size', `${height}px`, 'important');
  column.style.setProperty('min-block-size', `${height}px`, 'important');
  column.style.setProperty('max-block-size', `${height}px`, 'important');
  column.style.setProperty('width', `${width}px`, 'important');
  column.style.setProperty('min-width', `${width}px`, 'important');
  column.style.setProperty('max-width', `${width}px`, 'important');
  column.style.setProperty('inline-size', `${width}px`, 'important');
  column.style.setProperty('box-sizing', 'border-box', 'important');
  column.style.setProperty('display', 'block', 'important');
  column.style.setProperty('visibility', 'visible', 'important');
  column.style.setProperty('content-visibility', 'visible', 'important');
  column.style.setProperty('contain', 'none', 'important');
  column.style.setProperty('transform', 'none', 'important');
  column.style.setProperty('scale', '1', 'important');
  column.style.setProperty('opacity', '1', 'important');
  column.style.setProperty('overflow', 'visible', 'important');
  column.style.setProperty('clip-path', 'none', 'important');
  column.style.setProperty('pointer-events', 'none', 'important');
  column.style.setProperty('z-index', '8', 'important');

  if (side === 'right') {
    column.style.setProperty('right', '0px', 'important');
    column.style.setProperty('left', 'auto', 'important');
  } else {
    column.style.setProperty('left', '0px', 'important');
    column.style.setProperty('right', 'auto', 'important');
  }
}

function portalAndAlignColumns(view) {
  const wrap = view.viewRoot?.querySelector?.('.battle-game-wrap')
    ?? document.querySelector('.battle-game-wrap');
  if (!wrap) return;

  removePortalColumns(view);

  const left = createPortalColumn(wrap.querySelector('.bg-layer-left-column'), 'left');
  const right = createPortalColumn(wrap.querySelector('.bg-layer-right-column'), 'right');
  view.__viewportColumnNodes = [left, right].filter(Boolean);

  alignPortalColumn(left, 'left');
  alignPortalColumn(right, 'right');
  removeLateLegacyColumns();
}

function alignExistingPortalColumns(view) {
  for (const column of view.__viewportColumnNodes ?? []) {
    if (column.parentElement !== document.body) document.body.prepend(column);
    alignPortalColumn(column, column.dataset.battleViewportPortal || 'left');
  }
}

function scheduleColumnAlignment(view) {
  alignExistingPortalColumns(view);
  removeLateLegacyColumns();
  requestAnimationFrame(() => {
    alignExistingPortalColumns(view);
    removeLateLegacyColumns();
    requestAnimationFrame(() => {
      alignExistingPortalColumns(view);
      removeLateLegacyColumns();
    });
  });
}

function installColumnObserver(view) {
  view.__viewportColumnObserver?.disconnect?.();
  const observer = new MutationObserver(() => {
    removeLateLegacyColumns();
    alignExistingPortalColumns(view);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  view.__viewportColumnObserver = observer;
}

function installForView(view) {
  if (view.__transformCompDragHandler) {
    document.removeEventListener('dragover', view.__transformCompDragHandler);
  }
  const dragHandler = (event) => {
    if (view.dragHandIndex == null) return;
    placeGhostAtClientPoint(document.querySelector('#drag-ghost'), event.clientX, event.clientY);
  };
  document.addEventListener('dragover', dragHandler);
  view.__transformCompDragHandler = dragHandler;

  portalAndAlignColumns(view);
  installColumnObserver(view);

  if (view.__transformCompResizeHandler) {
    window.removeEventListener('resize', view.__transformCompResizeHandler);
  }
  const resizeHandler = () => scheduleColumnAlignment(view);
  window.addEventListener('resize', resizeHandler);
  view.__transformCompResizeHandler = resizeHandler;

  scheduleColumnAlignment(view);
}

export function installBattlefieldTransformCompensationFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousBindEvents = BattleView.prototype.bindEvents;
  BattleView.prototype.bindEvents = function bindEventsWithTransformCompensation(root) {
    const result = previousBindEvents.call(this, root);
    installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyTransformCompensation() {
    if (this.__transformCompDragHandler) {
      document.removeEventListener('dragover', this.__transformCompDragHandler);
      this.__transformCompDragHandler = null;
    }
    if (this.__transformCompResizeHandler) {
      window.removeEventListener('resize', this.__transformCompResizeHandler);
      this.__transformCompResizeHandler = null;
    }
    this.__viewportColumnObserver?.disconnect?.();
    this.__viewportColumnObserver = null;
    removePortalColumns(this);
    return previousDestroy.call(this);
  };

  window.__verifyBattlefieldTransformCompensationFinal = () => {
    const ghost = document.querySelector('#drag-ghost')?.getBoundingClientRect();
    const leftNode = document.querySelector('.bg-layer-left-column');
    const rightNode = document.querySelector('.bg-layer-right-column');
    const left = leftNode?.getBoundingClientRect();
    const right = rightNode?.getBoundingClientRect();
    const styleAudit = (node) => node ? {
      parent: node.parentElement?.tagName ?? null,
      className: node.className,
      portal: node.dataset.battleViewportPortal ?? null,
      inlineHeight: node.style.getPropertyValue('height'),
      computedHeight: getComputedStyle(node).height,
      display: getComputedStyle(node).display,
      position: getComputedStyle(node).position,
      offsetHeight: node.offsetHeight,
      matchingCount: document.querySelectorAll(`.${node.classList[0]}`).length,
    } : null;
    return {
      enabled: true,
      ghost: ghost ? centerOf(ghost) : null,
      left: left ? { left: left.left, top: left.top, bottom: left.bottom } : null,
      right: right ? { right: right.right, top: right.top, bottom: right.bottom } : null,
      leftStyle: styleAudit(leftNode),
      rightStyle: styleAudit(rightNode),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  };
}
