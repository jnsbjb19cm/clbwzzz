import {
  CELL_H,
  CELL_W,
  cellCenterY,
  fracColToCenterX,
} from '../battle/BattleConfig.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleCardFeedbackFinal');
const MAX_FEEDBACK = 160;

const DURATION = Object.freeze({
  attack: 0.28,
  damage: 0.42,
  heal: 0.68,
  summon: 0.56,
  death: 0.58,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function pushFeedback(engine, kind, lane, col, extra = {}) {
  if (!engine) return null;
  engine.cardFeedbackFx ??= [];
  const fx = {
    kind,
    lane: finite(lane, 2),
    col: finite(col),
    team: extra.team ?? null,
    amount: finite(extra.amount),
    cardId: Number(extra.cardId) || 0,
    t: 0,
    bornAt: nowMs(),
    duration: Math.max(0.08, finite(extra.duration, DURATION[kind] ?? 0.45)),
  };
  engine.cardFeedbackFx.push(fx);
  if (engine.cardFeedbackFx.length > MAX_FEEDBACK) {
    engine.cardFeedbackFx.splice(0, engine.cardFeedbackFx.length - MAX_FEEDBACK);
  }
  return fx;
}

function ring(ctx, x, y, rx, ry, color, alpha, lineWidth = 3) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function glow(ctx, x, y, radius, rgb, alpha) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(2, radius));
  gradient.addColorStop(0, `rgba(${rgb},0.92)`);
  gradient.addColorStop(0.45, `rgba(${rgb},0.32)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAttack(ctx, fx, x, y, progress) {
  const direction = fx.team === 'enemy' ? -1 : 1;
  const frontX = x + direction * CELL_W * 0.28;
  const alpha = 1 - progress;
  glow(ctx, frontX, y - CELL_H * 0.08, CELL_W * (0.11 + progress * 0.09), '255,232,126', alpha);
  ring(
    ctx,
    frontX,
    y - CELL_H * 0.08,
    CELL_W * (0.08 + progress * 0.18),
    CELL_H * (0.05 + progress * 0.1),
    '#fff0a0',
    alpha * 0.86,
    2,
  );
}

function drawDamage(ctx, fx, x, y, progress) {
  const alpha = 1 - progress;
  glow(ctx, x, y - CELL_H * 0.1, CELL_W * (0.14 + progress * 0.13), '255,245,226', alpha * 0.9);
  ring(ctx, x, y, CELL_W * (0.1 + progress * 0.28), CELL_H * (0.06 + progress * 0.16), '#ff6f68', alpha, 3);
}

function drawHeal(ctx, fx, x, y, progress) {
  const alpha = 1 - progress;
  const rise = progress * CELL_H * 0.3;
  glow(ctx, x, y - rise, CELL_W * (0.15 + progress * 0.11), '93,255,137', alpha * 0.9);
  ring(ctx, x, y - rise, CELL_W * (0.12 + progress * 0.2), CELL_H * (0.06 + progress * 0.12), '#72f58e', alpha, 3);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#d8ffe1';
  ctx.font = `900 ${Math.max(15, CELL_H * 0.18)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+', x, y - rise - CELL_H * 0.04);
  ctx.restore();
}

function drawSummon(ctx, fx, x, y, progress) {
  const alpha = 1 - progress;
  ring(ctx, x, y + CELL_H * 0.2, CELL_W * (0.1 + progress * 0.38), CELL_H * (0.05 + progress * 0.16), '#7edcff', alpha, 3);
  ring(ctx, x, y + CELL_H * 0.2, CELL_W * (0.04 + progress * 0.24), CELL_H * (0.025 + progress * 0.1), '#ffffff', alpha * 0.8, 2);
}

function drawDeath(ctx, fx, x, y, progress) {
  const alpha = 1 - progress;
  ring(ctx, x, y, CELL_W * (0.12 + progress * 0.4), CELL_H * (0.08 + progress * 0.22), '#9d8da8', alpha, 4);
}

function drawFeedback(ctx, engine) {
  const time = nowMs();
  const list = (engine?.cardFeedbackFx ?? []).filter((fx) => {
    const elapsed = Math.max(0, (time - finite(fx.bornAt, time)) / 1000);
    fx.t = elapsed;
    return elapsed < finite(fx.duration, 0.4);
  });
  if (engine) engine.cardFeedbackFx = list;
  if (!list.length) return;

  for (const fx of list) {
    const progress = Math.max(0, Math.min(1, finite(fx.t) / Math.max(0.001, finite(fx.duration, 0.4))));
    const x = fracColToCenterX(finite(fx.col));
    const y = cellCenterY(Math.max(0, Math.min(4, Math.round(finite(fx.lane, 2)))));
    if (fx.kind === 'attack') drawAttack(ctx, fx, x, y, progress);
    else if (fx.kind === 'heal') drawHeal(ctx, fx, x, y, progress);
    else if (fx.kind === 'summon') drawSummon(ctx, fx, x, y, progress);
    else if (fx.kind === 'death') drawDeath(ctx, fx, x, y, progress);
    else drawDamage(ctx, fx, x, y, progress);
  }
}

function snapshotMap(snapshot) {
  return new Map((snapshot?.units ?? []).map((data) => [Number(data.uid), {
    uid: Number(data.uid),
    hp: finite(data.hp),
    attackToken: Number(data.attackToken) || 0,
    cardId: Number(data.cardId) || 0,
  }]));
}

function processAuthorityFeedback(view, snapshot) {
  if (!view.engine || !snapshot) return;
  const seq = Number(snapshot.seq) || 0;
  if (seq && seq <= (view.__cardFeedbackSeq || 0)) return;
  view.__cardFeedbackSeq = Math.max(view.__cardFeedbackSeq || 0, seq);

  const previous = view.__cardFeedbackSnapshot ?? new Map();
  const next = snapshotMap(snapshot);
  const units = new Map((view.engine.units ?? []).map((unit) => [Number(unit.__authorityUid ?? unit.uid), unit]));
  const initialized = Boolean(view.__cardFeedbackReady);

  if (initialized) {
    for (const [uid, data] of next) {
      const old = previous.get(uid);
      const unit = units.get(uid);
      if (!unit) continue;
      if (!old) {
        pushFeedback(view.engine, 'summon', unit.lane, unit.col, {
          team: unit.team,
          cardId: data.cardId,
        });
        continue;
      }
      if (data.attackToken && data.attackToken !== old.attackToken) {
        pushFeedback(view.engine, 'attack', unit.lane, unit.col, {
          team: unit.team,
          cardId: data.cardId,
        });
      }
      const delta = Math.round((data.hp - old.hp) * 10) / 10;
      if (delta !== 0) {
        pushFeedback(view.engine, delta > 0 ? 'heal' : 'damage', unit.lane, unit.col, {
          team: unit.team,
          amount: delta,
          cardId: data.cardId,
        });
      }
    }

    for (const [uid, old] of previous) {
      if (next.has(uid)) continue;
      const unit = units.get(uid);
      pushFeedback(view.engine, 'death', unit?.lane ?? 2, unit?.col ?? 5.5, {
        cardId: old.cardId,
      });
    }
  }

  view.__cardFeedbackSnapshot = next;
  view.__cardFeedbackReady = true;
}

function installForView(view) {
  if (!view.pvp || view.__cardFeedbackInstalled) return;
  view.__cardFeedbackInstalled = true;
  if (view.pvpSocket?.on) {
    view.__cardFeedbackSnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      queueMicrotask(() => processAuthorityFeedback(view, snapshot));
    });
    view.__cardFeedbackFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      queueMicrotask(() => processAuthorityFeedback(view, snapshot));
    });
  }
  queueMicrotask(() => processAuthorityFeedback(view, view.__pvpLatestSnapshot));
}

