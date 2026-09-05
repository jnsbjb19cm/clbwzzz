import {
  CELL_W,
  COLS,
  cellCenterX,
  cellCenterY,
} from '../battle/BattleConfig.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpImpactFxFinal');
const MAX_SEEN_IMPACTS = 512;

function localImpact(view, event) {
  const col = Number(event?.col);
  return {
    id: Number(event?.id),
    lane: Number(event?.lane),
    col: String(view?.pvp?.team || 'blue') === 'red' ? COLS - 1 - col : col,
    amount: Number(event?.amount) || 0,
    res: event?.res != null ? String(event.res) : null,
    t: Math.max(0, Number(event?.t) || 0),
    life: Math.max(0, Number(event?.life) || 0),
  };
}

function rememberImpact(view, id) {
  view.__pvpSeenImpactIds ??= new Set();
  view.__pvpSeenImpactOrder ??= [];
  if (view.__pvpSeenImpactIds.has(id)) return false;
  view.__pvpSeenImpactIds.add(id);
  view.__pvpSeenImpactOrder.push(id);
  while (view.__pvpSeenImpactOrder.length > MAX_SEEN_IMPACTS) {
    const oldest = view.__pvpSeenImpactOrder.shift();
    view.__pvpSeenImpactIds.delete(oldest);
  }
  return true;
}

function consumeSnapshotImpacts(view, snapshot) {
  if (!view?.pvp || !view.engine || !Array.isArray(snapshot?.impactEvents)) return;
  for (const raw of snapshot.impactEvents) {
    const event = localImpact(view, raw);
    if (!Number.isFinite(event.id) || !rememberImpact(view, event.id)) continue;
    if (!Number.isFinite(event.lane) || !Number.isFinite(event.col)) continue;
    view.engine.spawnImpactFx(event.lane, event.col, event.amount, event.res);
    const fx = view.engine.impactFx.at(-1);
    if (fx) {
      fx.t = event.t;
      if (event.life > 0) fx.life = event.life;
      fx.__authorityImpactId = event.id;
    }
  }
}

function installImpactSubscription(view) {
  if (!view?.pvp || !view.pvpSocket?.on || view.__pvpImpactFxInstalled) return;
  view.__pvpImpactFxInstalled = true;
  view.__pvpImpactSnapshotUnsub = view.pvpSocket.on(
    'pvp:authority:snapshot',
    (snapshot) => consumeSnapshotImpacts(view, snapshot),
  );
  view.__pvpImpactFinishedUnsub = view.pvpSocket.on(
    'pvp:authority:finished',
    (snapshot) => consumeSnapshotImpacts(view, snapshot),
  );
  consumeSnapshotImpacts(view, view.__pvpLatestSnapshot);
}

function cleanupImpactSubscription(view) {
  view.__pvpImpactSnapshotUnsub?.();
  view.__pvpImpactFinishedUnsub?.();
  view.__pvpImpactSnapshotUnsub = null;
  view.__pvpImpactFinishedUnsub = null;
  view.__pvpImpactFxInstalled = false;
  view.__pvpSeenImpactIds?.clear?.();
  view.__pvpSeenImpactIds = null;
  view.__pvpSeenImpactOrder = null;
}

function drawOutsideGridImpact(renderer, ctx, fx) {
  const cx = cellCenterX(Number(fx.col));
  const cy = cellCenterY(Number(fx.lane));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

  if (fx.res != null) {
    const pack = renderer.bulletAnims.get(String(fx.res));
    if (pack?.meta?.animations?.baoza) {
      const anim = pack.meta.animations.baoza;
      const rate = Number(anim.frameRate) || 12;
      const duration = Math.max(0.001, Number(anim.duration) || anim.frames.length / rate);
      const slow = 0.55;
      const played = Math.max(0, Number(fx.t) || 0) * slow;
      const alpha = played >= duration
        ? Math.max(0, 1 - (played - duration) / 0.12)
        : 1;
      renderer.drawBulletAnimFrame(
        ctx,
        pack,
        'baoza',
        cx,
        cy,
        CELL_W * 1.05,
        Number(fx.t) || 0,
        false,
        alpha,
        false,
        slow,
      );
      return;
    }
    void renderer.requestBulletAnim(fx.res);
  }

  // No synthetic fallback ring. If the real source impact animation is not
  // available yet, omit this cosmetic frame rather than exposing a debug-like
  // HIT circle during normal PVP/base attacks.
}

export function installPvpImpactFxFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithAuthorityImpacts(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installImpactSubscription(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyAuthorityImpacts() {
    cleanupImpactSubscription(this);
    return previousDestroy.call(this);
  };

  /*
   * 原 BattleRenderer.drawImpactFx 对所有命中都 Math.min(..., FIELD_W - 24)，
   * 所以基地位于 12x5 网格外时爆炸被硬拉回网格右边缘。网格内沿用原版渲染；
   * 网格外只接管那一小部分 impact，直接使用真实 frac col，在全屏 Canvas 上绘制。
   */
  const previousDrawImpactFx = BattleRenderer.prototype.drawImpactFx;
  BattleRenderer.prototype.drawImpactFx = function drawImpactFxAcrossViewport(ctx, engine) {
    const all = engine?.impactFx ?? [];
    const inside = [];
    const outside = [];
    for (const fx of all) {
      const col = Number(fx?.col);
      (Number.isFinite(col) && col >= 0 && col <= COLS - 1 ? inside : outside).push(fx);
    }

    if (outside.length === 0) return previousDrawImpactFx.call(this, ctx, engine);

    const original = engine.impactFx;
    try {
      engine.impactFx = inside;
      previousDrawImpactFx.call(this, ctx, engine);
    } finally {
      engine.impactFx = original;
    }
    for (const fx of outside) drawOutsideGridImpact(this, ctx, fx);
  };

  window.__verifyPvpImpactFxFinal = () => ({
    enabled: true,
    authorityEventSync: true,
    impactDedupe: true,
    fullViewportBaseImpact: true,
    syntheticFallbackRing: false,
  });
}
