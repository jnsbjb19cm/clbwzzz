import { ensureBattleWorldCoordinates } from '../battle/BattleWorldCoordinates.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlePointerRound3Compat');

export function installBattlePointerRound3Compat() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  /**
   * 所有模式统一走 BattleWorldCoordinates；不再分别使用 canvas rect、fieldScale、
   * FIELD_TOP 或 PVP 百分比重复换算。
   */
  BattleView.prototype.pointerToCell = function pointerToUnifiedBattleCell(event) {
    const world = ensureBattleWorldCoordinates(this, this.viewRoot);
    return world?.clientToCell(event.clientX, event.clientY) ?? { lane: -1, col: -1 };
  };

  window.__verifyBattleWorldCoordinates = () => {
    const view = globalThis.__activeBattleWorldView;
    const world = view ? ensureBattleWorldCoordinates(view, view.viewRoot) : null;
    const field = world?.getFieldRect();
    const hoverLane = Number(view?.renderer?.hoverLane);
    const hoverCol = Number(view?.renderer?.hoverCol);
    return {
      enabled: Boolean(world),
      field: field ? {
        left: field.left,
        top: field.top,
        width: field.width,
        height: field.height,
      } : null,
      hover: {
        lane: Number.isInteger(hoverLane) ? hoverLane : -1,
        col: Number.isInteger(hoverCol) ? hoverCol : -1,
      },
      hoverCenter: world?.cellToClientCenter(hoverLane, hoverCol) ?? null,
    };
  };
}
