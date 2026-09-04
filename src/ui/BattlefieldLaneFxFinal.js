import {
  CELL_H,
  CELL_W,
  GRID_GAP,
  LANES,
  cellCenterY,
  colFracToX,
} from '../battle/BattleConfig.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldLaneFxFinal');
const CACTUS_BULLET_RES = new Set([4, 25]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** 整数路线必须落在格子垂直中心；小数路线只用于跨路短暂插值。 */
function laneCenterY(fracLane, arcOffset = 0) {
  const value = Number.isFinite(Number(fracLane)) ? Number(fracLane) : 0;
  const baseLane = clamp(Math.floor(value), 0, LANES - 1);
  const fraction = clamp(value - baseLane, 0, 1);
  return cellCenterY(baseLane)
    + fraction * (CELL_H + GRID_GAP)
    - (Number(arcOffset) || 0) * CELL_H;
}

function projectileVisualLane(projectile) {
  /*
   * Projectile.update() 的 y 才是“从射手本行到目标行”的真实插值。
   * 旧 visualLane 在三头仙人掌创建子弹后被直接写成目标行，会让子弹一出生
   * 就跳到其他行，因此这里只把它作为最后兼容回退。
   */
  if (Number.isFinite(Number(projectile?.y))) return Number(projectile.y);
  if (Number.isFinite(Number(projectile?.lane))) return Number(projectile.lane);
  if (Number.isFinite(Number(projectile?.visualLane))) return Number(projectile.visualLane);
  if (Number.isFinite(Number(projectile?.hitLane))) return Number(projectile.hitLane);
  return 0;
}

function displayCompensation(renderer) {
  const canvas = renderer?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  if (!canvas || !rect?.width || !rect?.height || !canvas.width || !canvas.height) return 1;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  return scaleX > 0 ? scaleY / scaleX : 1;
}

function withUndistortedScale(renderer, x, y, scale, draw) {
  const ctx = renderer.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(displayCompensation(renderer) * scale, scale);
  ctx.translate(-x, -y);
  try {
    return draw();
  } finally {
    ctx.restore();
  }
}

function drawProjectilesCentered(ctx, engine) {
  this._laneProjectileAudit = [];
  for (const projectile of engine.projectiles ?? []) {
    if (!projectile.launched) continue;
    const drawX = colFracToX(projectile.x);
    const visualLane = projectileVisualLane(projectile);
    const drawY = laneCenterY(visualLane, projectile.arcOffset ?? 0);
    const sourceY = laneCenterY(projectile.sourceLane ?? projectile.lane, 0);
    const targetY = laneCenterY(projectile.hitLane ?? projectile.lane, 0);
    const visualScale = projectile.trajectory === 'parabola' ? 1.24 : 1.14;

    this._laneProjectileAudit.push({
      id: projectile.id,
      sourceRes: projectile.sourceRes,
      sourceLane: projectile.sourceLane ?? projectile.lane,
      lane: projectile.lane,
      hitLane: projectile.hitLane,
      storedVisualLane: projectile.visualLane,
      visualLane,
      progress: projectile.progress ?? 0,
      drawY,
      sourceY,
      targetY,
      arcOffset: projectile.arcOffset ?? 0,
    });

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
              (Number(projectile.hitLane) - Number(projectile.lane)) * (CELL_H + GRID_GAP),
              (Number(projectile.hitCol) - Number(projectile.startCol)) * (CELL_W + GRID_GAP),
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

export function installBattlefieldLaneFxFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleRenderer.prototype.drawProjectiles = drawProjectilesCentered;

  const previousFireProjectile = BattleEngine.prototype.fireProjectile;
  BattleEngine.prototype.fireProjectile = function fireProjectileFromUnitCenter(
    unit,
    target,
    damage,
    opts = {},
  ) {
    const before = this.projectiles.length;
    const result = previousFireProjectile.call(this, unit, target, damage, opts);
    const projectile = this.projectiles[before] ?? this.projectiles.at(-1);
    if (projectile) {
      projectile.sourceLane = Number(unit?.lane) || 0;
      projectile.sourceCol = Number(unit?.col) || 0;
      projectile.lane = projectile.sourceLane;
      projectile.y = projectile.sourceLane;
      projectile.x = projectile.sourceCol;
    }
    return result;
  };

  const previousSpawnImpactFx = BattleEngine.prototype.spawnImpactFx;
  BattleEngine.prototype.spawnImpactFx = function spawnImpactFxOnHitLane(
    lane,
    col,
    amount,
    res,
  ) {
    const hitLane = clamp(Math.round(Number(lane) || 0), 0, LANES - 1);
    const hitCol = Number.isFinite(Number(col)) ? Number(col) : 0;
    return previousSpawnImpactFx.call(this, hitLane, hitCol, amount, res);
  };

  window.__verifyBattlefieldLaneFxFinal = () => {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView;
    const renderer = view?.renderer;
    return {
      enabled: true,
      laneCenters: Array.from({ length: LANES }, (_, lane) => laneCenterY(lane, 0)),
      visualLanePriorityProbe: projectileVisualLane({
        y: 2,
        lane: 2,
        visualLane: 0,
        hitLane: 0,
      }),
      projectiles: renderer?._laneProjectileAudit ?? [],
      impacts: view?.engine?.impactFx?.map((fx) => ({ lane: fx.lane, col: fx.col })) ?? [],
    };
  };
}
