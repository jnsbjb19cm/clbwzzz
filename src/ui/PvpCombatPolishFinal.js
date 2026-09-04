import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import {
  CELL_W,
  FIELD_H,
  FIELD_W,
} from '../battle/BattleConfig.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import { audio } from '../core/AudioManager.js';
import { getSkillEffect } from '../core/SkillRegistry.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpCombatPolishFinal');
const COLS = 12;
const MAX_EXTRAPOLATION = 0.12;
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

function localTeam(view, canonicalTeam) {
  if (canonicalTeam === 'neutral') return 'neutral';
  if (!isRedPerspective(view)) return canonicalTeam;
  if (canonicalTeam === 'player') return 'enemy';
  if (canonicalTeam === 'enemy') return 'player';
  return canonicalTeam;
}

function localCasterDirection(view, canonicalTeam) {
  const casterTeam = canonicalTeam === 'red' ? 'red' : 'blue';
  return casterTeam === String(view.pvp?.team || 'blue') ? 1 : -1;
}

function avatarUrl(userId) {
  const seed = Math.max(1, Math.abs(Number(userId) || 1) % 20);
  return `/sprites/cards/${seed}.png`;
}

export function ensurePlayerStands(view, players = []) {
  const wrap = view.viewRoot?.querySelector?.('.battle-game-wrap');
  if (!wrap) return;
  let layer = wrap.querySelector('[data-pvp-player-stands]');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'pvp-player-stands';
    layer.dataset.pvpPlayerStands = 'true';
    wrap.append(layer);
  }

  const ownTeam = String(view.pvp?.team || 'blue');
  const normalized = Array.isArray(players) ? players : [];
  layer.innerHTML = normalized.map((player, index) => {
    const localSide = String(player.team) === ownTeam ? 'left' : 'right';
    const sameSideIndex = normalized
      .slice(0, index)
      .filter((entry) => (String(entry.team) === ownTeam ? 'left' : 'right') === localSide)
      .length;
    return `
      <div class="pvp-column-player ${localSide} slot-${Math.min(2, sameSideIndex)}" data-user-id="${Number(player.userId) || 0}">
        <img src="${avatarUrl(player.userId)}" alt="" draggable="false" />
        <span>${String(player.nickname || '玩家').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</span>
      </div>`;
  }).join('');
}

function removeBaseLabels(view) {
  view.viewRoot?.querySelectorAll?.('.base-hp-slot .label')?.forEach((label) => {
    label.textContent = '';
    label.setAttribute('aria-hidden', 'true');
  });
}

function updateAnimationFromAuthority(view, unit, data) {
  const state = data.animState || data.state || 'default';
  const previousState = unit.__pvpAuthorityAnimState;
  unit.__pvpAuthorityAnimState = state;
  const engineTime = finite(view.engine?.time);
  const until = Math.max(engineTime + 0.12, finite(data.animUntil, engineTime + 0.18));
  const attackToken = Number(data.attackToken) || 0;
  const jumpToken = Number(data.jumpToken) || 0;
  const forcedToken = Number(data.forcedToken) || 0;

  if (attackToken && attackToken !== unit.__pvpAttackToken) {
    unit.__pvpAttackToken = attackToken;
    unitAnimPlayer.resetClock(unit);
  }
  if (jumpToken && jumpToken !== unit.__pvpJumpToken) {
    unit.__pvpJumpToken = jumpToken;
    unitAnimPlayer.resetClock(unit);
  }
  if (forcedToken && forcedToken !== unit.__pvpForcedToken) {
    unit.__pvpForcedToken = forcedToken;
    unitAnimPlayer.resetClock(unit);
  }

  unit._burrowTargetCol = data.burrowTargetCol ?? null;
  unit._burrowEmerged = Boolean(data.burrowEmerged);
  unit._burrowReturning = Boolean(data.burrowReturning);
  unit._burrowFacingReversed = Boolean(data.burrowFacingReversed);
  if (state === 'underMoving' && previousState !== 'underMoving') {
    audio.playMove(unit.cardId);
  }
  if (state === 'attacking') unit._attackAnimUntil = until;
  if (state === 'jump') unit._jumpUntil = until;
  if (state === 'stun') unit.stunnedUntil = until;
  if (state === 'frozen') unit.frozenUntil = until;

  if (['underMoving', 'secondAttackStatus', 'jump', 'flying', 'attacking', 'stun'].includes(state)) {
    unit._forcedAnimState = state;
    unit._forcedAnimUntil = until;
  } else if (unit._forcedAnimUntil <= engineTime || state === 'default' || state === 'moving') {
    unit._forcedAnimState = null;
    unit._forcedAnimUntil = 0;
  }
}

