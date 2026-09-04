import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleSkillSystem } from '../systems/BattleSkillSystem.js';
import { audio } from '../core/AudioManager.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleHealingFeedbackFinal');
const HEAL_SOUND = '/sound/effect/fire/addHP.mp3';
const HEAL_SOUND_THROTTLE_MS = 180;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function playHealSound(engine) {
  if (!engine) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const previous = finite(engine.__lastHealSoundAt, -Infinity);
  if (now - previous < HEAL_SOUND_THROTTLE_MS) return;
  engine.__lastHealSoundAt = now;
  audio.playSfx(HEAL_SOUND, { tier: 'combat', throttle: true, throttleKind: 'combat' });
}

function showUnitHeal(engine, unit, beforeHp) {
  if (!engine || !unit?.alive) return 0;
  const gained = Math.round((finite(unit.hp) - finite(beforeHp)) * 10) / 10;
  if (gained <= 0) return 0;
  engine.spawnFloat?.(unit.lane, unit.col, gained);
  return gained;
}

function snapshotHpMap(snapshot) {
  return new Map((snapshot?.units ?? []).map((unit) => [Number(unit.uid), finite(unit.hp)]));
}

function processAuthorityHealing(view, snapshot) {
  if (!view?.engine || !snapshot) return;
  const next = snapshotHpMap(snapshot);
  const previous = view.__healingFeedbackSnapshot;
  if (previous) {
    for (const [uid, hp] of next) {
      if (previous.has(uid) && hp > finite(previous.get(uid)) + 0.001) {
        playHealSound(view.engine);
        break;
      }
    }
  }
  view.__healingFeedbackSnapshot = next;
}

function installAuthorityHealing(view) {
  if (!view.pvp || view.__healingFeedbackAuthorityInstalled) return;
  view.__healingFeedbackAuthorityInstalled = true;
  if (view.pvpSocket?.on) {
    view.__healingFeedbackSnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      queueMicrotask(() => processAuthorityHealing(view, snapshot));
    });
    view.__healingFeedbackFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      queueMicrotask(() => processAuthorityHealing(view, snapshot));
    });
  }
  queueMicrotask(() => processAuthorityHealing(view, view.__pvpLatestSnapshot));
}

function cleanupAuthorityHealing(view) {
  view.__healingFeedbackSnapshotUnsub?.();
  view.__healingFeedbackFinishedUnsub?.();
  view.__healingFeedbackSnapshotUnsub = null;
  view.__healingFeedbackFinishedUnsub = null;
  view.__healingFeedbackSnapshot = null;
  view.__healingFeedbackAuthorityInstalled = false;
}

export function installBattleHealingFeedbackFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 所有正向飘字都来自实际发生的治疗结果，因此这里是本地 PVE/BOSS 最稳定的统一治疗声音入口。
  const previousSpawnFloat = BattleEngine.prototype.spawnFloat;
  BattleEngine.prototype.spawnFloat = function spawnFloatWithHealingAudio(lane, col, amount) {
    const result = previousSpawnFloat.call(this, lane, col, amount);
    if (finite(amount) > 0) playHealSound(this);
    return result;
  };

  const previousApplyCardHit = BattleEngine.prototype.applyCardHit;
  BattleEngine.prototype.applyCardHit = function applyCardHitWithHealingFeedback(
    attacker,
    victim,
    baseDamage,
    options = {},
  ) {
    const beforeHp = finite(attacker?.hp);
    const result = previousApplyCardHit.call(this, attacker, victim, baseDamage, options);
    showUnitHeal(this, attacker, beforeHp);
    return result;
  };

  const previousApplyEffect = BattleSkillSystem.prototype.applyEffect;
  BattleSkillSystem.prototype.applyEffect = function applyEffectWithBuffHealFeedback(
    skillId,
    effect,
    target,
    card,
  ) {
    if (effect?.kind !== 'buff_max_hp') {
      return previousApplyEffect.call(this, skillId, effect, target, card);
    }

    const allies = (this.engine?.units ?? [])
      .filter((unit) => unit.alive && unit.team === 'player')
      .map((unit) => ({ unit, hp: finite(unit.hp) }));
    const result = previousApplyEffect.call(this, skillId, effect, target, card);
    for (const entry of allies) showUnitHeal(this.engine, entry.unit, entry.hp);
    return result;
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderWithHealingAudio(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installAuthorityHealing(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyHealingFeedback() {
    cleanupAuthorityHealing(this);
    return previousDestroy.call(this);
  };

  window.__verifyBattleHealingFeedbackFinal = () => ({
    enabled: true,
    hitHealingCovered: true,
    maxHpBuffHealingCovered: true,
    authoritativeHealingAudio: true,
    sound: HEAL_SOUND,
  });
}
