import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldFullscreenFinal');
let activeBattleView = null;
let activeBattleRoot = null;

function classifyViewport(root) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const game = root?.querySelector?.('.game-container');
  if (!(viewport instanceof HTMLElement) || !(game instanceof HTMLElement)) return;

  const width = viewport.clientWidth || window.innerWidth || 1;
  const height = viewport.clientHeight || window.innerHeight || 1;
  const aspect = width / Math.max(1, height);

  viewport.classList.add('battle-fullscreen-final');
  viewport.classList.toggle('battle-viewport-wide', aspect >= 1.72);
  viewport.classList.toggle('battle-viewport-ultrawide', aspect >= 1.95);
  viewport.classList.toggle('battle-viewport-compact', width < 1100 || height < 680);
  viewport.style.setProperty('--battle-viewport-width', `${width}px`);
  viewport.style.setProperty('--battle-viewport-height', `${height}px`);
  viewport.style.setProperty('--battle-viewport-aspect', aspect.toFixed(6));

  game.classList.add('battle-fullscreen-final-stage');
  game.dataset.fullscreenFinal = '1';
}

function installViewportObserver(view, root) {
  view.__fullscreenFinalObserver?.disconnect?.();
  view.__fullscreenVisualCleanup?.();
  const viewport = root?.querySelector?.('.battle-game-wrap');
  if (!(viewport instanceof HTMLElement)) return;

  const refit = () => {
    cancelAnimationFrame(view.__fullscreenFinalRaf || 0);
    view.__fullscreenFinalRaf = requestAnimationFrame(() => {
      classifyViewport(root);
      view.fitBattleScale(root);
    });
  };
  const observer = new ResizeObserver(refit);
  observer.observe(viewport);
  view.__fullscreenFinalObserver = observer;
  window.visualViewport?.addEventListener('resize', refit);
  view.__fullscreenVisualCleanup = () => window.visualViewport?.removeEventListener('resize', refit);
  classifyViewport(root);
  refit();
}

export function installBattlefieldFullscreenFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalFitBattleScale = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleScaleWithFinalViewport(root) {
    const result = originalFitBattleScale.call(this, root);
    classifyViewport(root);
    return result;
  };

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithFinalViewport(root) {
    const result = await originalRenderBattle.call(this, root);
    activeBattleView = this;
    activeBattleRoot = root;
    installViewportObserver(this, root);
    return result;
  };

  const originalDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyWithFullscreenCleanup(...args) {
    this.__fullscreenFinalObserver?.disconnect?.();
    this.__fullscreenVisualCleanup?.();
    cancelAnimationFrame(this.__fullscreenFinalRaf || 0);
    if (activeBattleView === this) {
      activeBattleView = null;
      activeBattleRoot = null;
    }
    return originalDestroy?.apply(this, args);
  };

  const refreshActiveBattle = () => {
    if (!activeBattleView || !activeBattleRoot) return;
    classifyViewport(activeBattleRoot);
    requestAnimationFrame(() => {
      activeBattleView?.fitBattleScale(activeBattleRoot);
      requestAnimationFrame(() => activeBattleView?.fitBattleScale(activeBattleRoot));
    });
  };

  document.addEventListener('fullscreenchange', refreshActiveBattle);
  window.addEventListener('orientationchange', refreshActiveBattle);

  window.__verifyBattlefieldFullscreenFinal = () => {
    const viewport = document.querySelector('.battle-game-wrap.battle-fullscreen-final');
    const game = document.querySelector('.game-container.battle-fullscreen-final-stage');
    const field = document.querySelector('.battlefield-wrap');
    const grid = document.querySelector('#place-grid-overlay');
    const top = document.querySelector('.top-ui');
    const dock = document.querySelector('.battle-immersive-dock');
    const rect = (node) => node?.getBoundingClientRect?.() ?? null;

    return {
      enabled: Boolean(viewport && game),
      viewport: rect(viewport),
      stage: rect(game),
      field: rect(field),
      grid: rect(grid),
      top: rect(top),
      dock: rect(dock),
      aspect: Number(viewport?.style.getPropertyValue('--battle-viewport-aspect') || 0),
      modes: {
        wide: viewport?.classList.contains('battle-viewport-wide') ?? false,
        ultrawide: viewport?.classList.contains('battle-viewport-ultrawide') ?? false,
        compact: viewport?.classList.contains('battle-viewport-compact') ?? false,
      },
    };
  };
}
