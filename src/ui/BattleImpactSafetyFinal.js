import { CELL_W, LANES, cellCenterY, colFracToX } from '../battle/BattleConfig.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleImpactSafetyFinal');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function animationHasSafeFrameMargin(pack, name, margin = 3) {
  const meta = pack?.meta;
  const anim = meta?.animations?.[name];
  if (!meta || !anim?.frames?.length) return false;
  const maxX = finite(meta.frameW, 0) - 1;
  const maxY = finite(meta.frameH, 0) - 1;
  return anim.frames.every((frame) => {
    const b = frame?.bounds;
    if (!b) return true;
    return b.left > margin
      && b.top > margin
      && b.right < maxX - margin
      && b.bottom < maxY - margin;
  });
}

export function installBattleImpactSafetyFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleRenderer.prototype.drawImpactFx = function drawSafeImpactFx(ctx, engine) {
    this._impactSafetyAudit = [];
    for (const fx of engine?.impactFx ?? []) {
      const cx = colFracToX(finite(fx.col));
      const cy = cellCenterY(clamp(Math.round(finite(fx.lane)), 0, LANES - 1));
      let usedSourceAnimation = false;
      let unsafeSourceAnimation = false;

      if (fx.res != null) {
        const pack = this.bulletAnims.get(String(fx.res));
        const hasImpact = Boolean(pack?.meta?.animations?.baoza);
        const safe = hasImpact && animationHasSafeFrameMargin(pack, 'baoza');
        unsafeSourceAnimation = hasImpact && !safe;
        if (safe) {
          const anim = pack.meta.animations.baoza;
          const rate = Number(anim.frameRate) || 12;
          const duration = Math.max(0.001, Number(anim.duration) || anim.frames.length / rate);
          const slow = 0.55;
          const played = Math.max(0, finite(fx.t)) * slow;
          const alpha = played >= duration
            ? Math.max(0, 1 - (played - duration) / 0.12)
            : 1;
          this.drawBulletAnimFrame(
            ctx,
            pack,
            'baoza',
            cx,
            cy,
            CELL_W * 1.05,
            finite(fx.t),
            false,
            alpha,
            false,
            slow,
          );
          usedSourceAnimation = true;
        } else if (!pack) {
          void this.requestBulletAnim(fx.res);
        }
      }

      // Do not synthesize a fallback ctx.arc/stroke ring when the source impact
      // animation is missing or unsafe. That ring was a diagnostic-looking HIT
      // marker visible during normal attacks and must never appear in gameplay.
      this._impactSafetyAudit.push({
        res: fx.res != null ? Number(fx.res) : null,
        col: fx.col,
        lane: fx.lane,
        usedSourceAnimation,
        unsafeSourceAnimation,
        fullViewportX: cx,
      });
    }
  };

  globalThis.__verifyBattleImpactSafetyFinal = () => ({
    enabled: true,
    rejectsEdgeClippedBaoza: true,
    runtime: document.querySelector('.battlefield-wrap')?.__battleView?.renderer?._impactSafetyAudit
      ?? document.querySelector('.game-container')?.__battleView?.renderer?._impactSafetyAudit
      ?? [],
  });
}
