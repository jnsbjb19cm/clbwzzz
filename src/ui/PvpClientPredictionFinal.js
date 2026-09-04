import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { BattleView } from './BattleView.js';
/*客户端预测动画*/
const PATCH_FLAG = Symbol.for('clbwzzz.pvpClientPredictionFinal');
const FLY_SHOE_CARD_ID = 23;
const FLY_SHOE_CONTACT_COL = 0.62;
const FLY_SHOE_STUN_SEC = 2.5;
const PREDICTION_CONFIRM_TIMEOUT = 0.7;
const NORMAL_ATTACK_LEAD_SEC = 0.035;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function snapshotByUid(view) {
  return new Map(
    (view.__pvpLatestSnapshot?.units ?? []).map((data) => [Number(data.uid), data]),
  );
}

function activeVisualAction(unit, now) {
  return Boolean(
    (unit._forcedAnimState && finite(unit._forcedAnimUntil) > now)
    || finite(unit._attackAnimUntil) > now
    || finite(unit._jumpUntil) > now,
  );
}

function isEnemy(a, b) {
  return a && b
    && a !== b
    && a.alive !== false
    && b.alive !== false
    && a.team !== b.team
    && a.team !== 'neutral'
    && b.team !== 'neutral';
}

function contactEnemy(view, unit) {
  return (view.engine?.units ?? []).find((target) =>
    isEnemy(unit, target)
    && Math.abs(finite(target.lane) - finite(unit.lane)) < 0.01
    && Math.abs(finite(target.col) - finite(unit.col)) < FLY_SHOE_CONTACT_COL
    && !target.isLowTarget?.(),
  ) ?? null;
}

function attackTargetInRange(view, unit) {
  const direction = unit.team === 'enemy' ? -1 : 1;
  const range = Math.max(1, finite(unit.range, 1));
  return (view.engine?.units ?? [])
    .filter((target) => {
      if (!isEnemy(unit, target) || target.isLowTarget?.()) return false;
      if (Math.abs(finite(target.lane) - finite(unit.lane)) > 0.01) return false;
      const ahead = direction * (finite(target.col) - finite(unit.col));
      return ahead >= -0.05 && ahead <= range + 0.55;
    })
    .sort((a, b) => Math.abs(finite(a.col) - finite(unit.col)) - Math.abs(finite(b.col) - finite(unit.col)))[0] ?? null;
}

function ensureAudit(view) {
  view.__pvpPredictionAudit ??= {
    predicted: 0,
    confirmed: 0,
    rolledBack: 0,
    flyShoePredicted: 0,
    attacksPredicted: 0,
    desyncSamples: 0,
    maxUnitColError: 0,
    maxUnitLaneError: 0,
  };
  return view.__pvpPredictionAudit;
}

function predictFlyShoe(view, unit, data, now) {
  if (Number(unit.cardId) !== FLY_SHOE_CARD_ID) return false;
  if (unit.isBoss || unit.pvpBoss) return false;
  if (data?.firstContactStun === true) return false;
  if (unit.__pvpPredictedFirstContact) return false;
  const target = contactEnemy(view, unit);
  if (!target) return false;

  const duration = Math.max(
    0.18,
    unitAnimPlayer.resolveAnimationDuration(unit, 'secondAttackStatus', 0.85),
  );
  unit.__pvpPredictedFirstContact = true;
  unit.__pvpPrediction = {
    kind: 'fly-shoe',
    startedAt: now,
    expiresAt: now + PREDICTION_CONFIRM_TIMEOUT,
    baselineForcedToken: Number(data?.forcedToken) || 0,
    targetUid: Number(target.uid),
  };
  unitAnimPlayer.triggerState(unit, view.engine, 'secondAttackStatus', duration);
  target.stunnedUntil = Math.max(finite(target.stunnedUntil), now + FLY_SHOE_STUN_SEC);
  target.__pvpPredictedStunFrom = Number(unit.uid);

  const audit = ensureAudit(view);
  audit.predicted += 1;
  audit.flyShoePredicted += 1;
  return true;
}

function predictNormalAttack(view, unit, data, now) {
  if (!data || Number(unit.cardId) === FLY_SHOE_CARD_ID) return false;
  if (unit.isBoss || unit.pvpBoss || unit.pvpNeutral) return false;
  if (!(Number(data.attackReadyAt) > 0)) return false;
  if (Number(data.attackReadyAt) > now + NORMAL_ATTACK_LEAD_SEC) return false;
  if (activeVisualAction(unit, now) || unit.__pvpPrediction) return false;
  if (!attackTargetInRange(view, unit)) return false;

  const key = `${Number(unit.uid)}:${Number(data.attackReadyAt).toFixed(3)}`;
  view.__pvpPredictionSeen ??= new Set();
  if (view.__pvpPredictionSeen.has(key)) return false;
  view.__pvpPredictionSeen.add(key);
  if (view.__pvpPredictionSeen.size > 512) {
    const first = view.__pvpPredictionSeen.values().next().value;
    view.__pvpPredictionSeen.delete(first);
  }

  unit.__pvpPrediction = {
    kind: 'attack',
    startedAt: now,
    expiresAt: now + PREDICTION_CONFIRM_TIMEOUT,
    baselineAttackToken: Number(data.attackToken) || 0,
  };
  unitAnimPlayer.triggerAttack(unit, view.engine);

  const audit = ensureAudit(view);
  audit.predicted += 1;
  audit.attacksPredicted += 1;
  return true;
}

