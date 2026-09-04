import { audio } from '../core/AudioManager.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldMinimalHudFinal');

function updatePlaceButton(view, root) {
  const button = root?.querySelector?.('#battle-place');
  if (!(button instanceof HTMLButtonElement)) return;

  const placing = Boolean(
    view.engine?.status === 'playing'
      && view.engine?.placingActive
      && Number.isInteger(view.engine?.selectedHandIndex),
  );

  button.classList.toggle('active', placing);
  button.setAttribute('aria-pressed', placing ? 'true' : 'false');
  button.textContent = '放置';
  button.title = placing
    ? '放置模式已开启：透明格可放置，蓝色格是当前目标，红色格不可放置'
    : '点击后使用当前卡牌进入放置模式';
}

function refreshPlacementUi(view, root) {
  view.lastHandKey = '';
  view.lastInfoKey = '';
  view.lastSkillKey = '';
  view.renderHand?.(root);
  view.renderCardInfo?.(root);
  view.renderSkillPanel?.(root);
  view.syncPlaceGridOverlay?.(root);
  updatePlaceButton(view, root);
}

function activatePlacement(view, root) {
  if (!view.engine || view.engine.status !== 'playing') return;

  if (view.engine.placingActive && Number.isInteger(view.engine.selectedHandIndex)) {
    view.engine.lastDeployError = '';
    refreshPlacementUi(view, root);
    return;
  }

  let handIndex = Number.isInteger(view.engine.selectedHandIndex)
    ? view.engine.selectedHandIndex
    : -1;

  if (handIndex < 0 || !view.canDragCard?.(handIndex)) {
    handIndex = view.engine.deck?.findIndex((_, index) => view.canDragCard?.(index)) ?? -1;
  }

  if (handIndex < 0) {
    view.engine.lastDeployError = '当前没有可放置的卡牌';
    refreshPlacementUi(view, root);
    return;
  }

  view.engine.skills?.cancelTargeting();
  view.engine.skillTargetError = '';
  view.engine.lastDeployError = '';
  view.engine.selectCard(handIndex);
  view.renderer?.setHover(-1, -1);
  refreshPlacementUi(view, root);
}

function installHoverGridSync(view, root) {
  const canvas = root?.querySelector?.('#battle-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  if (canvas.dataset.referenceHoverSync === '1') return;
  canvas.dataset.referenceHoverSync = '1';

  let frame = 0;
  const queueSync = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      view.syncPlaceGridOverlay?.(root);
    });
  };

  canvas.addEventListener('mousemove', queueSync);
  canvas.addEventListener('mouseleave', queueSync);
}

function installMinimalHud(view, root) {
  const fab = root?.querySelector?.('.battle-fab');
  const settingsButton = root?.querySelector?.('#battle-settings');
  const battlefield = root?.querySelector?.('.battle-game-wrap');
  if (!(fab instanceof HTMLElement) || !(battlefield instanceof HTMLElement)) return;

  let placeButton = root.querySelector('#battle-place');
  if (!placeButton && settingsButton instanceof HTMLButtonElement) {
    placeButton = settingsButton.cloneNode(true);
    placeButton.id = 'battle-place';
    placeButton.textContent = '放置';
    placeButton.removeAttribute('aria-expanded');
    // 不替换“设置”按钮，而是把“放置”插在设置前面；设置保留在战斗按钮区。
    settingsButton.insertAdjacentElement('beforebegin', placeButton);

    placeButton.addEventListener('click', () => {
      audio.playSfx('click');
      activatePlacement(view, root);
    });
  }

  const exitButton = root.querySelector('#battle-back');
  const skillButton = root.querySelector('#battle-skill');
  placeButton = root.querySelector('#battle-place');

  /* 战斗场保留：技能、放置、设置、退出。 */
  for (const button of [skillButton, placeButton, settingsButton, exitButton]) {
    if (button) fab.append(button);
  }
  fab.classList.add('battle-field-controls');
  battlefield.append(fab);

  root.querySelector('#settings-panel')?.classList.add('hidden');
  root.querySelector('.battle-immersive-page')?.classList.add('battle-minimal-hud-ready');
  installHoverGridSync(view, root);
  updatePlaceButton(view, root);
}

export function installBattlefieldMinimalHudFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithMinimalHud(root) {
    const result = await originalRenderBattle.call(this, root);
    installMinimalHud(this, root);
    requestAnimationFrame(() => installMinimalHud(this, root));
    return result;
  };

  const originalSyncPlaceGridOverlay = BattleView.prototype.syncPlaceGridOverlay;
  BattleView.prototype.syncPlaceGridOverlay = function syncGridWithPlaceButton(root) {
    const result = originalSyncPlaceGridOverlay.call(this, root);
    updatePlaceButton(this, root);
    return result;
  };

  const originalRenderHand = BattleView.prototype.renderHand;
  BattleView.prototype.renderHand = function renderHandWithPlaceButton(root) {
    const result = originalRenderHand.call(this, root);
    updatePlaceButton(this, root);
    return result;
  };

  window.__verifyBattlefieldMinimalHudFinal = () => {
    const nav = document.querySelector('.bottom-nav');
    return {
      bottomNavHidden: !nav || getComputedStyle(nav).display === 'none',
      placeButton: Boolean(document.querySelector('#battle-place')),
      settingsButtonPresent: Boolean(document.querySelector('#battle-settings')),
      controlsInsideBattlefield: Boolean(
        document.querySelector('.battle-game-wrap > .battle-fab.battle-field-controls'),
      ),
      actions: [...document.querySelectorAll('.battle-fab > button')]
        .map((button) => button.textContent.trim()),
      leftColumn: document.querySelector('.bg-layer-left-column')?.getBoundingClientRect?.() ?? null,
      rightColumn: document.querySelector('.bg-layer-right-column')?.getBoundingClientRect?.() ?? null,
    };
  };
}
