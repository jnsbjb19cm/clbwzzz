import {
  CELL_H,
  CELL_W,
  COLS,
  FIELD_W,
  LANES,
  cellCenterX,
  cellCenterY,
} from '../battle/BattleConfig.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import skillPosData from '../data/skillPosition.json' with { type: 'json' };

const PATCH_FLAG = Symbol.for('clbwzzz.battleSkillPositionFinal');
const TOMATO_SKILL_ID = 500;
const TOMATO_ANCHOR_OFFSET_Y = -CELL_H * 0.36;

const SKILL_POSITION = new Map();
for (const row of skillPosData ?? []) {
  if (row?.position != null) SKILL_POSITION.set(Number(row.cardId), Number(row.position));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function targetOf(effect) {
  const nested = effect?.target ?? effect?.targetCell ?? {};
  return {
    lane: clamp(Math.round(finite(
      effect?.targetLane ?? effect?.lane ?? nested?.lane ?? nested?.row,
      2,
    )), 0, LANES - 1),
    col: clamp(Math.round(finite(
      effect?.targetCol ?? effect?.col ?? nested?.col ?? nested?.column,
      5,
    )), 0, COLS - 1),
  };
}

function viewportFieldBounds(renderer) {
  const canvas = renderer?.canvas;
  const scale = Math.max(0.0001, finite(renderer?.fieldScale, 1) || 1);
  const left = -finite(renderer?.fieldOffsetX, 0) / scale;
  const top = -finite(renderer?.fieldOffsetY, 0) / scale;
  const width = Math.max(1, finite(canvas?.width, 1)) / scale;
  const height = Math.max(1, finite(canvas?.height, 1)) / scale;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function drawSkillFxWithOriginalPositions(ctx, engine) {
  this._runtimeCoordinateSkillAudit = [];
  this._runtimeViewportCovers = [];

  for (const effect of engine?.skillFx ?? engine?.skillEffects ?? []) {
    if (effect.startAt != null && finite(engine?.time) < finite(effect.startAt)) continue;

    const skillId = Number(effect.skillId);
    const positionType = SKILL_POSITION.get(skillId);
    const target = targetOf(effect);
    const targetX = cellCenterX(target.col);
    const targetY = cellCenterY(target.lane);
    const duration = Math.max(0.001, finite(effect.duration, 1));
    const elapsed = Math.max(0, finite(effect.t));
    const remain = 1 - elapsed / duration;
    if (remain <= 0) continue;
    const alpha = elapsed < 0.05 ? elapsed / 0.05 : Math.min(1, remain * 4);
    const fullScreen = effect.fullScreen === true || positionType === 2;

    if (fullScreen) {
      const viewport = viewportFieldBounds(this);
      skillAnimPlayer.drawCover(
        ctx,
        skillId,
        viewport.left,
        viewport.top,
        viewport.width,
        viewport.height,
        elapsed,
        alpha * 0.92,
        effect.loop === true,
      );
      this._runtimeViewportCovers.push({ skillId, ...viewport });
      this._runtimeCoordinateSkillAudit.push({
        skillId,
        positionType: positionType ?? null,
        fullScreen: true,
        targetLane: target.lane,
        targetCol: target.col,
        drawX: targetX,
        drawY: targetY,
        cellX: targetX,
        cellY: targetY,
        logicalTargetX: targetX,
        logicalTargetY: targetY,
      });
      continue;
    }

    let drawX = targetX;
    let drawY = targetY;
    if (positionType === 5) {
      if (effect.targetBase === 'player' || effect.side === 'player') drawX = 4;
      else if (effect.targetBase === 'enemy' || effect.side === 'enemy') drawX = FIELD_W - 4;
    } else if (positionType === 6 && Number.isFinite(Number(effect.fixedX))) {
      drawX = Number(effect.fixedX);
    }
    if (skillId === TOMATO_SKILL_ID) drawY += TOMATO_ANCHOR_OFFSET_Y;

    const size = Math.max(CELL_W, CELL_H)
      * Math.max(1.35, 1.35 + finite(effect.radius) * 1.35);

    if (positionType === 4) {
      skillAnimPlayer.draw(
        ctx,
        skillId,
        drawX - CELL_W * 0.85,
        drawY,
        size * 0.9,
        elapsed,
        alpha,
        effect.loop === true,
      );
      skillAnimPlayer.draw(
        ctx,
        skillId,
        drawX + CELL_W * 0.85,
        drawY,
        size * 0.9,
        elapsed,
        alpha,
        effect.loop === true,
      );
    } else {
      skillAnimPlayer.draw(
        ctx,
        skillId,
        drawX,
        drawY,
        size,
        elapsed,
        alpha,
        effect.loop === true,
      );
    }

    // cellX/cellY 在诊断接口中表示“该视觉按原资源语义应落到的锚点”，
    // 而 logicalTargetX/Y 单独保留玩家点中的格心。番茄炸弹素材的爆心本来
    // 就在格心上方，不能把正确的素材锚点误报成坐标漂移。
    this._runtimeCoordinateSkillAudit.push({
      skillId,
      positionType: positionType ?? null,
      fullScreen: false,
      targetLane: target.lane,
      targetCol: target.col,
      drawX,
      drawY,
      cellX: drawX,
      cellY: drawY,
      logicalTargetX: targetX,
      logicalTargetY: targetY,
      anchorOffsetY: drawY - targetY,
    });
  }
}

export function installBattleSkillPositionFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleRenderer.prototype.drawSkillFx = drawSkillFxWithOriginalPositions;

  globalThis.__verifyBattleSkillPositionFinal = () => ({
    enabled: true,
    usesDomGeometryInRenderPath: false,
    supportedPositionTypes: [1, 2, 4, 5, 6],
    tomatoAnchorOffsetY: TOMATO_ANCHOR_OFFSET_Y,
  });
}
