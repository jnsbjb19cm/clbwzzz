import {
  CELL_W,
  FIELD_H,
  FIELD_W,
  cellCenterX,
  cellCenterY,
  colFracToX,
  laneFracToY,
} from '../battle/BattleConfig.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { resolveProjectileHit } from '../battle/Projectile.js';
import { isEffectivelyFlying, unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { isDeferredTopLayerUnit } from '../battle/unitDisplayTuning.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import skillPosData from '../data/skillPosition.json' with { type: 'json' };
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldAlignmentAuditFinal');
const NORMAL_UNIT_SCALE = 1.78;
const LARGE_UNIT_SCALE = 1.46;
const SMALL_UNIT_SCALE = 2.22;
const FLYING_SMALL_SCALE = 2.10;
const VISUAL_OVERSCAN_X = 280;
const VISUAL_OVERSCAN_Y = 190;
const CACTUS_BULLET_RES = new Set([4, 25]);

const OVERSIZED_NAMES = new Set([
  '黑铁土豆',
  '黑铁土豆卫兵',
  '黑铁土豆守卫',
  '飞行忍者',
]);

const UNDERSIZED_NAMES = new Set([
  '寒冰椰子',
  '仙人掌',
  '极寒冰椰子',
  '极·寒冰椰子',
  '嗜血稻草人',
  '稻草人',
  '三头仙人掌',
  '巨盾核桃卫兵',
  '怪物面包机',
  '太古巫婆',
  '部落野人',
  '太古野人',
  '火龙',
  '丛林守护者',
  '圣光十字军',
  '战争古树',
  '西瓜太郎',
  '真西瓜太郎',
  '死神',
  '软泥怪',
]);

const SKILL_POSITION = new Map();
for (const row of skillPosData ?? []) {
  if (row?.position != null) SKILL_POSITION.set(Number(row.cardId), Number(row.position));
}

function normalizeName(value) {
  return String(value ?? '')
    .replaceAll('·', '')
    .replaceAll(' ', '')
    .trim();
}

function scaleGroupForUnit(unit) {
  const name = normalizeName(unit?.name);
  if (OVERSIZED_NAMES.has(name) || name.startsWith('黑铁土豆')) return 'large';
  if (UNDERSIZED_NAMES.has(name)) return 'small';
  return 'normal';
}

function unitScale(unit, layout) {
  const group = scaleGroupForUnit(unit);
  if (group === 'large') return LARGE_UNIT_SCALE;
  if (group === 'small') {
    return layout?.flying || isEffectivelyFlying(unit) ? FLYING_SMALL_SCALE : SMALL_UNIT_SCALE;
  }
  return NORMAL_UNIT_SCALE;
}

function displayCompensation(renderer) {
  const cached = Number(renderer?.battleDisplayCompensation);
  return Number.isFinite(cached) && cached > 0 ? cached : 1;
}

function withUndistortedScale(renderer, x, y, scale, draw) {
  const ctx = renderer.ctx;
  const compensateX = displayCompensation(renderer);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(compensateX * scale, scale);
  ctx.translate(-x, -y);
  try {
    return draw();
  } finally {
    ctx.restore();
  }
}

function configureFullVisualCanvas(view, root) {
  const field = root?.querySelector?.('.battlefield-wrap');
  const canvas = root?.querySelector?.('#battle-canvas');
  const renderer = view?.renderer;
  if (!(field instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement) || !renderer) return;

  const fieldWidth = Math.max(1, field.clientWidth);
  const fieldHeight = Math.max(1, field.clientHeight);
  const canvasWidth = FIELD_W + VISUAL_OVERSCAN_X * 2;
  const canvasHeight = FIELD_H + VISUAL_OVERSCAN_Y * 2;
  const displayPadX = fieldWidth * (VISUAL_OVERSCAN_X / FIELD_W);
  const displayPadY = fieldHeight * (VISUAL_OVERSCAN_Y / FIELD_H);

  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
  renderer.fieldScale = 1;
  renderer.fieldOffsetX = VISUAL_OVERSCAN_X;
  renderer.fieldOffsetY = VISUAL_OVERSCAN_Y;

  canvas.classList.add('battle-canvas-fullfield-final');
  canvas.style.setProperty('left', `${-displayPadX}px`, 'important');
  canvas.style.setProperty('top', `${-displayPadY}px`, 'important');
  canvas.style.setProperty('right', 'auto', 'important');
  canvas.style.setProperty('bottom', 'auto', 'important');
  canvas.style.setProperty('width', `${fieldWidth + displayPadX * 2}px`, 'important');
  canvas.style.setProperty('height', `${fieldHeight + displayPadY * 2}px`, 'important');
  canvas.dataset.fullfieldOverscan = `${VISUAL_OVERSCAN_X},${VISUAL_OVERSCAN_Y}`;
}

function recordVisualBounds(renderer, unit, layout, scale) {
  renderer._alignmentAudit ??= [];
  if (renderer._alignmentAudit.length > 240) renderer._alignmentAudit.length = 0;
  const anchorX = layout.cx;
  const anchorY = layout.footY;
  const left = anchorX + (layout.portraitX - anchorX) * scale;
  const top = anchorY + (layout.portraitY - anchorY) * scale;
  const right = left + layout.portraitW * scale;
  const bottom = top + layout.portraitH * scale;
  renderer._alignmentAudit.push({
    uid: unit.uid,
    name: unit.name,
    lane: unit.lane,
    col: unit.col,
    scaleGroup: scaleGroupForUnit(unit),
    scale,
    left,
    top,
    right,
    bottom,
    exceedsLogicalField: left < 0 || top < 0 || right > FIELD_W || bottom > FIELD_H,
  });
}

function drawUnitSpriteUndistorted(renderer, ctx, engine, unit, layout, { advanceClock = true } = {}) {
  if (!layout) return false;
  const scale = unitScale(unit, layout);
  recordVisualBounds(renderer, unit, layout, scale);
  return withUndistortedScale(renderer, layout.cx, layout.footY, scale, () => unitAnimPlayer.draw(
    ctx,
    unit,
    engine,
    layout.portraitX,
    layout.portraitY,
    layout.portraitW,
    layout.portraitH,
    {
      flipX: layout.flipX,
      footY: layout.flying ? layout.footY : layout.laneFootY,
      advanceClock,
    },
  ));
}

function sortUnits(units) {
  return [...units].sort((a, b) =>
    a.lane - b.lane
    || a.col - b.col
    || (a.team === 'player' ? 0 : 1) - (b.team === 'player' ? 0 : 1)
    || a.uid - b.uid);
}

function drawUnitsWithVisibleFinalPass(ctx, engine) {
  this._alignmentAudit = [];
  const alive = engine.units.filter(
    (unit) => unit.alive || (unit._deathUntil && engine.time < unit._deathUntil),
  );
  const layouts = new Map();
  for (const unit of alive) {
    const layout = this.computeUnitLayout(engine, unit);
    if (layout) layouts.set(unit, layout);
  }

  const normalGround = sortUnits(alive.filter(
    (unit) => !isEffectivelyFlying(unit) && !isDeferredTopLayerUnit(unit),
  ));
  const aerial = sortUnits(alive.filter((unit) => isEffectivelyFlying(unit)));
  const foreground = sortUnits(alive.filter(
    (unit) => !isEffectivelyFlying(unit) && isDeferredTopLayerUnit(unit),
  ));

  for (const unit of alive) {
    const layout = layouts.get(unit);
    if (layout) this.drawUnitHalo(ctx, unit, layout);
  }
  for (const unit of normalGround) {
    const layout = layouts.get(unit);
    if (layout) this.drawUnitSprite(ctx, engine, unit, layout);
  }

  this.drawProjectiles(ctx, engine);

  for (const unit of aerial) {
    const layout = layouts.get(unit);
    if (layout) this.drawUnitSprite(ctx, engine, unit, layout);
  }
  for (const unit of foreground) {
    const layout = layouts.get(unit);
    if (layout) this.drawUnitSprite(ctx, engine, unit, layout);
  }

  /* 名称、血条和状态最后统一绘制，避免被大型单位和飞行单位遮挡。 */
  for (const unit of alive) {
    const layout = layouts.get(unit);
    if (!layout) continue;
    this.drawUnitCardFace(ctx, unit, layout, engine);
    this.drawUnitUi(ctx, unit, layout, engine);
    unit._prevRenderX = unit.col;
  }
}

function drawProjectilesInAssignedLane(ctx, engine) {
  for (const projectile of engine.projectiles ?? []) {
    if (!projectile.launched) continue;
    const drawX = colFracToX(projectile.x);
    const assignedLane = Number.isFinite(Number(projectile.y))
      ? Number(projectile.y)
      : (Number.isFinite(Number(projectile.hitLane)) ? Number(projectile.hitLane) : Number(projectile.lane) || 0);
    const drawY = laneFracToY(assignedLane, projectile.arcOffset ?? 0);
    const visualScale = projectile.trajectory === 'parabola' ? 1.24 : 1.14;

    withUndistortedScale(this, drawX, drawY, visualScale, () => {
      if (projectile.sourceRes != null) {
        const pack = this.bulletAnims.get(String(projectile.sourceRes));
        if (pack?.meta?.animations?.yidong) {
          const size = projectile.trajectory === 'parabola' ? 30 : 24;
          this.drawBulletAnimFrame(
            ctx,
            pack,
            'yidong',
            drawX,
            drawY,
            size,
            projectile.flightT ?? 0,
            projectile.owner === 'enemy',
          );
          return;
        }
        void this.requestBulletAnim(projectile.sourceRes);
      }

      const image = (projectile.sourceRes != null
        ? this.bulletCache.get(projectile.sourceRes)
        : null) ?? this.bulletCache.get('default');
      const size = projectile.trajectory === 'parabola' ? 28 : 22;
      if (image) {
        ctx.save();
        const bulletRes = projectile.sourceRes != null ? Number(projectile.sourceRes) : null;
        let angle;
        if (bulletRes != null && CACTUS_BULLET_RES.has(bulletRes) && projectile.trajectory === 'straight') {
          angle = projectile.owner === 'player' ? 0 : Math.PI;
        } else {
          angle = Math.atan2(
            projectile.hitCol - projectile.startCol,
            (projectile.hitLane - projectile.lane) * 0.35,
          );
        }
        ctx.translate(drawX, drawY);
        ctx.rotate(angle);
        SpriteAtlas.draw(ctx, image, -size / 2, -size / 2, size, size);
        ctx.restore();
        return;
      }

      ctx.beginPath();
      ctx.arc(drawX, drawY, 8, 0, Math.PI * 2);
      ctx.fillStyle = projectile.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

/*
 * 三头仙人掌等多路攻击会为每发子弹写入独立 hitLane。
 * 旧逻辑用 source lane 做碰撞，导致相邻路线的子弹虽然画出来却只能命中原行。
 */
function updateProjectilesByAssignedLane(dt) {
  for (const projectile of this.projectiles) {
    if (projectile.done) continue;
    const previousX = projectile.x;
    projectile.update(dt);
    if (projectile.launched) projectile.flightT = (projectile.flightT ?? 0) + dt;

    if (
      projectile.launched
      && projectile.trajectory === 'straight'
      && !projectile.visualOnly
      && !projectile.targetBase
    ) {
      const direction = projectile.owner === 'player' ? 1 : -1;
      const lowX = Math.min(previousX, projectile.x);
      const highX = Math.max(previousX, projectile.x);
      const collisionLane = Number.isFinite(Number(projectile.hitLane))
        ? Number(projectile.hitLane)
        : Number(projectile.lane) || 0;
      const collision = this.units
        .filter((unit) => {
          if (unit.team === projectile.owner || !unit.alive || unit.isLowTarget?.()) return false;
          if (!this.isProjectileCollisionTarget(projectile, unit)) return false;
          if (Math.abs(unit.lane - collisionLane) > 0.01) return false;
          const front = direction > 0 ? unit.col - 0.5 : unit.col + 0.5;
          return highX + 1e-6 >= front
            && lowX - 1e-6 <= front
            && (projectile.x - previousX) * direction >= 0;
        })
        .map((unit) => ({ unit, front: direction > 0 ? unit.col - 0.5 : unit.col + 0.5 }))
        .sort((a, b) => direction > 0 ? a.front - b.front : b.front - a.front)[0];

      if (collision) {
        projectile.x = collision.front;
        projectile.resolveCol = collision.front;
        projectile.collidedUnit = collision.unit;
        projectile.done = true;
      }
    }

    if (projectile.done) resolveProjectileHit(projectile, this);
  }
  this.projectiles = this.projectiles.filter((projectile) => !projectile.done);
}

function resolveSkillTarget(effect) {
  const target = effect?.target ?? effect?.targetCell ?? {};
  const lane = Number(
    effect?.targetLane
    ?? effect?.lane
    ?? target?.lane
    ?? target?.row
    ?? 2,
  );
  const col = Number(
    effect?.targetCol
    ?? effect?.col
    ?? target?.col
    ?? target?.column
    ?? 5.5,
  );
  return {
    lane: Number.isFinite(lane) ? lane : 2,
    col: Number.isFinite(col) ? col : 5.5,
  };
}

function drawSkillsAtDeclaredTarget(ctx, engine) {
  for (const effect of engine.skillFx ?? engine.skillEffects ?? []) {
    const target = resolveSkillTarget(effect);
    const positionType = SKILL_POSITION.get(Number(effect.skillId));
    const remain = 1 - effect.t / Math.max(0.001, effect.duration || 1);
    const alpha = effect.t < 0.05 ? effect.t / 0.05 : Math.min(1, remain * 4);
    const fullScreen = effect.fullScreen || positionType === 2;

    if (fullScreen) {
      skillAnimPlayer.drawCover(
        ctx,
        effect.skillId,
        0,
        0,
        FIELD_W,
        FIELD_H,
        effect.t,
        alpha * 0.92,
        effect.loop === true,
      );
      continue;
    }

    let cx = cellCenterX(target.col);
    const cy = cellCenterY(target.lane);
    if (positionType === 5) {
      if (effect.targetBase === 'player' || effect.side === 'player') cx = 4;
      else if (effect.targetBase === 'enemy' || effect.side === 'enemy') cx = FIELD_W - 4;
    } else if (positionType === 6 && Number.isFinite(Number(effect.fixedX))) {
      cx = Number(effect.fixedX);
    }

    const size = CELL_W * Math.max(1.35, 1.35 + (Number(effect.radius) || 0) * 1.35);
    if (positionType === 4) {
      skillAnimPlayer.draw(ctx, effect.skillId, cx - CELL_W * 0.85, cy, size * 0.9, effect.t, alpha, effect.loop === true);
      skillAnimPlayer.draw(ctx, effect.skillId, cx + CELL_W * 0.85, cy, size * 0.9, effect.t, alpha, effect.loop === true);
      continue;
    }
    skillAnimPlayer.draw(ctx, effect.skillId, cx, cy, size, effect.t, alpha, effect.loop === true);
  }
}

function alignBaseBars(root) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const topUi = root?.querySelector?.('.top-ui');
  const player = root?.querySelector?.('.base-hp-slot.player');
  const enemy = root?.querySelector?.('.base-hp-slot.enemy');
  if (!(viewport instanceof HTMLElement) || !(topUi instanceof HTMLElement)) return;

  const viewportRect = viewport.getBoundingClientRect();
  const topRect = topUi.getBoundingClientRect();
  const leftGap = Math.max(190, Math.min(430, topRect.left - viewportRect.left));
  const rightGap = Math.max(190, Math.min(430, viewportRect.right - topRect.right));

  if (player instanceof HTMLElement) {
    if (player.parentElement !== viewport) viewport.append(player);
    player.style.setProperty('left', '0px', 'important');
    player.style.setProperty('right', 'auto', 'important');
    player.style.setProperty('top', '0px', 'important');
    player.style.setProperty('width', `${leftGap.toFixed(2)}px`, 'important');
  }
  if (enemy instanceof HTMLElement) {
    if (enemy.parentElement !== viewport) viewport.append(enemy);
    enemy.style.setProperty('right', '0px', 'important');
    enemy.style.setProperty('left', 'auto', 'important');
    enemy.style.setProperty('top', '0px', 'important');
    enemy.style.setProperty('width', `${rightGap.toFixed(2)}px`, 'important');
  }
}

export function installBattlefieldAlignmentAuditFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleEngine.prototype.updateProjectiles = updateProjectilesByAssignedLane;
  BattleRenderer.prototype.drawUnitSprite = function drawUnitSpriteFinal(
    ctx,
    engine,
    unit,
    layout,
    options,
  ) {
    return drawUnitSpriteUndistorted(this, ctx, engine, unit, layout, options);
  };
  BattleRenderer.prototype.drawUnits = drawUnitsWithVisibleFinalPass;
  BattleRenderer.prototype.drawProjectiles = drawProjectilesInAssignedLane;
  BattleRenderer.prototype.drawSkillFx = drawSkillsAtDeclaredTarget;

  const previousDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithoutMisplacedDuplicateSkills(engine) {
    const originalRuntimeEffects = engine?._battleVisualEffects;
    if (Array.isArray(originalRuntimeEffects)) {
      engine._battleVisualEffects = originalRuntimeEffects.filter((effect) => effect?.kind !== 'skill');
    }
    try {
      return previousDraw.call(this, engine);
    } finally {
      if (Array.isArray(originalRuntimeEffects)) engine._battleVisualEffects = originalRuntimeEffects;
    }
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithFinalAlignment(root) {
    const result = await previousRenderBattle.call(this, root);
    const container = root.querySelector('.game-container');
    container?.classList.add('battle-alignment-audited-final');
    if (container) container.__battleView = this;
    root.querySelector('.battlefield-wrap')?.setAttribute('data-fullfield-visuals', 'true');
    configureFullVisualCanvas(this, root);
    alignBaseBars(root);
    requestAnimationFrame(() => {
      configureFullVisualCanvas(this, root);
      alignBaseBars(root);
    });
    return result;
  };

  const previousFit = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleScaleWithFinalAlignment(root) {
    const result = previousFit.call(this, root);
    configureFullVisualCanvas(this, root);
    alignBaseBars(root);
    return result;
  };

  const previousSyncHud = BattleView.prototype.syncHud;
  BattleView.prototype.syncHud = function syncHudWithFinalAlignment(root) {
    const result = previousSyncHud.call(this, root);
    alignBaseBars(root);
    return result;
  };

  window.__auditBattlefieldAlignmentFinal = () => {
    const canvas = document.querySelector('#battle-canvas');
    const container = document.querySelector('.battle-alignment-audited-final');
    const renderer = container?.__battleView?.renderer;
    const entries = renderer?._alignmentAudit ?? [];
    return {
      enabled: Boolean(container),
      canvas: canvas?.getBoundingClientRect?.() ?? null,
      intrinsic: canvas ? `${canvas.width}x${canvas.height}` : null,
      fullfieldOverscan: canvas?.dataset.fullfieldOverscan ?? null,
      unitCount: entries.length,
      logicalOverflowUnits: entries.filter((entry) => entry.exceedsLogicalField),
      scales: {
        normal: NORMAL_UNIT_SCALE,
        oversized: LARGE_UNIT_SCALE,
        undersized: SMALL_UNIT_SCALE,
      },
      bulletsUseAssignedLane: true,
      skillRuntimeDuplicateSuppressed: true,
    };
  };
}