function cleanupForView(view) {
  view.__cardFeedbackSnapshotUnsub?.();
  view.__cardFeedbackFinishedUnsub?.();
  view.__cardFeedbackSnapshotUnsub = null;
  view.__cardFeedbackFinishedUnsub = null;
  view.__cardFeedbackInstalled = false;
  view.__cardFeedbackReady = false;
  view.__cardFeedbackSnapshot = null;
  view.__cardFeedbackSeq = 0;
}

export function installBattleCardFeedbackFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousSpawnFloat = BattleEngine.prototype.spawnFloat;
  BattleEngine.prototype.spawnFloat = function spawnFloatWithCardFeedback(lane, col, amount) {
    const result = previousSpawnFloat.call(this, lane, col, amount);
    pushFeedback(this, Number(amount) > 0 ? 'heal' : 'damage', lane, col, { amount });
    return result;
  };

  const previousUpdateFx = BattleEngine.prototype.updateFx;
  BattleEngine.prototype.updateFx = function updateFxWithCardFeedback(dt) {
    const result = previousUpdateFx.call(this, dt);
    const time = nowMs();
    this.cardFeedbackFx = (this.cardFeedbackFx ?? []).filter((fx) => {
      if (!Number.isFinite(Number(fx.bornAt))) {
        fx.t = finite(fx.t) + Math.max(0, finite(dt));
        return fx.t < fx.duration;
      }
      fx.t = Math.max(0, (time - fx.bornAt) / 1000);
      return fx.t < fx.duration;
    });
    return result;
  };

  const previousTriggerAttack = unitAnimPlayer.triggerAttack.bind(unitAnimPlayer);
  unitAnimPlayer.triggerAttack = function triggerAttackWithFeedback(unit, engine, ...args) {
    pushFeedback(engine, 'attack', unit?.lane, unit?.col, {
      team: unit?.team,
      cardId: unit?.cardId,
    });
    return previousTriggerAttack(unit, engine, ...args);
  };

  const previousDrawFloats = BattleRenderer.prototype.drawFloats;
  BattleRenderer.prototype.drawFloats = function drawFloatsWithCardFeedback(ctx, engine) {
    drawFeedback(ctx, engine);
    return previousDrawFloats.call(this, ctx, engine);
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithCardFeedback(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyBattleCardFeedback() {
    cleanupForView(this);
    return previousDestroy.call(this);
  };

  window.__verifyBattleCardFeedbackFinal = () => {
    const view = globalThis.__activeBattleWorldView ?? window.__pvpFixtureBattle;
    return {
      enabled: true,
      count: view?.engine?.cardFeedbackFx?.length ?? 0,
      kinds: (view?.engine?.cardFeedbackFx ?? []).map((fx) => fx.kind),
    };
  };
}
