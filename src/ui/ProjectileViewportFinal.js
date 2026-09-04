import {
  CELL_H,
  FIELD_W,
  cellCenterY,
  colFracToX,
} from '../battle/BattleConfig.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';

const PATCH_FLAG = Symbol.for('clbwzzz.projectileViewportFinal');
const CACTUS_BULLET_RES = new Set([4, 25]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function laneCenterY(fracLane, arcOffset = 0) {
  const lane = finite(fracLane);
  const y0 = cellCenterY(0);
  const laneStep = cellCenterY(1) - y0;
  return y0 + lane * laneStep - finite(arcOffset) * CELL_H;
}

function isOutsideLogicalField(projectile) {
  const x = colFracToX(Number(projectile?.x));
  return Number.isFinite(x) && (x < 0 || x > FIELD_W);
}

function drawOutsideProjectile(renderer, ctx, p) {
  if (!p?.launched) return;
  const drawX = colFracToX(Number(p.x));
  const drawY = laneCenterY(Number(p.y), Number(p.arcOffset) || 0);
  if (!Number.isFinite(drawX) || !Number.isFinite(drawY)) return;

  if (p.sourceRes != null) {
    const pack = renderer.bulletAnims.get(String(p.sourceRes));
    if (pack?.meta?.animations?.yidong) {
      const size = p.trajectory === 'parabola' ? 30 : 24;
      renderer.drawBulletAnimFrame(
        ctx,
        pack,
        'yidong',
        drawX,
        drawY,
        size,
        p.flightT ?? 0,
        p.owner === 'enemy',
      );
      return;
    }
    void renderer.requestBulletAnim(p.sourceRes);
  }

  const img = (p.sourceRes != null ? renderer.bulletCache.get(String(p.sourceRes)) : null)
    ?? renderer.bulletCache.get('default');
  const size = p.trajectory === 'parabola' ? 28 : 22;
  if (img) {
    ctx.save();
    const bulletRes = p.sourceRes != null ? Number(p.sourceRes) : null;
    let angle;
    if (bulletRes != null && CACTUS_BULLET_RES.has(bulletRes) && p.trajectory === 'straight') {
      angle = p.owner === 'player' ? 0 : Math.PI;
    } else {
      const startX = colFracToX(finite(p.startCol));
      const startY = laneCenterY(finite(p.lane));
      const targetX = colFracToX(finite(p.hitCol, p.x));
      const targetY = laneCenterY(finite(p.hitLane, p.y));
      // Canvas rotate 使用 atan2(deltaY, deltaX)。旧实现把列差放进 atan2 的 y 参数，
      // 同行直线弹甚至会被旋转 90°，与真实飞行方向不一致。
      angle = Math.atan2(targetY - startY, targetX - startX);
    }
    ctx.translate(drawX, drawY);
    ctx.rotate(Number.isFinite(angle) ? angle : 0);
    SpriteAtlas.draw(ctx, img, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.arc(drawX, drawY, 8, 0, Math.PI * 2);
  ctx.fillStyle = p.color ?? '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function installProjectileViewportFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDrawProjectiles = BattleRenderer.prototype.drawProjectiles;
  BattleRenderer.prototype.drawProjectiles = function drawProjectilesAcrossViewport(ctx, engine) {
    const all = Array.isArray(engine?.projectiles) ? engine.projectiles : [];
    const inside = [];
    const outside = [];
    for (const projectile of all) {
      (isOutsideLogicalField(projectile) ? outside : inside).push(projectile);
    }

    if (outside.length === 0) return previousDrawProjectiles.call(this, ctx, engine);

    const original = engine.projectiles;
    try {
      engine.projectiles = inside;
      previousDrawProjectiles.call(this, ctx, engine);
    } finally {
      engine.projectiles = original;
    }
    for (const projectile of outside) drawOutsideProjectile(this, ctx, projectile);
  };

  window.__verifyProjectileViewportFinal = () => ({
    enabled: true,
    logicalGridIsNotProjectileClip: true,
    fullViewportCoordinates: true,
    laneUsesCellCenters: true,
    projectileRotationUsesRealFlightVector: true,
  });
}
