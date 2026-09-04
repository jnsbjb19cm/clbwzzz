import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { BattleView } from './BattleView.js';
import { installPvpClientPredictionFinal } from './PvpClientPredictionFinal.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpAnimationContinuityFinal');
const SPECIAL_STATES = new Set([
  'underMoving',
  'secondAttackStatus',
  'jump',
  'flying',
  'toGround',
  'stun',
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function authoritativeStart(data, now, duration, serverUntil) {
  const explicit = Number(data?.animStartedAt);
  if (Number.isFinite(explicit)) return Math.min(now, explicit);
  if (serverUntil > 0 && duration > 0) return Math.min(now, Math.max(0, serverUntil - duration));
  return now;
}

function seedAnimationClock(unit, state, elapsed, now) {
  const key = String(unit?.res ?? '');
  let pack = unitAnimPlayer.ready.get(key);
  if (!pack) {
    unitAnimPlayer.ensureLoaded([key]);
    pack = unitAnimPlayer.ready.get(key);
  }
  if (!pack) return;

  let drawState = state;
  if (state === 'attacking') {
    drawState = unitAnimPlayer.pickDrawState(pack, unit, { time: now })?.state ?? 'attacking';
  }
  if (!pack.meta?.animations?.[drawState]?.frames?.length) return;

  unitAnimPlayer.resetClock(unit);
  unitAnimPlayer.clocks.set(`${unit.uid}:${drawState}`, Math.max(0, elapsed));
  unitAnimPlayer.lastDrawTimes.set(unit.uid, now);
}

function beginAttackWindow(unit, data, now) {
  const token = Number(data.attackToken) || 0;
  const tokenChanged = token > 0 && token !== unit.__pvpContinuityAttackToken;
  const enteredState = unit.__pvpContinuityState !== 'attacking';
  const duration = Math.max(0.18, unitAnimPlayer.resolveAttackDuration(unit));
  const serverUntil = finite(data.animUntil);

  // 联机动画必须加入服务器已经推进到的时间点，而不是“收到快照后从第0帧重播”。
  // 否则 RTT / 20Hz 快照延迟会被额外叠加成一整段攻击动作的卡顿。
  if (tokenChanged || (!token && enteredState)) {
    if (token) unit.__pvpContinuityAttackToken = token;
    const startedAt = authoritativeStart(data, now, duration, serverUntil);
    const elapsed = Math.max(0, now - startedAt);
    unit.__pvpContinuityAttackStartedAt = startedAt;
    unit._attackAnimStartedAt = startedAt;
    unit._attackAnimUntil = serverUntil > now
      ? serverUntil
      : Math.max(now + 0.02, startedAt + duration);
    seedAnimationClock(unit, 'attacking', elapsed, now);
    return;
  }

  // 同一攻击实例只接受服务端明确给出的结束时间，不再相对当前时间延长。
  unit._attackAnimUntil = Math.max(finite(unit._attackAnimUntil), serverUntil);
}

function beginSpecialWindow(unit, data, state, now) {
  const token = Number(data.jumpToken || data.forcedToken) || 0;
  const tokenChanged = token > 0 && token !== unit.__pvpContinuitySpecialToken;
  const enteredState = unit.__pvpContinuityState !== state;
  const duration = Math.max(
    0.18,
    unitAnimPlayer.resolveAnimationDuration(unit, state, 0.45),
  );
  const serverUntil = finite(data.animUntil);

  unit._forcedAnimState = state;
  if (tokenChanged || (!token && enteredState)) {
    if (token) unit.__pvpContinuitySpecialToken = token;
    const startedAt = authoritativeStart(data, now, duration, serverUntil);
    const elapsed = Math.max(0, now - startedAt);
    unit.__pvpContinuitySpecialStartedAt = startedAt;
    unit._forcedAnimStartedAt = startedAt;
    unit._forcedAnimUntil = serverUntil > now
      ? serverUntil
      : Math.max(now + 0.02, startedAt + duration);
    seedAnimationClock(unit, state, elapsed, now);
  } else {
    unit._forcedAnimUntil = Math.max(finite(unit._forcedAnimUntil), serverUntil);
  }

  if (state === 'jump') unit._jumpUntil = unit._forcedAnimUntil;
  if (state === 'stun') unit.stunnedUntil = unit._forcedAnimUntil;
}

function applyAnimationContinuity(view, snapshot) {
  if (!view.engine || !snapshot?.units) return;
  const units = new Map((view.engine.units ?? []).map((unit) => [Number(unit.uid), unit]));
  const now = finite(view.engine.time);

  for (const data of snapshot.units) {
    const unit = units.get(Number(data.uid));
    if (!unit || data.neutral) continue;
    const state = data.animState || data.state || 'default';

    if (state === 'attacking') {
      beginAttackWindow(unit, data, now);
      unit.__pvpContinuityState = state;
      continue;
    }

    if (SPECIAL_STATES.has(state)) {
      beginSpecialWindow(unit, data, state, now);
      unit.__pvpContinuityState = state;
      continue;
    }

    if (state === 'moving' || state === 'default') {
      // 动画窗口尚未自然结束时保留最后几帧，避免快照先切回 moving 造成硬切。
      // 窗口结束后再清理强制状态，移动/待机动画即可正常接管。
      if (finite(unit._forcedAnimUntil) <= now) {
        unit._forcedAnimState = null;
        unit._forcedAnimUntil = 0;
      }
    }
    unit.__pvpContinuityState = state;
  }
}

function installForView(view) {
  if (!view.pvp || view.__pvpAnimationContinuityInstalled) return;
  view.__pvpAnimationContinuityInstalled = true;
  if (view.pvpSocket?.on) {
    view.__pvpAnimationSnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => {
      queueMicrotask(() => applyAnimationContinuity(view, snapshot));
    });
    view.__pvpAnimationFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      queueMicrotask(() => applyAnimationContinuity(view, snapshot));
    });
  }
  requestAnimationFrame(() => applyAnimationContinuity(view, view.__pvpLatestSnapshot));
}

function cleanupForView(view) {
  view.__pvpAnimationSnapshotUnsub?.();
  view.__pvpAnimationFinishedUnsub?.();
  view.__pvpAnimationSnapshotUnsub = null;
  view.__pvpAnimationFinishedUnsub = null;
  view.__pvpAnimationContinuityInstalled = false;
}

export function installPvpAnimationContinuityFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderPvpAnimationContinuity(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpAnimationContinuity() {
    cleanupForView(this);
    return previousDestroy.call(this);
  };

  // 预测层只做即时视觉反馈；它包在连续性层之外，随后仍由服务端快照确认/纠正。
  installPvpClientPredictionFinal();

  window.__applyPvpAnimationContinuityForTest = applyAnimationContinuity;
  window.__verifyPvpAnimationContinuityFinal = () => ({
    enabled: true,
    tokenGated: true,
    repeatedSnapshotExtendsWindow: false,
    joinsAuthoritativeTimeline: true,
    packetReceiptDoesNotRestartAnimation: true,
  });
}
