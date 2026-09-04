import {
  CELL_W,
  FIELD_H,
  FIELD_W,
  LANES,
  canUnitHitBase,
  cellCenterX,
  cellCenterY,
  colFracToX,
  getAttackCooldown,
  getProjectileHitFrac,
  laneFracToY,
  roundBattleAmount,
} from '../battle/BattleConfig.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { resolveProjectileHit } from '../battle/Projectile.js';
import { isEffectivelyFlying, unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { isDeferredTopLayerUnit } from '../battle/unitDisplayTuning.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';
import { audio } from '../core/AudioManager.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import skillPosData from '../data/skillPosition.json' with { type: 'json' };
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldSceneV3Final');
const NORMAL_SCALE = 1.78;
const LARGE_SCALE = 1.46;
const SMALL_SCALE = 2.22;
const SMALL_FLYING_SCALE = 2.10;
const TOP_LANE_COMPENSATION = 1 / 0.82;
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

function unitScaleGroup(unit) {
  const name = normalizeName(unit?.name);
  if (OVERSIZED_NAMES.has(name) || name.startsWith('黑铁土豆')) return 'large';
  if (UNDERSIZED_NAMES.has(name)) return 'small';
  return 'normal';
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

function scaleForUnit(unit, layout) {
  const group = unitScaleGroup(unit);
  let scale = group === 'large'
    ? LARGE_SCALE
    : group === 'small'
      ? (layout?.flying || isEffectivelyFlying(unit) ? SMALL_FLYING_SCALE : SMALL_SCALE)
      : NORMAL_SCALE;

  /* BattleRenderer 的旧布局会把第一行固定乘 0.82；这里精确抵消，确保同卡跨行同尺寸。 */
  if (Number(unit?.lane) === 0) scale *= TOP_LANE_COMPENSATION;
  return scale;
}

function drawUnitSpriteV3(renderer, ctx, engine, unit, layout, { advanceClock = true } = {}) {
  if (!layout) return false;
  const scale = scaleForUnit(unit, layout);
  renderer._v3VisualAudit ??= [];
  if (renderer._v3VisualAudit.length > 240) renderer._v3VisualAudit.length = 0;
  renderer._v3VisualAudit.push({
    uid: unit.uid,
    name: unit.name,
    lane: unit.lane,
    group: unitScaleGroup(unit),
    scale,
  });

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

function sortedUnits(units) {
  return [...units].sort((a, b) =>
    a.lane - b.lane
    || a.col - b.col
    || (a.team === 'player' ? 0 : 1) - (b.team === 'player' ? 0 : 1)
    || a.uid - b.uid);
}

function drawUnitsV3(ctx, engine) {
  this._v3VisualAudit = [];
  const alive = engine.units.filter(
    (unit) => unit.alive || (unit._deathUntil && engine.time < unit._deathUntil),
  );
  const layouts = new Map();
  for (const unit of alive) {
    const layout = this.computeUnitLayout(engine, unit);
    if (layout) layouts.set(unit, layout);
  }

  const ground = sortedUnits(alive.filter(
    (unit) => !isEffectivelyFlying(unit) && !isDeferredTopLayerUnit(unit),
  ));
  const aerial = sortedUnits(alive.filter((unit) => isEffectivelyFlying(unit)));
  const foreground = sortedUnits(alive.filter(
    (unit) => !isEffectivelyFlying(unit) && isDeferredTopLayerUnit(unit),
  ));

  for (const unit of alive) {
    const layout = layouts.get(unit);
    if (layout) this.drawUnitHalo(ctx, unit, layout);
  }
  for (const unit of ground) {
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

  /* 名称、血条、状态最后绘制，避免被大型卡牌或飞行单位遮挡。 */
  for (const unit of alive) {
    const layout = layouts.get(unit);
    if (!layout) continue;
    this.drawUnitCardFace(ctx, unit, layout, engine);
    this.drawUnitUi(ctx, unit, layout, engine);
    unit._prevRenderX = unit.col;
  }
}

function drawProjectilesV3(ctx, engine) {
  for (const projectile of engine.projectiles ?? []) {
    if (!projectile.launched) continue;
    const drawX = colFracToX(projectile.x);
    const visualLane = Number.isFinite(Number(projectile.visualLane))
      ? Number(projectile.visualLane)
      : Number.isFinite(Number(projectile.y))
        ? Number(projectile.y)
        : Number(projectile.hitLane ?? projectile.lane) || 0;
    const drawY = laneFracToY(visualLane, projectile.arcOffset ?? 0);
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
        const angle = bulletRes != null
          && CACTUS_BULLET_RES.has(bulletRes)
          && projectile.trajectory === 'straight'
          ? (projectile.owner === 'player' ? 0 : Math.PI)
          : Math.atan2(
              (Number(projectile.hitLane) - Number(projectile.lane)) * 0.35,
              Number(projectile.hitCol) - Number(projectile.startCol),
            );
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

function updateProjectilesV3(dt) {
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
          if (Math.abs(Number(unit.lane) - collisionLane) > 0.01) return false;
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

function tripleRows(lane) {
  const start = Math.max(0, Math.min(LANES - 3, Number(lane) - 1));
  return [start, start + 1, start + 2];
}

function tryTripleAttackV3(unit) {
  unit.atkTimer = getAttackCooldown(unit.atkSpeed);
  const damage = roundBattleAmount(
    Math.max(1, (unit.atk + this.getAuraBonus(unit) + (unit.tempAtkBonus ?? 0)) * 0.5),
  );
  let bullets = 0;

  for (const lane of tripleRows(unit.lane)) {
    const best = this.pickPriorityTarget(unit, this.getEnemiesInLane(unit, lane));
    let target = best;
    if (!target && canUnitHitBase(unit) && !unit.isMovable?.()) {
      target = {
        _isBase: true,
        lane,
        col: unit.getBaseFracCol(),
        team: unit.team === 'player' ? 'enemy' : 'player',
      };
    }
    if (!target) continue;

    const hitCol = target._isBase
      ? target.col
      : getProjectileHitFrac(unit.team, target.col);
    this.fireProjectile(unit, target, damage, {
      trajectory: 'straight',
      targetUid: target._isBase ? null : target.uid,
      targetBase: target._isBase ? (unit.team === 'player' ? 'enemy' : 'player') : null,
      hitLane: lane,
      hitCol,
      resolveCol: hitCol,
    });
    const projectile = this.projectiles.at(-1);
    if (projectile) projectile.visualLane = lane;
    bullets += 1;
  }

  if (bullets > 0) {
    audio.playAttack(unit.cardId, unit);
    this.pushLog(`${unit.name} 三路攻击：${tripleRows(unit.lane).map((lane) => lane + 1).join('、')}路`);
    return true;
  }
  return false;
}

function resolveSkillTarget(effect) {
  const target = effect?.target ?? effect?.targetCell ?? {};
  const lane = Number(effect?.targetLane ?? effect?.lane ?? target?.lane ?? target?.row ?? 2);
  const col = Number(effect?.targetCol ?? effect?.col ?? target?.col ?? target?.column ?? 5.5);
  return {
    lane: Number.isFinite(lane) ? lane : 2,
    col: Number.isFinite(col) ? col : 5.5,
  };
}

function drawSkillFxV3(ctx, engine) {
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
    } else {
      skillAnimPlayer.draw(ctx, effect.skillId, cx, cy, size, effect.t, alpha, effect.loop === true);
    }
  }
}

function configureViewportCanvas(view, root) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const field = root?.querySelector?.('.battlefield-wrap');
  const canvas = root?.querySelector?.('#battle-canvas');
  const renderer = view?.renderer;
  if (!(viewport instanceof HTMLElement)
    || !(field instanceof HTMLElement)
    || !(canvas instanceof HTMLCanvasElement)
    || !renderer) return;

  const viewportRect = viewport.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  if (!viewportRect.width || !viewportRect.height || !fieldRect.width || !fieldRect.height) return;

  const scaleX = fieldRect.width / FIELD_W;
  const scaleY = fieldRect.height / FIELD_H;
  const displayLeft = Math.max(0, fieldRect.left - viewportRect.left);
  const displayRight = Math.max(0, viewportRect.right - fieldRect.right);
  const displayTop = Math.max(0, fieldRect.top - viewportRect.top);
  const displayBottom = Math.max(0, viewportRect.bottom - fieldRect.bottom);
  const logicalLeft = displayLeft / Math.max(scaleX, 0.0001);
  const logicalRight = displayRight / Math.max(scaleX, 0.0001);
  const logicalTop = displayTop / Math.max(scaleY, 0.0001);
  const logicalBottom = displayBottom / Math.max(scaleY, 0.0001);
  const canvasWidth = Math.max(1, Math.round(FIELD_W + logicalLeft + logicalRight));
  const canvasHeight = Math.max(1, Math.round(FIELD_H + logicalTop + logicalBottom));

  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
  renderer.fieldScale = 1;
  renderer.fieldOffsetX = logicalLeft;
  renderer.fieldOffsetY = logicalTop;

  canvas.classList.add('battle-canvas-viewport-v3');
  canvas.style.setProperty('left', `${-displayLeft}px`, 'important');
  canvas.style.setProperty('top', `${-displayTop}px`, 'important');
  canvas.style.setProperty('right', 'auto', 'important');
  canvas.style.setProperty('bottom', 'auto', 'important');
  canvas.style.setProperty('width', `${viewportRect.width}px`, 'important');
  canvas.style.setProperty('height', `${viewportRect.height}px`, 'important');
  canvas.dataset.viewportPadding = [displayLeft, displayTop, displayRight, displayBottom]
    .map((value) => value.toFixed(1))
    .join(',');
  field.dataset.viewportCanvas = 'true';
}

function alignBaseBars(root) {
  const viewport = root?.querySelector?.('.battle-game-wrap');
  const topUi = root?.querySelector?.('.top-ui');
  const player = root?.querySelector?.('.base-hp-slot.player');
  const enemy = root?.querySelector?.('.base-hp-slot.enemy');
  if (!(viewport instanceof HTMLElement) || !(topUi instanceof HTMLElement)) return;
  const viewportRect = viewport.getBoundingClientRect();
  const topRect = topUi.getBoundingClientRect();
  const leftWidth = Math.max(180, topRect.left - viewportRect.left);
  const rightWidth = Math.max(180, viewportRect.right - topRect.right);

  if (player instanceof HTMLElement) {
    if (player.parentElement !== viewport) viewport.append(player);
    player.style.setProperty('left', '0px', 'important');
    player.style.setProperty('right', 'auto', 'important');
    player.style.setProperty('top', '0px', 'important');
    player.style.setProperty('width', `${leftWidth.toFixed(1)}px`, 'important');
  }
  if (enemy instanceof HTMLElement) {
    if (enemy.parentElement !== viewport) viewport.append(enemy);
    enemy.style.setProperty('right', '0px', 'important');
    enemy.style.setProperty('left', 'auto', 'important');
    enemy.style.setProperty('top', '0px', 'important');
    enemy.style.setProperty('width', `${rightWidth.toFixed(1)}px`, 'important');
  }
}

export function installBattlefieldSceneV3Final() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleEngine.prototype.tryTripleAttack = tryTripleAttackV3;
  BattleEngine.prototype.updateProjectiles = updateProjectilesV3;
  BattleRenderer.prototype.drawUnitSprite = function drawUnitSpriteSceneV3(
    ctx,
    engine,
    unit,
    layout,
    options,
  ) {
    return drawUnitSpriteV3(this, ctx, engine, unit, layout, options);
  };
  BattleRenderer.prototype.drawUnits = drawUnitsV3;
  BattleRenderer.prototype.drawProjectiles = drawProjectilesV3;
  BattleRenderer.prototype.drawSkillFx = drawSkillFxV3;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleSceneV3(root) {
    const result = await previousRenderBattle.call(this, root);
    root.querySelector('.game-container')?.classList.add('battle-scene-v3-final');
    configureViewportCanvas(this, root);
    alignBaseBars(root);
    requestAnimationFrame(() => {
      configureViewportCanvas(this, root);
      alignBaseBars(root);
    });
    return result;
  };

  const previousFit = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleSceneV3(root) {
    const result = previousFit.call(this, root);
    configureViewportCanvas(this, root);
    alignBaseBars(root);
    return result;
  };

  const previousSyncHud = BattleView.prototype.syncHud;
  BattleView.prototype.syncHud = function syncBattleSceneV3(root) {
    const result = previousSyncHud.call(this, root);
    alignBaseBars(root);
    return result;
  };

  window.__verifyBattlefieldSceneV3 = () => {
    const canvas = document.querySelector('#battle-canvas.battle-canvas-viewport-v3');
    const renderer = document.querySelector('.battle-scene-v3-final')?.__battleView?.renderer;
    return {
      enabled: Boolean(canvas),
      canvasRect: canvas?.getBoundingClientRect?.() ?? null,
      intrinsic: canvas ? `${canvas.width}x${canvas.height}` : null,
      viewportPadding: canvas?.dataset.viewportPadding ?? null,
      tripleRows: Array.from({ length: LANES }, (_, lane) => tripleRows(lane)),
      unitScales: { normal: NORMAL_SCALE, oversized: LARGE_SCALE, undersized: SMALL_SCALE },
      visualAudit: renderer?._v3VisualAudit ?? [],
    };
  };

  // Keep the original size-calibration contract available to browser regressions
  // while the V3 renderer remains the sole owner of the actual scale rules.
  window.__verifyBattlefieldUnitSizeFinal = () => {
    const sourceLaneFactors = [0.82, 1, 1, 1, 1];
    const groupNames = {
      normal: 'normal',
      large: 'oversized',
      small: 'undersized',
    };
    const targetFactors = {
      normal: NORMAL_SCALE,
      oversized: LARGE_SCALE,
      undersized: SMALL_SCALE,
    };
    const names = [
      '花生射手',
      '未列出的普通卡',
      '黑铁土豆雷',
      '飞行忍者',
      '三头仙人掌',
      '火龙',
    ];
    const samples = names.map((name) => {
      const internalGroup = unitScaleGroup({ name });
      const group = groupNames[internalGroup] ?? 'normal';
      const targetFactor = targetFactors[group];
      return {
        name,
        group,
        targetFactor,
        scaleByLane: sourceLaneFactors.map((sourceFactor, lane) => ({
          lane,
          sourceFactor,
          drawScale: scaleForUnit({ name, lane }, { flying: false }),
          effectiveFactor: sourceFactor * scaleForUnit({ name, lane }, { flying: false }),
        })),
      };
    });
    return {
      enabled: true,
      sourceLaneFactors,
      targetFactors,
      samples,
    };
  };
}