function processSnapshot(view, snapshot) {
  if (!view.engine || !snapshot) return;
  const receivedAt = performance.now();
  const unitByUid = new Map((view.engine.units ?? []).map((unit) => [Number(unit.uid), unit]));
  for (const data of snapshot.units ?? []) {
    const unit = unitByUid.get(Number(data.uid));
    if (!unit) continue;
    unit.team = data.neutral ? 'neutral' : localTeam(view, data.team);
    unit.pvpNeutral = Boolean(data.neutral);
    // 中间中立柱按场景用 card.json 障碍卡（冰川=冰山1000、草地=木桩1002、黄沙=沙丘1004），名字同步
    if (data.neutral) {
      const scene = view.pvp?.mapScene
        ?? ({ '2': 'grass', '4': 'ice', '7': 'rock' }[String(view.pvp?.mapId ?? '')]);
      const neutralId = scene === 'ice' ? 1000 : scene === 'grass' ? 1002 : 1004;
      if (unit.cardId !== neutralId) {
        unit.cardId = neutralId;
        unit.res = neutralId;
        const ncard = view.db?.getById?.(neutralId);
        unit.name = ncard?.card_name ?? ncard?.name ?? unit.name;
      }
    }
    unit.__pvpNetTargetCol = localCol(view, data.col);
    unit.__pvpNetTargetLane = finite(data.lane);
    unit.__pvpNetVelocityCol = isRedPerspective(view)
      ? -finite(data.velocityCol)
      : finite(data.velocityCol);
    unit.__pvpNetVelocityLane = finite(data.velocityLane);
    unit.__pvpNetReceivedAt = receivedAt;
    updateAnimationFromAuthority(view, unit, data);
  }

  const projectileById = new Map((view.engine.projectiles ?? []).map((item) => [Number(item.id), item]));
  for (const data of snapshot.projectiles ?? []) {
    const projectile = projectileById.get(Number(data.id));
    if (!projectile) continue;
    const targetX = localCol(view, data.x ?? data.startCol);
    const targetY = finite(data.y, data.lane);
    const previousX = finite(projectile.__pvpNetTargetX, targetX);
    const previousY = finite(projectile.__pvpNetTargetY, targetY);
    const previousAt = finite(projectile.__pvpNetReceivedAt, receivedAt);
    const dt = Math.max(0.001, (receivedAt - previousAt) / 1000);
    projectile.__pvpNetVelocityX = (targetX - previousX) / dt;
    projectile.__pvpNetVelocityY = (targetY - previousY) / dt;
    projectile.__pvpNetTargetX = targetX;
    projectile.__pvpNetTargetY = targetY;
    projectile.__pvpNetReceivedAt = receivedAt;
  }

  ensurePlayerStands(view, snapshot.players);
  removeBaseLabels(view);
  consumeSnapshotSkillEvents(view, snapshot.visualEvents ?? []);
}

