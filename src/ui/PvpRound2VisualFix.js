import { BattleRenderer } from '../battle/BattleRenderer.js';
import {
  ENEMY_BASE_FRAC,
  FIELD_H,
  FIELD_LEFT,
  FIELD_TOP,
  FIELD_W,
  GAME_H,
  GAME_W,
  PLAYER_BASE_FRAC,
} from '../battle/BattleConfig.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import { audio } from '../core/AudioManager.js';
import { getSkillEffect } from '../core/SkillRegistry.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpRound2VisualFix');
const COLS = 12;
const FLOAT_DURATION = 1.2;
const FULL_SCREEN_SKILL_KINDS = new Set([
  'damage_all_enemies',
  'freeze_all_enemies',
  'heal_all_allies',
  'invuln_all_allies',
  'buff_atk_allies',
  'sacred_revival',
  'fatal_curse',
  'thunderstorm',
  'firebird',
]);
const ALLY_SKILL_KINDS = new Set([
  'heal_all_allies',
  'heal_hero',
  'invuln_all_allies',
  'buff_atk_allies',
  'buff_max_hp',
  'sacred_revival',
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRedPerspective(view) {
  return String(view.pvp?.team || 'blue') === 'red';
}

function localCol(view, canonicalCol) {
  const col = finite(canonicalCol);
  return isRedPerspective(view) ? COLS - 1 - col : col;
}

function localCanonicalTeam(view, canonicalTeam) {
  if (canonicalTeam === 'neutral') return 'neutral';
  if (!isRedPerspective(view)) return canonicalTeam;
  if (canonicalTeam === 'player') return 'enemy';
  if (canonicalTeam === 'enemy') return 'player';
  return canonicalTeam;
}

function pushAuthorityFloat(view, lane, col, amount) {
  const value = Math.round(finite(amount) * 10) / 10;
  if (!value || !view.engine) return;
  view.engine.__pvpAuthorityFloats ??= [];
  view.engine.__pvpAuthorityFloats.push({
    lane: finite(lane, 2),
    col: finite(col),
    amount: value,
    bornAt: performance.now(),
  });
  if (view.engine.__pvpAuthorityFloats.length > 96) {
    view.engine.__pvpAuthorityFloats.splice(0, view.engine.__pvpAuthorityFloats.length - 96);
  }
}

function snapshotUnitMap(snapshot) {
  return new Map((snapshot?.units ?? []).map((unit) => [Number(unit.uid), {
    uid: Number(unit.uid),
    cardId: Number(unit.cardId),
    hp: finite(unit.hp),
    lane: finite(unit.lane),
    col: finite(unit.col),
    team: unit.team,
    attackToken: Number(unit.attackToken) || 0,
    neutral: Boolean(unit.neutral),
  }]));
}

function playSnapshotAudio(view, previous, next, initialized) {
  if (!initialized) return;
  const engineUnits = new Map((view.engine?.units ?? []).map((unit) => [Number(unit.uid), unit]));

  for (const [uid, data] of next) {
    const old = previous.get(uid);
    const unit = engineUnits.get(uid);
    if (!old) {
      if (!data.neutral) audio.playSummon(data.cardId);
      continue;
    }
    if (data.attackToken && data.attackToken !== old.attackToken && unit) {
      audio.playAttack(data.cardId, unit);
    }
  }

  for (const [uid, data] of previous) {
    if (!next.has(uid) && !data.neutral) audio.playDeath(data.cardId);
  }
}

function applySnapshotDeltas(view, snapshot) {
  if (!view.engine || !snapshot) return;
  const previous = view.__pvpRound2UnitState ?? new Map();
  const next = snapshotUnitMap(snapshot);
  const initialized = Boolean(view.__pvpRound2SnapshotReady);

  if (initialized) {
    for (const [uid, data] of next) {
      const old = previous.get(uid);
      if (!old) continue;
      const delta = Math.round((data.hp - old.hp) * 10) / 10;
      if (delta) pushAuthorityFloat(view, data.lane, localCol(view, data.col), delta);
    }

    const ownTeam = String(view.pvp?.team || 'blue');
    const enemyTeam = ownTeam === 'red' ? 'blue' : 'red';
    const oldBases = view.__pvpRound2BaseHp ?? {};
    const ownHp = finite(snapshot.heroHp?.[ownTeam]);
    const enemyHp = finite(snapshot.heroHp?.[enemyTeam]);
    if (Number.isFinite(oldBases.own)) {
      const delta = Math.round((ownHp - oldBases.own) * 10) / 10;
      if (delta) pushAuthorityFloat(view, 2, PLAYER_BASE_FRAC, delta);
    }
    if (Number.isFinite(oldBases.enemy)) {
      const delta = Math.round((enemyHp - oldBases.enemy) * 10) / 10;
      if (delta) pushAuthorityFloat(view, 2, ENEMY_BASE_FRAC, delta);
    }
    view.__pvpRound2BaseHp = { own: ownHp, enemy: enemyHp };
  } else {
    const ownTeam = String(view.pvp?.team || 'blue');
    const enemyTeam = ownTeam === 'red' ? 'blue' : 'red';
    view.__pvpRound2BaseHp = {
      own: finite(snapshot.heroHp?.[ownTeam]),
      enemy: finite(snapshot.heroHp?.[enemyTeam]),
    };
  }

  playSnapshotAudio(view, previous, next, initialized);
  view.__pvpRound2UnitState = next;
  view.__pvpRound2SnapshotReady = true;
}

function eventId(event) {
  return String(event?.id ?? `${event?.team}:${event?.skillId}:${event?.startedAt ?? event?.applyAt ?? 0}`);
}

function findFxForEvent(view, event) {
  const id = eventId(event);
  const effects = view.engine?.skillFx ?? view.engine?.skillEffects ?? [];
  return [...effects].reverse().find((fx) =>
    String(fx.pvpEventId ?? '') === id || (
      Number(fx.skillId) === Number(event.skillId)
      && !fx.__pvpRound2AnchorChecked
    ));
}

function anchorSkillEffectToCard(view, event) {
  if (!event?.target || !view.engine) return;
  const fx = findFxForEvent(view, event);
  if (!fx) return;
  fx.__pvpRound2AnchorChecked = true;
  if (fx.fullScreen || FULL_SCREEN_SKILL_KINDS.has(fx.kind)) return;

  const effect = getSkillEffect(Number(event.skillId));
  const casterIsLocal = String(event.team || 'blue') === String(view.pvp?.team || 'blue');
  const casterTeam = casterIsLocal ? 'player' : 'enemy';
  const desiredTeam = ALLY_SKILL_KINDS.has(effect?.kind)
    ? casterTeam
    : (casterTeam === 'player' ? 'enemy' : 'player');
  const lane = finite(event.target.lane);
  const col = localCol(view, event.target.col);
  const candidates = (view.engine.units ?? [])
    .filter((unit) => unit.alive && unit.team === desiredTeam)
    .map((unit) => ({
      unit,
      distance: Math.abs(finite(unit.lane) - lane) + Math.abs(finite(unit.col) - col),
    }))
    .sort((a, b) => a.distance - b.distance);
  const target = candidates[0]?.distance <= 1.1 ? candidates[0].unit : null;
  if (target) {
    fx.lane = target.lane;
    fx.col = target.col;
    fx.__pvpAnchoredUnitUid = target.uid;
  }
}

function processVisualEvents(view, events = []) {
  for (const event of events) anchorSkillEffectToCard(view, event);
}

function alignPvpBattlefield(view, root) {
  if (!view?.pvp) return;
  const wrap = root?.querySelector?.('.battle-game-wrap');
  const field = root?.querySelector?.('.battlefield-wrap');
  if (!(wrap instanceof HTMLElement) || !(field instanceof HTMLElement)) return;

  const width = Math.max(1, wrap.clientWidth || window.innerWidth);
  const height = Math.max(1, wrap.clientHeight || window.innerHeight);
  const scale = Math.min(width / GAME_W, height / GAME_H);
  const gameLeft = (width - GAME_W * scale) / 2;
  const gameTop = (height - GAME_H * scale) / 2;

  field.style.setProperty('inset', 'auto', 'important');
  field.style.setProperty('left', `${gameLeft + FIELD_LEFT * scale}px`, 'important');
  field.style.setProperty('top', `${gameTop + FIELD_TOP * scale}px`, 'important');
  field.style.setProperty('right', 'auto', 'important');
  field.style.setProperty('bottom', 'auto', 'important');
  field.style.setProperty('width', `${FIELD_W * scale}px`, 'important');
  field.style.setProperty('height', `${FIELD_H * scale}px`, 'important');
  field.dataset.pvpRound2Aligned = 'true';
  field.dataset.pvpRound2Scale = scale.toFixed(5);
}

function installForView(view) {
  if (!view.pvp || view.__pvpRound2VisualInstalled) return;
  view.__pvpRound2VisualInstalled = true;

  if (view.pvpSocket?.on) {
    view.__pvpRound2SnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      queueMicrotask(() => {
        applySnapshotDeltas(view, snapshot);
        processVisualEvents(view, snapshot.visualEvents ?? []);
      });
    });
    view.__pvpRound2FinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      queueMicrotask(() => {
        applySnapshotDeltas(view, snapshot);
        processVisualEvents(view, snapshot.visualEvents ?? []);
      });
    });
    view.__pvpRound2SkillUnsub = view.pvpSocket.on('pvp:authority:skill-cast', (event) => {
      queueMicrotask(() => anchorSkillEffectToCard(view, event));
    });
  }

  requestAnimationFrame(() => {
    alignPvpBattlefield(view, view.viewRoot);
    view.fitBattleScale?.(view.viewRoot);
    applySnapshotDeltas(view, view.__pvpLatestSnapshot);
  });
}

