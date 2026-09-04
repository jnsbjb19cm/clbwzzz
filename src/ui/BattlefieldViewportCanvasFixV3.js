import { FIELD_H, FIELD_W } from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldViewportCanvasFixV3');

function fitCanvasToViewport(view, root) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const container = root?.querySelector?.('.game-container');
  const field = root?.querySelector?.('.battlefield-wrap');
  const canvas = root?.querySelector?.('#battle-canvas');
  const renderer = view?.renderer;
  if (!(viewport instanceof HTMLElement)
    || !(field instanceof HTMLElement)
    || !(canvas instanceof HTMLCanvasElement)
    || !renderer) return;

  const viewportRect = viewport.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  const fieldCssWidth = Math.max(1, field.offsetWidth || field.clientWidth);
  const fieldCssHeight = Math.max(1, field.offsetHeight || field.clientHeight);
  const stageScaleX = fieldRect.width / fieldCssWidth;
  const stageScaleY = fieldRect.height / fieldCssHeight;
  if (!viewportRect.width || !viewportRect.height || !fieldRect.width || !fieldRect.height) return;

  const displayLeft = Math.max(0, fieldRect.left - viewportRect.left);
  const displayRight = Math.max(0, viewportRect.right - fieldRect.right);
  const displayTop = Math.max(0, fieldRect.top - viewportRect.top);
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

  /*
   * drawUnitSprite 曾经为每一个单位、每一帧调用 canvas.getBoundingClientRect()
   * 来计算这个比例，会强制浏览器同步布局。viewport 尺寸只有在 render/resize
   * 时才变化，因此在这里一次性缓存，渲染热路径只读数字。
   */
  const screenScaleX = viewportRect.width / Math.max(1, canvasWidth);
  const screenScaleY = viewportRect.height / Math.max(1, canvasHeight);
  renderer.battleDisplayCompensation = screenScaleX > 0 ? screenScaleY / screenScaleX : 1;
  renderer.battleCanvasClientRect = {
    left: viewportRect.left,
    top: viewportRect.top,
    width: viewportRect.width,
    height: viewportRect.height,
  };

  /* CSS 尺寸位于已经缩放的 game-container 内，因此必须除以舞台缩放。 */
  canvas.style.setProperty('left', `${-displayLeft / Math.max(stageScaleX, 0.0001)}px`, 'important');
  canvas.style.setProperty('top', `${-displayTop / Math.max(stageScaleY, 0.0001)}px`, 'important');
  canvas.style.setProperty('width', `${viewportRect.width / Math.max(stageScaleX, 0.0001)}px`, 'important');
  canvas.style.setProperty('height', `${viewportRect.height / Math.max(stageScaleY, 0.0001)}px`, 'important');
  canvas.style.setProperty('right', 'auto', 'important');
  canvas.style.setProperty('bottom', 'auto', 'important');
  canvas.classList.add('battle-canvas-viewport-v3');
  canvas.dataset.viewportPadding = [displayLeft, displayTop, displayRight, displayBottom]
    .map((value) => value.toFixed(1))
    .join(',');
  canvas.dataset.stageScale = `${stageScaleX.toFixed(5)},${stageScaleY.toFixed(5)}`;
  canvas.dataset.displayCompensation = renderer.battleDisplayCompensation.toFixed(6);
  field.dataset.viewportCanvas = 'true';
  field.__battleView = view;
  if (container) container.__battleView = view;
}

export function installBattlefieldViewportCanvasFixV3() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithViewportCanvasFix(root) {
    const result = await previousRenderBattle.call(this, root);
    fitCanvasToViewport(this, root);
    requestAnimationFrame(() => fitCanvasToViewport(this, root));
    return result;
  };

  const previousFit = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleWithViewportCanvasFix(root) {
    const result = previousFit.call(this, root);
    fitCanvasToViewport(this, root);
    return result;
  };

  window.__verifyBattlefieldViewportCanvasFixV3 = () => {
    const canvas = document.querySelector('#battle-canvas.battle-canvas-viewport-v3');
    const view = canvas?.closest?.('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView;
    return {
      enabled: Boolean(canvas),
      rect: canvas?.getBoundingClientRect?.() ?? null,
      intrinsic: canvas ? `${canvas.width}x${canvas.height}` : null,
      viewportPadding: canvas?.dataset.viewportPadding ?? null,
      stageScale: canvas?.dataset.stageScale ?? null,
      displayCompensation: view?.renderer?.battleDisplayCompensation ?? null,
    };
  };
}
