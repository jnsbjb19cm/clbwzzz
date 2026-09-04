import { FIELD_H, FIELD_W } from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpReferenceGeometryFinalFix');
const REFERENCE_RECT = Object.freeze({
  left: 0.092,
  top: 0.233,
  width: 0.78,
  height: 0.613,
});

function setPx(element, property, value) {
  element.style.setProperty(property, `${Number(value).toFixed(4)}px`, 'important');
}

/**
 * 12x5 只负责逻辑网格；真正的战斗 Canvas 必须覆盖整个 battle viewport。
 *
 * Canvas 的 CSS 矩形铺满 viewport，同时通过 intrinsic size + fieldOffset 把 FIELD_W/FIELD_H
 * 精确映射回 reference field。这样单位、弹道、命中特效、全屏技能都能越过网格边界，
 * 但网格中心/点击坐标仍保持不变。
 */
function expandCanvasToViewport(view, root, field) {
  const viewport = root?.querySelector?.('.battle-game-wrap')
    ?? field?.closest?.('.battle-game-wrap');
  const canvas = field?.querySelector?.('#battle-canvas');
  const renderer = view?.renderer;
  if (!(viewport instanceof HTMLElement)
    || !(field instanceof HTMLElement)
    || !(canvas instanceof HTMLCanvasElement)
    || !renderer) return null;

  const viewportRect = viewport.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  if (!viewportRect.width || !viewportRect.height || !fieldRect.width || !fieldRect.height) return null;

  const displayLeft = Math.max(0, fieldRect.left - viewportRect.left);
  const displayTop = Math.max(0, fieldRect.top - viewportRect.top);
  const displayRight = Math.max(0, viewportRect.right - fieldRect.right);
  const displayBottom = Math.max(0, viewportRect.bottom - fieldRect.bottom);

  const fieldScreenScaleX = fieldRect.width / FIELD_W;
  const fieldScreenScaleY = fieldRect.height / FIELD_H;
  const logicalLeft = displayLeft / Math.max(fieldScreenScaleX, 0.0001);
  const logicalRight = displayRight / Math.max(fieldScreenScaleX, 0.0001);
  const logicalTop = displayTop / Math.max(fieldScreenScaleY, 0.0001);
  const logicalBottom = displayBottom / Math.max(fieldScreenScaleY, 0.0001);

  const canvasWidth = Math.max(1, Math.round(FIELD_W + logicalLeft + logicalRight));
  const canvasHeight = Math.max(1, Math.round(FIELD_H + logicalTop + logicalBottom));
  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

  renderer.fieldScale = 1;
  renderer.fieldOffsetX = logicalLeft;
  renderer.fieldOffsetY = logicalTop;

  // field 已经 fixed 且没有 transform；Canvas 作为其 absolute 子元素用负偏移即可铺满 viewport。
  field.style.setProperty('overflow', 'visible', 'important');
  canvas.style.setProperty('position', 'absolute', 'important');
  canvas.style.setProperty('left', `${-displayLeft}px`, 'important');
  canvas.style.setProperty('top', `${-displayTop}px`, 'important');
  canvas.style.setProperty('right', 'auto', 'important');
  canvas.style.setProperty('bottom', 'auto', 'important');
  canvas.style.setProperty('width', `${viewportRect.width}px`, 'important');
  canvas.style.setProperty('height', `${viewportRect.height}px`, 'important');
  canvas.classList.add('battle-canvas-full-viewport-final');
  canvas.dataset.viewportLogicalPadding = [logicalLeft, logicalTop, logicalRight, logicalBottom]
    .map((value) => value.toFixed(3))
    .join(',');

  return {
    viewport: viewportRect,
    field: fieldRect,
    canvas: canvas.getBoundingClientRect(),
    logicalLeft,
    logicalTop,
    logicalRight,
    logicalBottom,
  };
}

