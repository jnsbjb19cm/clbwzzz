import {
  BASE_HP_SLOT_EDGE,
  BASE_HP_SLOT_W,
  CELL_H,
  COLS,
  FIELD_H,
  FIELD_LEFT,
  FIELD_RIGHT_INSET,
  FIELD_TOP,
  GAME_H,
  GAME_W,
  GRID_GAP,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  LANES,
} from './BattleConfig.js';

/**
 * 由画布宽推导战场格线(宽屏拉长时 canvasW > 1248，格子与基地右缘同步变宽)
 * @param {number} canvasW
 */
export function buildBattleGridMetrics(canvasW) {
  const cw = Math.max(GAME_W, Number(canvasW) || GAME_W);
  const fieldW = cw - FIELD_LEFT - FIELD_RIGHT_INSET;
  const cellW = (fieldW - GRID_GAP * (COLS - 1)) / COLS;
  const cellH = CELL_H;
  const gridBodyW = COLS * cellW + (COLS - 1) * GRID_GAP;
  const gridBodyH = LANES * cellH + (GRID_GAP * (LANES - 1));

  const cellX = (col) => GRID_ORIGIN_X + col * (cellW + GRID_GAP);
  const cellY = (lane) => GRID_ORIGIN_Y + lane * (cellH + GRID_GAP);
  const cellCenterX = (col) => cellX(col) + cellW / 2;
  const cellCenterY = (lane) => cellY(lane) + cellH / 2;

  const playerBaseFieldX =
    BASE_HP_SLOT_EDGE + BASE_HP_SLOT_W / 2 - FIELD_LEFT;
  const enemyBaseFieldX =
    cw - BASE_HP_SLOT_EDGE - BASE_HP_SLOT_W / 2 - FIELD_LEFT;

  const centerXToFracCol = (x) =>
    (x - GRID_ORIGIN_X - cellW / 2) / (cellW + GRID_GAP);
  const fracColToCenterX = (fracCol) =>
    GRID_ORIGIN_X + fracCol * (cellW + GRID_GAP) + cellW / 2;
  const colFracToX = (fracCol) => fracColToCenterX(fracCol);

  const playerAttackStopFrac = centerXToFracCol(cellX(0));
  const enemyAttackStopFrac = centerXToFracCol(cellX(COLS - 1) + cellW);

  const pointerToCol = (x) => {
    if (x < 0 || x >= fieldW) return -1;
    for (let c = COLS - 1; c >= 0; c--) {
      if (x >= cellX(c) - GRID_GAP * 0.5) return c;
    }
    return -1;
  };

  const pointerToLane = (y) => {
    if (y < 0 || y >= FIELD_H) return -1;
    for (let l = LANES - 1; l >= 0; l--) {
      if (y >= cellY(l) - GRID_GAP * 0.5) return l;
    }
    return -1;
  };

  return {
    canvasW: cw,
    canvasH: GAME_H,
    fieldW,
    fieldH: FIELD_H,
    cellW,
    cellH,
    gridBodyW,
    gridBodyH,
    playerBaseFieldX,
    enemyBaseFieldX,
    playerBaseGameX: BASE_HP_SLOT_EDGE + BASE_HP_SLOT_W / 2,
    enemyBaseGameX: cw - BASE_HP_SLOT_EDGE - BASE_HP_SLOT_W / 2,
    playerBaseFrac: centerXToFracCol(playerBaseFieldX),
    enemyBaseFrac: centerXToFracCol(enemyBaseFieldX),
    playerAttackStopFrac,
    enemyAttackStopFrac,
    cellX,
    cellY,
    cellCenterX,
    cellCenterY,
    fracColToCenterX,
    colFracToX,
    centerXToFracCol,
    pointerToCol,
    pointerToLane,
  };
}

export function getDefaultBattleGridMetrics() {
  return buildBattleGridMetrics(GAME_W);
}