function advanceNetworkTargets(view, now) {
  for (const unit of view.engine?.units ?? []) {
    if (!Number.isFinite(unit.__pvpNetTargetCol)) continue;
    const elapsed = Math.min(
      MAX_EXTRAPOLATION,
      Math.max(0, (now - finite(unit.__pvpNetReceivedAt, now)) / 1000),
    );
    unit.__authorityTargetCol = unit.__pvpNetTargetCol + finite(unit.__pvpNetVelocityCol) * elapsed;
    unit.__authorityTargetLane = unit.__pvpNetTargetLane + finite(unit.__pvpNetVelocityLane) * elapsed;
  }
  for (const projectile of view.engine?.projectiles ?? []) {
    if (!Number.isFinite(projectile.__pvpNetTargetX)) continue;
    const elapsed = Math.min(
      MAX_EXTRAPOLATION,
      Math.max(0, (now - finite(projectile.__pvpNetReceivedAt, now)) / 1000),
    );
    projectile.__authorityTargetX = projectile.__pvpNetTargetX + finite(projectile.__pvpNetVelocityX) * elapsed;
    projectile.__authorityTargetY = projectile.__pvpNetTargetY + finite(projectile.__pvpNetVelocityY) * elapsed;
  }
}

function startNetworkTargetLoop(view) {
  if (view.__pvpCombatPolishRaf) cancelAnimationFrame(view.__pvpCombatPolishRaf);
  const tick = (now) => {
    if (!view.__pvpAuthorityActive || !view.engine) {
      view.__pvpCombatPolishRaf = null;
      return;
    }
    advanceNetworkTargets(view, now);
    view.__pvpCombatPolishRaf = requestAnimationFrame(tick);
  };
  view.__pvpCombatPolishRaf = requestAnimationFrame(tick);
}

function visualEventId(event) {
  return String(event?.id ?? `${event?.team}:${event?.skillId}:${event?.startedAt ?? event?.applyAt ?? 0}`);
}

function rememberVisualEvent(view, event) {
  const id = visualEventId(event);
  view.__pvpSeenVisualEvents ??= new Set();
  if (view.__pvpSeenVisualEvents.has(id)) return false;
  view.__pvpSeenVisualEvents.add(id);
  if (view.__pvpSeenVisualEvents.size > 128) {
    const first = view.__pvpSeenVisualEvents.values().next().value;
    view.__pvpSeenVisualEvents.delete(first);
  }
  return true;
}

function tagLatestSkillFx(view, payload) {
  const skillId = Number(payload?.skillId);
  const effects = view.engine?.skillFx ?? view.engine?.skillEffects ?? [];
  const fx = [...effects].reverse().find((entry) => Number(entry.skillId) === skillId && !entry.__pvpDirectionTagged);
  if (!fx) return;
  fx.__pvpDirectionTagged = true;
  fx.pvpDirection = localCasterDirection(view, payload.team);
  fx.pvpCasterTeam = payload.team;
  fx.pvpEventId = visualEventId(payload);
}

function playVisualSkillEvent(view, event) {
  if (!rememberVisualEvent(view, event)) return;
  const skillId = Number(event.skillId);
  const effect = getSkillEffect(skillId);
  if (!effect || !view.engine?.skills) return;
  const age = Math.max(0, finite(view.engine.time) - finite(event.startedAt, view.engine.time));
  const eventDuration = Math.max(0, finite(event.duration));
  if (eventDuration > 0 && age >= eventDuration) return;
  const target = event.target
    ? { lane: finite(event.target.lane), col: localCol(view, event.target.col) }
    : null;
  view.engine.skills.showEffect(skillId, effect, target);
  tagLatestSkillFx(view, event);
  const effects = view.engine.skillFx ?? view.engine.skillEffects ?? [];
  const latest = effects.at(-1);
  if (latest && Number(latest.skillId) === skillId) {
    latest.t = Math.max(finite(latest.t), age);
    if (eventDuration > 0) latest.duration = Math.min(finite(latest.duration, eventDuration), eventDuration);
  }
}

function consumeSnapshotSkillEvents(view, events) {
  for (const event of events) playVisualSkillEvent(view, event);
}