function cleanupForView(view) {
  view.__pvpRound2SnapshotUnsub?.();
  view.__pvpRound2FinishedUnsub?.();
  view.__pvpRound2SkillUnsub?.();
  view.__pvpRound2SnapshotUnsub = null;
  view.__pvpRound2FinishedUnsub = null;
  view.__pvpRound2SkillUnsub = null;
  view.__pvpRound2VisualInstalled = false;
}

export function installPvpRound2VisualFix() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDrawFloats = BattleRenderer.prototype.drawFloats;
  BattleRenderer.prototype.drawFloats = function drawAuthorityFloats(ctx, engine) {
    const original = engine.floats ?? [];
    const now = performance.now();
    const queue = (engine.__pvpAuthorityFloats ?? []).filter(
      (item) => (now - item.bornAt) / 1000 < FLOAT_DURATION,
    );
    engine.__pvpAuthorityFloats = queue;
    const visual = queue.map((item) => {
      const age = Math.max(0, (now - item.bornAt) / 1000);
      return {
        lane: item.lane,
        col: item.col,
        amount: item.amount,
        life: Math.max(0, FLOAT_DURATION - age),
        y: -age * 0.8,
      };
    });
    engine.floats = [...original, ...visual];
    try {
      return previousDrawFloats.call(this, ctx, engine);
    } finally {
      engine.floats = original;
    }
  };

  const previousDrawSkillFx = BattleRenderer.prototype.drawSkillFx;
  BattleRenderer.prototype.drawSkillFx = function drawFullScreenAtOnce(ctx, engine) {
    const list = engine.skillFx ?? engine.skillEffects ?? [];
    const directional = list.filter((fx) => fx.pvpDirection && (
      fx.fullScreen || FULL_SCREEN_SKILL_KINDS.has(fx.kind)
    ));
    if (!directional.length) return previousDrawSkillFx.call(this, ctx, engine);

    const directionalSet = new Set(directional);
    const originalSkillFx = engine.skillFx;
    const originalSkillEffects = engine.skillEffects;
    const normal = list.filter((fx) => !directionalSet.has(fx));
    engine.skillFx = normal;
    engine.skillEffects = normal;
    try {
      previousDrawSkillFx.call(this, ctx, engine);
    } finally {
      engine.skillFx = originalSkillFx;
      engine.skillEffects = originalSkillEffects;
    }

    for (const fx of directional) {
      const progress = Math.max(0, Math.min(1, finite(fx.t) / Math.max(0.001, finite(fx.duration, 1))));
      const remain = 1 - progress;
      const alpha = fx.t < 0.05 ? fx.t / 0.05 : Math.min(1, remain / 0.15);
      ctx.save();
      if (fx.pvpDirection < 0) {
        ctx.translate(FIELD_W, 0);
        ctx.scale(-1, 1);
      }
      // 全屏技能从第一帧起覆盖完整战场；方向只负责对手视角的水平镜像。
      skillAnimPlayer.drawCover(
        ctx,
        fx.skillId,
        0,
        0,
        FIELD_W,
        FIELD_H,
        fx.t,
        alpha * 0.92,
        fx.loop === true,
      );
      ctx.restore();
    }
  };

  const previousFitBattleScale = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitPvpRound2Coordinates(root) {
    if (this.pvp) alignPvpBattlefield(this, root);
    const result = previousFitBattleScale.call(this, root);
    if (this.pvp) alignPvpBattlefield(this, root);
    return result;
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderPvpRound2Visuals(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpRound2Visuals() {
    cleanupForView(this);
    return previousDestroy.call(this);
  };

  window.__verifyPvpRound2VisualFix = () => {
    const battle = window.__pvpFixtureBattle;
    const field = document.querySelector('.pvp-wilderness-battle .battlefield-wrap');
    return {
      enabled: true,
      floatCount: battle?.engine?.__pvpAuthorityFloats?.length ?? 0,
      aligned: field?.dataset.pvpRound2Aligned === 'true',
      scale: Number(field?.dataset.pvpRound2Scale || 0),
      fullScreenRevealMask: false,
      simultaneousFullScreen: true,
    };
  };
}
