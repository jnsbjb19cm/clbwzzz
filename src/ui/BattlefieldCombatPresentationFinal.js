import { BattleRenderer } from '../battle/BattleRenderer.js';
import {
  CELL_W,
  FIELD_H,
  FIELD_W,
  cellCenterX,
  colFracToX,
  laneFracToY,
} from '../battle/BattleConfig.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldCombatPresentationFinal');
const OVERSCAN_X = 190;
const OVERSCAN_Y = 150;
const UNIT_VISUAL_SCALE = 1.78;
const HALO_VISUAL_SCALE = 1.42;
const CACTUS_BULLET_RES = new Set([4, 25]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getDisplayScale(renderer) {
  const compensateX = Number(renderer?.battleDisplayCompensation);
  return {
    x: 1,
    y: Number.isFinite(compensateX) && compensateX > 0 ? compensateX : 1,
    compensateX: Number.isFinite(compensateX) && compensateX > 0 ? compensateX : 1,
  };
}

function withVisualScale(renderer, anchorX, anchorY, visualScale, draw) {
  const ctx = renderer.ctx;
  const { compensateX } = getDisplayScale(renderer);
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.scale(compensateX * visualScale, visualScale);
  ctx.translate(-anchorX, -anchorY);
  try {
    return draw();
  } finally {
    ctx.restore();
  }
}

function configureOverscan(view, root) {
  const stage = root?.querySelector?.('.battlefield-wrap');
  const canvas = root?.querySelector?.('#battle-canvas');
  const renderer = view?.renderer;
  if (!(stage instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement) || !renderer) return;

  const stageWidth = Math.max(1, stage.clientWidth);
  const stageHeight = Math.max(1, stage.clientHeight);
  const canvasWidth = FIELD_W + OVERSCAN_X * 2;
  const canvasHeight = FIELD_H + OVERSCAN_Y * 2;
  const displayPadX = stageWidth * (OVERSCAN_X / FIELD_W);
  const displayPadY = stageHeight * (OVERSCAN_Y / FIELD_H);

  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

  renderer.fieldScale = 1;
  renderer.fieldOffsetX = OVERSCAN_X;
  renderer.fieldOffsetY = OVERSCAN_Y;

  canvas.classList.add('battle-canvas-overscan-final');
  canvas.style.setProperty('left', `${-displayPadX}px`, 'important');
  canvas.style.setProperty('top', `${-displayPadY}px`, 'important');
  canvas.style.setProperty('right', 'auto', 'important');
  canvas.style.setProperty('bottom', 'auto', 'important');
  canvas.style.setProperty('width', `${stageWidth + displayPadX * 2}px`, 'important');
  canvas.style.setProperty('height', `${stageHeight + displayPadY * 2}px`, 'important');

  canvas.dataset.overscanLogical = `${OVERSCAN_X},${OVERSCAN_Y}`;
  canvas.dataset.centralFieldDisplay = `${stageWidth.toFixed(2)}x${stageHeight.toFixed(2)}`;
}

function ensureBaseBar(slot, side) {
  if (!(slot instanceof HTMLElement)) return;
  slot.classList.add('base-hp-reference-final', side);
  slot.dataset.baseSide = side;

  if (!slot.querySelector('.base-hp-track-final')) {
    const track = document.createElement('div');
    track.className = 'base-hp-track-final';
    track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.className = 'base-hp-fill-final';
    track.append(fill);
    slot.insertBefore(track, slot.firstChild);
  }
}

function updateBaseBars(view, root) {
  const engine = view?.engine;
  if (!engine) return;

  const player = root?.querySelector?.('.base-hp-slot.player');
  const enemy = root?.querySelector?.('.base-hp-slot.enemy');
  const viewport = root?.querySelector?.('.battle-game-wrap');
  if (!(viewport instanceof HTMLElement)) return;

  if (player instanceof HTMLElement) {
    ensureBaseBar(player, 'player');
    if (player.parentElement !== viewport) viewport.append(player);
    const max = Math.max(1, Number(engine.heroMaxHp) || Number(engine.heroHp) || 1);
    const current = Math.max(0, Number(engine.heroHp) || 0);
    const ratio = clamp01(current / max);
    player.style.setProperty('--base-hp-ratio', `${ratio * 100}%`);
    const fill = player.querySelector('.base-hp-fill-final');
    if (fill instanceof HTMLElement) fill.style.width = `${(ratio * 100).toFixed(3)}%`;
    const hp = player.querySelector('.hp');
    if (hp) hp.textContent = String(Math.ceil(current));
  }

  if (enemy instanceof HTMLElement) {
    ensureBaseBar(enemy, 'enemy');
    if (enemy.parentElement !== viewport) viewport.append(enemy);
    const max = Math.max(1, Number(engine.enemyHeroMaxHp) || Number(engine.enemyHeroHp) || 1);
    const current = Math.max(0, Number(engine.enemyHeroHp) || 0);
    const ratio = clamp01(current / max);
    enemy.style.setProperty('--base-hp-ratio', `${ratio * 100}%`);
    const fill = enemy.querySelector('.base-hp-fill-final');
    if (fill instanceof HTMLElement) fill.style.width = `${(ratio * 100).toFixed(3)}%`;
    const hp = enemy.querySelector('.hp');
    if (hp) hp.textContent = String(Math.ceil(current));
  }
}

function installPresentation(view, root) {
  configureOverscan(view, root);
  updateBaseBars(view, root);
}

export function installBattlefieldCombatPresentationFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalUnitSprite = BattleRenderer.prototype.drawUnitSprite;
  BattleRenderer.prototype.drawUnitSprite = function drawLargerUndistortedUnit(
    ctx,
    engine,
    unit,
    layout,
    options,
  ) {
    if (!layout) return originalUnitSprite.call(this, ctx, engine, unit, layout, options);
    return withVisualScale(this, layout.cx, layout.footY, UNIT_VISUAL_SCALE, () =>
      originalUnitSprite.call(this, ctx, engine, unit, layout, options));
  };

  const originalUnitHalo = BattleRenderer.prototype.drawUnitHalo;
  BattleRenderer.prototype.drawUnitHalo = function drawScaledUnitHalo(ctx, unit, layout) {
    if (!layout) return originalUnitHalo.call(this, ctx, unit, layout);
    return withVisualScale(this, layout.cx, layout.footY, HALO_VISUAL_SCALE, () =>
      originalUnitHalo.call(this, ctx, unit, layout));
  };

  const originalCardFace = BattleRenderer.prototype.drawUnitCardFace;
  BattleRenderer.prototype.drawUnitCardFace = function drawScaledCardFace(ctx, unit, layout, engine) {
    if (!layout) return originalCardFace.call(this, ctx, unit, layout, engine);
    return withVisualScale(this, layout.cx, layout.footY, UNIT_VISUAL_SCALE, () =>
      originalCardFace.call(this, ctx, unit, layout, engine));
  };

  /* 基地弹道不再 clamp 到 FIELD_W 内，允许完整飞进左右基地和冰柱区域。 */
  BattleRenderer.prototype.drawProjectiles = function drawProjectilesWithOverscan(ctx, engine) {
    for (const projectile of engine.projectiles) {
      if (!projectile.launched) continue;
      const drawX = colFracToX(projectile.x);
      const drawY = laneFracToY(projectile.y, projectile.arcOffset ?? 0);
      const visualScale = projectile.trajectory === 'parabola' ? 1.28 : 1.18;

      withVisualScale(this, drawX, drawY, visualScale, () => {
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
          if (
            bulletRes != null
            && CACTUS_BULLET_RES.has(bulletRes)
            && projectile.trajectory === 'straight'
          ) {
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

        // Never draw the old round placeholder projectile. The logical
        // projectile still exists and keeps moving; rendering resumes as soon as
        // its real animation/image is ready.
      });
    }
  };

  /* 基地命中特效也使用真实基地坐标，不再向画布内缩 24px。 */
  BattleRenderer.prototype.drawImpactFx = function drawImpactFxWithOverscan(ctx, engine) {
    const tuning = new Map([
      [17, { alpha: 0.72 }],
      [54, { alpha: 0.5 }],
      [4, { scale: 0.75, slow: 1.3, alpha: 0.9 }],
      [25, { scale: 0.75, slow: 1.3, alpha: 0.9 }],
      [1, { alpha: 0.72 }],
      [18, { alpha: 0.8 }],
      [9, { slow: 0.6 }],
    ]);

    for (const effect of engine.impactFx ?? []) {
      const cx = cellCenterX(effect.col);
      const cy = laneFracToY(effect.lane, 0);
      let drawn = false;

      if (effect.res != null) {
        const pack = this.bulletAnims.get(String(effect.res));
        if (pack?.meta?.animations?.baoza) {
          const anim = pack.meta.animations.baoza;
          const rate = anim.frameRate || 12;
          const duration = Math.max(0.001, Number(anim.duration) || anim.frames.length / rate);
          let slow = 0.55;
          let size = CELL_W * 1.08;
          let alphaMultiplier = 1;
          const config = tuning.get(Number(effect.res));
          if (config?.scale) size *= config.scale;
          if (config?.slow != null) slow = config.slow;
          if (config?.alpha != null) alphaMultiplier = config.alpha;
          const playedDuration = duration / Math.max(0.0001, slow);
          const alpha = (effect.t >= playedDuration
            ? Math.max(0, 1 - (effect.t - playedDuration) / 0.12)
            : 1) * alphaMultiplier;
          withVisualScale(this, cx, cy, 1.2, () => {
            this.drawBulletAnimFrame(
              ctx,
              pack,
              'baoza',
              cx,
              cy,
              size,
              effect.t,
              false,
              alpha,
              false,
              slow,
            );
          });
          drawn = true;
        } else {
          void this.requestBulletAnim(effect.res);
        }
      }

      if (drawn) continue;
      // Missing impact assets no longer fall back to a generated glow/ring.
      // Damage and authority state are unchanged; only the debug-looking
      // placeholder is omitted until a real source animation exists.
    }
  };

  const originalFitBattleScale = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleScaleWithCombatOverscan(root) {
    const result = originalFitBattleScale.call(this, root);
    configureOverscan(this, root);
    updateBaseBars(this, root);
    return result;
  };

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithCombatPresentation(root) {
    const result = await originalRenderBattle.call(this, root);
    installPresentation(this, root);
    requestAnimationFrame(() => installPresentation(this, root));
    return result;
  };

  const originalSyncHud = BattleView.prototype.syncHud;
  BattleView.prototype.syncHud = function syncHudWithReferenceBaseBars(root) {
    const result = originalSyncHud.call(this, root);
    updateBaseBars(this, root);
    return result;
  };

  window.__verifyBattlefieldCombatPresentationFinal = () => {
    const canvas = document.querySelector('#battle-canvas');
    const field = document.querySelector('.battlefield-wrap');
    const player = document.querySelector('.base-hp-reference-final.player');
    const enemy = document.querySelector('.base-hp-reference-final.enemy');
    const rect = (node) => node?.getBoundingClientRect?.() ?? null;
    return {
      enabled: Boolean(canvas?.classList.contains('battle-canvas-overscan-final')),
      canvasIntrinsic: canvas ? `${canvas.width}x${canvas.height}` : null,
      canvas: rect(canvas),
      centralField: rect(field),
      playerBase: rect(player),
      enemyBase: rect(enemy),
      overscan: canvas?.dataset.overscanLogical ?? null,
      unitVisualScale: UNIT_VISUAL_SCALE,
      syntheticProjectileCircle: false,
      syntheticImpactCircle: false,
    };
  };
}