function applyReferenceRect(view, root = view?.viewRoot) {
  if (!view?.pvp) return null;
  const field = root?.querySelector?.('.battlefield-wrap');
  if (!(field instanceof HTMLElement)) return null;

  // Keep the measured reference rectangle exact. Renderer compensation handles
  // non-uniform screen scale without moving the logical 12x5 hit grid.
  const left = window.innerWidth * REFERENCE_RECT.left;
  const top = window.innerHeight * REFERENCE_RECT.top;
  const width = window.innerWidth * REFERENCE_RECT.width;
  const height = window.innerHeight * REFERENCE_RECT.height;

  field.style.setProperty('position', 'fixed', 'important');
  field.style.setProperty('inset', 'auto', 'important');
  field.style.setProperty('right', 'auto', 'important');
  field.style.setProperty('bottom', 'auto', 'important');
  field.style.setProperty('transform', 'none', 'important');
  field.style.setProperty('transform-origin', '0 0', 'important');
  setPx(field, 'left', left);
  setPx(field, 'top', top);
  setPx(field, 'width', width);
  setPx(field, 'height', height);

  const rect = field.getBoundingClientRect();
  field.dataset.pvpExactReference = 'true';
  field.dataset.pvpExactLeft = rect.left.toFixed(3);
  field.dataset.pvpExactTop = rect.top.toFixed(3);
  field.dataset.pvpExactWidth = rect.width.toFixed(3);
  field.dataset.pvpExactHeight = rect.height.toFixed(3);
  view.__pvpExactViewportAudit = expandCanvasToViewport(view, root, field);
  return rect;
}

function scheduleFinalReferenceFit(view, root = view?.viewRoot) {
  if (!view?.pvp) return;
  if (view.__pvpExactReferenceRaf) cancelAnimationFrame(view.__pvpExactReferenceRaf);
  view.__pvpExactReferenceRaf = requestAnimationFrame(() => {
    view.__pvpExactReferenceRaf = requestAnimationFrame(() => {
      view.__pvpExactReferenceRaf = requestAnimationFrame(() => {
        view.__pvpExactReferenceRaf = null;
        applyReferenceRect(view, root);
      });
    });
  });
}

function installForView(view, root) {
  if (!view?.pvp) return;
  applyReferenceRect(view, root);
  scheduleFinalReferenceFit(view, root);
  if (view.__pvpExactReferenceHandler) return;

  view.__pvpExactReferenceHandler = () => scheduleFinalReferenceFit(view, view.viewRoot);
  window.addEventListener('resize', view.__pvpExactReferenceHandler, { passive: true });
  window.addEventListener('orientationchange', view.__pvpExactReferenceHandler, { passive: true });
  document.addEventListener('fullscreenchange', view.__pvpExactReferenceHandler);
  window.visualViewport?.addEventListener?.('resize', view.__pvpExactReferenceHandler, { passive: true });
}

function cleanupForView(view) {
  if (view.__pvpExactReferenceRaf) cancelAnimationFrame(view.__pvpExactReferenceRaf);
  view.__pvpExactReferenceRaf = null;
  const handler = view.__pvpExactReferenceHandler;
  if (!handler) return;
  window.removeEventListener('resize', handler);
  window.removeEventListener('orientationchange', handler);
  document.removeEventListener('fullscreenchange', handler);
  window.visualViewport?.removeEventListener?.('resize', handler);
  view.__pvpExactReferenceHandler = null;
}

export function installPvpReferenceGeometryFinalFix() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithExactPvpReference(root) {
    const result = await previousRenderBattle.call(this, root);
    installForView(this, root);
    return result;
  };

  const previousFitBattleScale = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleScaleWithExactPvpReference(root) {
    const result = previousFitBattleScale.call(this, root);
    if (this.pvp) {
      applyReferenceRect(this, root);
      scheduleFinalReferenceFit(this, root);
    }
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyExactPvpReference() {
    cleanupForView(this);
    return previousDestroy.call(this);
  };

  window.__verifyPvpReferenceGeometryFinalFix = () => {
    const field = document.querySelector('.pvp-wilderness-battle .battlefield-wrap')
      ?? document.querySelector('.battlefield-wrap');
    const canvas = field?.querySelector?.('#battle-canvas');
    const rect = field?.getBoundingClientRect?.();
    const canvasRect = canvas?.getBoundingClientRect?.();
    return {
      enabled: Boolean(field?.dataset?.pvpExactReference === 'true'),
      target: { ...REFERENCE_RECT },
      actual: rect ? {
        left: rect.left / Math.max(1, window.innerWidth),
        top: rect.top / Math.max(1, window.innerHeight),
        width: rect.width / Math.max(1, window.innerWidth),
        height: rect.height / Math.max(1, window.innerHeight),
      } : null,
      canvas: canvasRect ? {
        left: canvasRect.left,
        top: canvasRect.top,
        right: canvasRect.right,
        bottom: canvasRect.bottom,
        width: canvasRect.width,
        height: canvasRect.height,
      } : null,
      fullViewportCanvas: Boolean(canvas?.classList.contains('battle-canvas-full-viewport-final')),
      logicalPadding: canvas?.dataset?.viewportLogicalPadding ?? null,
    };
  };
}
