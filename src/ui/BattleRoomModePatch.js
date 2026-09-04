import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomModePatch');

export function installBattleRoomModePatch() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderWithExplicitRoomMode(root, options = {}) {
    const result = originalRender.call(this, root, options);
    const room = root.querySelector('.game-room');
    if (room) {
      const mode = String(options.mode || this._mode || 'pve').toLowerCase();
      room.dataset.roomMode = mode;
      room.classList.toggle('room-pvp-like', mode === 'pvp');
      room.classList.toggle('room-pve-like', mode !== 'pvp');
      requestAnimationFrame(() => window.__applyBattleRoomStateGuard?.());
    }
    return result;
  };
}
