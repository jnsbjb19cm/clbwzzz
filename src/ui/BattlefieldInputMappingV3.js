import { pointerToCol, pointerToLane } from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldInputMappingV3');

export function installBattlefieldInputMappingV3() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleView.prototype.pointerToCell = function pointerToCellV3(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scale = this.renderer?.fieldScale || 1;
    const offsetX = this.renderer?.fieldOffsetX || 0;
    const offsetY = this.renderer?.fieldOffsetY || 0;
    const canvasX = (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    const canvasY = (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
    const fieldX = (canvasX - offsetX) / Math.max(0.0001, scale);
    const fieldY = (canvasY - offsetY) / Math.max(0.0001, scale);
    return {
      col: pointerToCol(fieldX),
      lane: pointerToLane(fieldY),
    };
  };

  window.__verifyBattlefieldInputMappingV3 = () => {
    const canvas = document.querySelector('#battle-canvas');
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView;
    return {
      enabled: true,
      canvas: canvas?.getBoundingClientRect?.() ?? null,
      fieldOffsetX: view?.renderer?.fieldOffsetX ?? null,
      fieldOffsetY: view?.renderer?.fieldOffsetY ?? null,
      fieldScale: view?.renderer?.fieldScale ?? null,
    };
  };
}
