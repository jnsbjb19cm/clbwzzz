import {
  CELL_H,
  CELL_W,
  COLS,
  FIELD_H,
  FIELD_W,
  LANES,
  cellCenterX,
  cellCenterY,
} from '../battle/BattleConfig.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import skillPosData from '../data/skillPosition.json' with { type: 'json' };

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldSkillTargetFinal');
const TOMATO_SKILL_ID = 500;
const TOMATO_ANCHOR_OFFSET_Y = -CELL_H * 0.36;

const SKILL_POSITION = new Map();
for (const row of skillPosData ?? []) {
  if (row?.position != null) SKILL_POSITION.set(Number(row.cardId), Number(row.position));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTarget(target, { snap = true } = {}) {
  const rawLane = Number(target?.lane ?? target?.row ?? 2);
  const rawCol = Number(target?.col ?? target?.column ?? 5);
  const lane = clamp(snap ? Math.round(rawLane) : rawLane, 0, LANES - 1);
  const col = clamp(snap ? Math.round(rawCol) : rawCol, 0, COLS - 1);
  return { lane, col };
}

function resolveSkillTarget(effect) {
  const nested = effect?.target ?? effect?.targetCell ?? {};
  return normalizeTarget({
    lane: effect?.targetLane ?? effect?.lane ?? nested?.lane ?? nested?.row,
    col: effect?.targetCol ?? effect?.col ?? nested?.col ?? nested?.column,
  });
}

function drawSkillFxTargeted(ctx, engine) {
  this._skillTargetAudit = [];
  for (const effect of engine.skillFx ?? engine.skillEffects ?? []) {
    const skillId = Number(effect.skillId);
    const target = resolveSkillTarget(effect);
    const positionType = SKILL_POSITION.get(skillId);
    const remain = 1 - effect.t / Math.max(0.001, effect.duration || 1);
    const alpha = effect.t < 0.05 ? effect.t / 0.05 : Math.min(1, remain * 4);
    const fullScreen = effect.fullScreen || positionType === 2;

    if (fullScreen) {
      skillAnimPlayer.drawCover(
        ctx,
        skillId,
        0,
        0,
        FIELD_W,
        FIELD_H,
        effect.t,
        alpha * 0.92,
        effect.loop === true,
      );
      this._skillTargetAudit.push({
        skillId,
        fullScreen: true,
        targetLane: target.lane,
        targetCol: target.col,
      });
      continue;
    }

    let cx = cellCenterX(target.col);
    const targetCy = cellCenterY(target.lane);
    let cy = targetCy;
    if (positionType === 5) {
      if (effect.targetBase === 'player' || effect.side === 'player') cx = 4;
      else if (effect.targetBase === 'enemy' || effect.side === 'enemy') cx = FIELD_W - 4;
    } else if (positionType === 6 && Number.isFinite(Number(effect.fixedX))) {
      cx = Number(effect.fixedX);
    }

    /*
     * 番茄炸弹帧为 366×230，爆点位于画面下部；直接把整帧几何中心放到格心，
     * 会让实际爆点落到目标格下方。将动画整体上移，使爆炸根点落在目标格中心。
     */
    if (skillId === TOMATO_SKILL_ID) cy += TOMATO_ANCHOR_OFFSET_Y;

    const size = CELL_W * Math.max(1.35, 1.35 + (Number(effect.radius) || 0) * 1.35);
    if (positionType === 4) {
      skillAnimPlayer.draw(
        ctx,
        skillId,
        cx - CELL_W * 0.85,
        cy,
        size * 0.9,
        effect.t,
        alpha,
        effect.loop === true,
      );
      skillAnimPlayer.draw(
        ctx,
        skillId,
        cx + CELL_W * 0.85,
        cy,
        size * 0.9,
        effect.t,
        alpha,
        effect.loop === true,
      );
    } else {
      skillAnimPlayer.draw(
        ctx,
        skillId,
        cx,
        cy,
        size,
        effect.t,
        alpha,
        effect.loop === true,
      );
    }

    this._skillTargetAudit.push({
      skillId,
      fullScreen: false,
      positionType: positionType ?? null,
      targetLane: target.lane,
      targetCol: target.col,
      targetX: cellCenterX(target.col),
      targetY: targetCy,
      drawX: cx,
      drawY: cy,
      anchorOffsetY: cy - targetCy,
      radius: Number(effect.radius) || 0,
    });
  }
}

export function installBattlefieldSkillTargetFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousPushSkillEffect = BattleEngine.prototype.pushSkillEffect;
  BattleEngine.prototype.pushSkillEffect = function pushSkillEffectOnExactCell(
    kind,
    target,
    radius,
    skillId,
    duration,
    loop = false,
  ) {
    const id = Number(skillId);
    const normalizedTarget = target && target.lane != null && target.col != null
      ? normalizeTarget(target, { snap: id === TOMATO_SKILL_ID || SKILL_POSITION.get(id) === 1 })
      : target;
    return previousPushSkillEffect.call(
      this,
      kind,
      normalizedTarget,
      radius,
      skillId,
      duration,
      loop,
    );
  };

  BattleRenderer.prototype.drawSkillFx = drawSkillFxTargeted;

  window.__verifyBattlefieldSkillTargetFinal = () => {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView;
    return {
      enabled: true,
      tomatoSkillId: TOMATO_SKILL_ID,
      tomatoAnchorOffsetY: TOMATO_ANCHOR_OFFSET_Y,
      runtime: view?.renderer?._skillTargetAudit ?? [],
      pendingEffects: view?.engine?.skillFx?.map((effect) => ({
        skillId: effect.skillId,
        lane: effect.lane,
        col: effect.col,
        radius: effect.radius,
      })) ?? [],
    };
  };
}
