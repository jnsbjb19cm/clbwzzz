import { COLS, LANES } from './BattleConfig.js';

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

/**
 * 战斗画面的唯一坐标入口。
 *
 * - client：浏览器视口坐标(鼠标、触摸、拖拽)
 * - world：Canvas 逻辑像素坐标
 * - cell：战斗格 lane/col
 *
 * 不允许调用方自行重复叠加 FIELD_TOP、父层 scale 或 CSS 偏移。
 */
export class BattleWorldCoordinates {
  constructor(view, root) {
    this.update(view, root);
  }

  update(view, root) {
    this.view = view ?? this.view;
    this.root = root ?? this.root ?? view?.viewRoot ?? null;
    return this;
  }

  get field() {
    return this.root?.querySelector?.('.battlefield-wrap') ?? null;
  }

  get canvas() {
    return this.root?.querySelector?.('#battle-canvas') ?? null;
  }

  get overlay() {
    return this.root?.querySelector?.('#place-grid-overlay') ?? null;
  }

  getFieldRect() {
    return this.field?.getBoundingClientRect?.() ?? null;
  }

  getCanvasRect() {
    return this.canvas?.getBoundingClientRect?.() ?? null;
  }

  getCellElement(lane, col) {
    if (!Number.isInteger(lane) || !Number.isInteger(col)) return null;
    return this.overlay?.querySelector?.(
      `.place-grid-cell[data-lane="${lane}"][data-col="${col}"]`,
    ) ?? null;
  }

  getCellRect(lane, col) {
    return this.getCellElement(lane, col)?.getBoundingClientRect?.() ?? null;
  }

  /** 使用真实 DOM 格子边界命中，避免 grid gap、边框和父层 transform 造成偏差。 */
  clientToCell(clientX, clientY) {
    const x = finite(clientX, Number.NaN);
    const y = finite(clientY, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { lane: -1, col: -1 };
    }

    const fieldRect = this.getFieldRect();
    if (!fieldRect || x < fieldRect.left || x >= fieldRect.right || y < fieldRect.top || y >= fieldRect.bottom) {
      return { lane: -1, col: -1 };
    }

    const cells = this.overlay?.querySelectorAll?.('.place-grid-cell') ?? [];
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      const lane = Number(cell.dataset.lane);
      const col = Number(cell.dataset.col);
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
        return { lane, col };
      }
      const center = centerOf(rect);
      const distance = (center.x - x) ** 2 + (center.y - y) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = { lane, col };
      }
    }

    // 格子间隙吸附到最近格，避免鼠标在黄色边框缝隙中突然失去目标。
    if (nearest) return nearest;

    return {
      col: Math.max(0, Math.min(COLS - 1, Math.floor(((x - fieldRect.left) / fieldRect.width) * COLS))),
      lane: Math.max(0, Math.min(LANES - 1, Math.floor(((y - fieldRect.top) / fieldRect.height) * LANES))),
    };
  }

  cellToClientCenter(lane, col) {
    const rect = this.getCellRect(lane, col);
    if (rect) return centerOf(rect);

    const fieldRect = this.getFieldRect();
    if (!fieldRect) return null;
    return {
      x: fieldRect.left + ((col + 0.5) / COLS) * fieldRect.width,
      y: fieldRect.top + ((lane + 0.5) / LANES) * fieldRect.height,
    };
  }

  clientToWorld(clientX, clientY) {
    const canvas = this.canvas;
    const rect = this.getCanvasRect();
    if (!canvas || !rect?.width || !rect?.height) return null;
    return {
      x: (finite(clientX) - rect.left) * (canvas.width / rect.width),
      y: (finite(clientY) - rect.top) * (canvas.height / rect.height),
    };
  }

  worldToClient(worldX, worldY) {
    const canvas = this.canvas;
    const rect = this.getCanvasRect();
    if (!canvas || !rect?.width || !rect?.height || !canvas.width || !canvas.height) return null;
    return {
      x: rect.left + finite(worldX) * (rect.width / canvas.width),
      y: rect.top + finite(worldY) * (rect.height / canvas.height),
    };
  }
}

export function ensureBattleWorldCoordinates(view, root = view?.viewRoot) {
  if (!view) return null;
  if (!(view.battleWorld instanceof BattleWorldCoordinates)) {
    view.battleWorld = new BattleWorldCoordinates(view, root);
  } else {
    view.battleWorld.update(view, root);
  }
  globalThis.__activeBattleWorldView = view;
  return view.battleWorld;
}
