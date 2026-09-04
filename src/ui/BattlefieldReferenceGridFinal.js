import { GAME_H, GAME_W } from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldReferenceGridFinal');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyReferenceGridMetrics(root) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const game = root?.querySelector?.('.game-container');
  if (!(viewport instanceof HTMLElement) || !(game instanceof HTMLElement)) return;

  const width = viewport.clientWidth || window.innerWidth || GAME_W;
  const height = viewport.clientHeight || window.innerHeight || GAME_H;
  const fallbackScale = Math.min(width / GAME_W, height / GAME_H);
  const scale = Number(game.dataset.viewportScale) || fallbackScale || 1;

  /*
   * 16:9 下保留约 50px 逻辑边距；越宽的视口越向舞台外扩展。
   * 冰柱位于视口层并覆盖在战场上方，因此棋盘可以伸到柱子内缘，
   * 而不是被 1248px 逻辑舞台限制在屏幕中央。
   */
  const extraLogicalWidth = Math.max(0, width / scale - GAME_W);
  const fieldSide = clamp(180 - extraLogicalWidth * 0.56, -76, 52);

  game.style.setProperty('--battle-reference-field-side', `${fieldSide.toFixed(2)}px`);
  game.dataset.referenceFieldSide = fieldSide.toFixed(2);
  game.dataset.referenceExtraLogicalWidth = extraLogicalWidth.toFixed(2);
}

function installReferenceObserver(view, root) {
  view.__referenceGridObserver?.disconnect?.();
  const viewport = root?.querySelector?.('.battle-game-wrap');
  if (!(viewport instanceof HTMLElement)) return;

  const observer = new ResizeObserver(() => applyReferenceGridMetrics(root));
  observer.observe(viewport);
  view.__referenceGridObserver = observer;
  applyReferenceGridMetrics(root);
}

export function installBattlefieldReferenceGridFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalFitBattleScale = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleScaleWithReferenceGrid(root) {
    const result = originalFitBattleScale.call(this, root);
    applyReferenceGridMetrics(root);
    return result;
  };

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithReferenceGrid(root) {
    const result = await originalRenderBattle.call(this, root);
    installReferenceObserver(this, root);
    requestAnimationFrame(() => applyReferenceGridMetrics(root));
    return result;
  };

  window.__verifyBattlefieldReferenceGridFinal = () => {
    const viewport = document.querySelector('.battle-game-wrap');
    const game = document.querySelector('.game-container');
    const field = document.querySelector('.battlefield-wrap');
    const grid = document.querySelector('#place-grid-overlay');
    const rect = (node) => node?.getBoundingClientRect?.() ?? null;

    return {
      enabled: Boolean(game?.dataset.referenceFieldSide),
      viewport: rect(viewport),
      stage: rect(game),
      field: rect(field),
      grid: rect(grid),
      fieldSide: Number(game?.dataset.referenceFieldSide ?? 0),
      extraLogicalWidth: Number(game?.dataset.referenceExtraLogicalWidth ?? 0),
    };
  };
}