function confirmedByAuthority(prediction, data) {
  if (!prediction || !data) return false;
  if (prediction.kind === 'fly-shoe') {
    return data.firstContactStun === true
      || (String(data.animState || data.state) === 'secondAttackStatus'
        && Number(data.forcedToken) !== Number(prediction.baselineForcedToken));
  }
  if (prediction.kind === 'attack') {
    return String(data.animState || data.state) === 'attacking'
      && Number(data.attackToken) !== Number(prediction.baselineAttackToken);
  }
  return false;
}

function rollbackPrediction(view, unit, prediction, now) {
  if (prediction.kind === 'fly-shoe') {
    if (unit._forcedAnimState === 'secondAttackStatus') {
      unit._forcedAnimState = null;
      unit._forcedAnimUntil = 0;
      unitAnimPlayer.resetClock(unit);
    }
    const target = (view.engine?.units ?? []).find((candidate) => Number(candidate.uid) === prediction.targetUid);
    if (target?.__pvpPredictedStunFrom === Number(unit.uid)) {
      target.stunnedUntil = Math.min(finite(target.stunnedUntil), now);
      target.__pvpPredictedStunFrom = null;
    }
    unit.__pvpPredictedFirstContact = false;
  } else if (prediction.kind === 'attack') {
    if (finite(unit._attackAnimStartedAt) >= prediction.startedAt - 0.001) {
      unit._attackAnimUntil = 0;
      unitAnimPlayer.resetClock(unit);
    }
  }
  unit.__pvpPrediction = null;
  ensureAudit(view).rolledBack += 1;
}

function reconcilePredictions(view, byUid, now) {
  for (const unit of view.engine?.units ?? []) {
    const prediction = unit.__pvpPrediction;
    if (!prediction) continue;
    const data = byUid.get(Number(unit.__authorityUid ?? unit.uid));
    if (confirmedByAuthority(prediction, data)) {
      unit.__pvpPrediction = null;
      if (prediction.kind === 'fly-shoe') unit.__pvpPredictedFirstContact = true;
      ensureAudit(view).confirmed += 1;
      continue;
    }
    if (now >= prediction.expiresAt) rollbackPrediction(view, unit, prediction, now);
  }
}

function sampleDesync(view) {
  const audit = ensureAudit(view);
  let sampled = false;
  for (const unit of view.engine?.units ?? []) {
    if (!Number.isFinite(Number(unit.__authorityTargetCol))) continue;
    sampled = true;
    audit.maxUnitColError = Math.max(
      audit.maxUnitColError,
      Math.abs(finite(unit.col) - finite(unit.__authorityTargetCol)),
    );
    audit.maxUnitLaneError = Math.max(
      audit.maxUnitLaneError,
      Math.abs(finite(unit.lane) - finite(unit.__authorityTargetLane)),
    );
  }
  if (sampled) audit.desyncSamples += 1;
}

function predictionFrame(view) {
  if (!view.__pvpClientPredictionInstalled || !view.__pvpAuthorityActive || !view.engine) return;
  const now = finite(view.engine.time);
  const byUid = snapshotByUid(view);
  reconcilePredictions(view, byUid, now);

  for (const unit of view.engine.units ?? []) {
    if (unit.alive === false || unit.pvpNeutral) continue;
    const data = byUid.get(Number(unit.__authorityUid ?? unit.uid));
    if (!data) continue;
    if (predictFlyShoe(view, unit, data, now)) continue;
    predictNormalAttack(view, unit, data, now);
  }
  sampleDesync(view);
  view.__pvpPredictionRaf = requestAnimationFrame(() => predictionFrame(view));
}

function installForView(view) {
  if (!view.pvp || view.__pvpClientPredictionInstalled) return;
  view.__pvpClientPredictionInstalled = true;
  view.__pvpPredictionAudit = null;
  ensureAudit(view);
  cancelAnimationFrame(view.__pvpPredictionRaf);
  view.__pvpPredictionRaf = requestAnimationFrame(() => predictionFrame(view));
}

function cleanupForView(view) {
  view.__pvpClientPredictionInstalled = false;
  cancelAnimationFrame(view.__pvpPredictionRaf);
  view.__pvpPredictionRaf = null;
  view.__pvpPredictionSeen?.clear?.();
  view.__pvpPredictionSeen = null;
}

export function installPvpClientPredictionFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderWithPvpClientPrediction(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpClientPrediction() {
    cleanupForView(this);
    return previousDestroy.call(this);
  };

  window.__verifyPvpClientPredictionFinal = () => {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView
      ?? window.__pvpFixtureBattle
      ?? window.__bossCoopFixtureBattle;
    return {
      enabled: true,
      serverAuthoritative: true,
      predictsVisualsOnly: true,
      damagePredicted: false,
      outcomeUploads: false,
      reconciliationTimeoutSec: PREDICTION_CONFIRM_TIMEOUT,
      audit: view?.__pvpPredictionAudit ?? null,
    };
  };
}