function installForView(view) {
  if (!view.pvp || view.__pvpCombatPolishInstalled) return;
  view.__pvpCombatPolishInstalled = true;
  removeBaseLabels(view);

  if (view.pvpSocket?.on) {
    view.__pvpCombatSnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      queueMicrotask(() => processSnapshot(view, snapshot));
    });
    view.__pvpCombatFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      queueMicrotask(() => processSnapshot(view, snapshot));
    });
    view.__pvpCombatSkillUnsub = view.pvpSocket.on('pvp:authority:skill-cast', (payload) => {
      // ResourceFinal 已在同一事件上创建视觉特效；此处登记ID并附加方向，
      // 后续权威快照里的同一 visualEvent 不再重复创建第二份。
      rememberVisualEvent(view, payload);
      queueMicrotask(() => tagLatestSkillFx(view, payload));
    });
  }

  startNetworkTargetLoop(view);
  requestAnimationFrame(() => {
    processSnapshot(view, view.__pvpLatestSnapshot);
    removeBaseLabels(view);
  });
}

function cleanupForView(view) {
  view.__pvpCombatSnapshotUnsub?.();
  view.__pvpCombatFinishedUnsub?.();
  view.__pvpCombatSkillUnsub?.();
  view.__pvpCombatSnapshotUnsub = null;
  view.__pvpCombatFinishedUnsub = null;
  view.__pvpCombatSkillUnsub = null;
  if (view.__pvpCombatPolishRaf) cancelAnimationFrame(view.__pvpCombatPolishRaf);
  view.__pvpCombatPolishRaf = null;
  view.viewRoot?.querySelector?.('[data-pvp-player-stands]')?.remove?.();
}

export function installPvpCombatPolishFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousCanDeploy = BattleEngine.prototype.canDeploy;
  BattleEngine.prototype.canDeploy = function canDeployWithPvpStacking(lane, col, handIndex, options = {}) {
    const baseAllowed = previousCanDeploy.call(this, lane, col, handIndex, options);
    if (!baseAllowed || !this.pvp) return baseAllowed;
    const card = this.deck?.[handIndex]?.card;
    if (!card) return false;
    const movable = Number(card.moveSpeed) > 0;
    const ownFixed = this.getUnitsAt(lane, col).some((unit) =>
      unit.alive && unit.team === 'player' && !unit.isMovable?.());
    if (!movable && ownFixed) {
      if (!options.silent) this.lastDeployError = '该格已有己方不可移动单位';
      return false;
    }
    return true;
  };

  const previousDrawSkillFx = BattleRenderer.prototype.drawSkillFx;
  BattleRenderer.prototype.drawSkillFx = function drawDirectionalPvpSkillFx(ctx, engine) {
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
      const reveal = Math.min(1, 0.16 + progress * 1.4);
      const width = FIELD_W * reveal;
      ctx.save();
      ctx.beginPath();
      if (fx.pvpDirection < 0) ctx.rect(FIELD_W - width, 0, width, FIELD_H);
      else ctx.rect(0, 0, width, FIELD_H);
      ctx.clip();
      if (fx.pvpDirection < 0) {
        ctx.translate(FIELD_W, 0);
        ctx.scale(-1, 1);
      }
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

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderPvpCombatPolish(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpCombatPolish() {
    cleanupForView(this);
    return previousDestroy.call(this);
  };

  window.__verifyPvpCombatPolishFinal = () => {
    const wrap = document.querySelector('.pvp-wilderness-battle .battle-game-wrap');
    return {
      enabled: true,
      active: Boolean(document.querySelector('.pvp-wilderness-battle')),
      columns: wrap?.querySelectorAll('[data-pvp-authority-column]').length ?? 0,
      players: wrap?.querySelectorAll('.pvp-column-player').length ?? 0,
      baseLabelsVisible: [...(wrap?.querySelectorAll('.base-hp-slot .label') ?? [])]
        .some((node) => node.textContent.trim().length > 0),
      neutralIce: window.__pvpFixtureBattle?.engine?.units?.filter((unit) => unit.pvpNeutral).length ?? 0,
      smoothing: Boolean(window.__pvpFixtureBattle?.__pvpCombatPolishRaf),
      fieldWidth: FIELD_W,
      cellWidth: CELL_W,
    };
  };
}
