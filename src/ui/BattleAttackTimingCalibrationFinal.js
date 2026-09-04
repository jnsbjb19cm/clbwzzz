import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleAttackTimingCalibrationFinal');
const MIN_ATTACK_FPS = 24;

function isAttackState(state) {
  const key = String(state ?? '');
  return key === 'attacking' || key.startsWith('attacking_') || key.startsWith('attack_');
}

function thresholdOf(key) {
  const match = String(key).match(/_(\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) : Infinity;
}

function pickAttackState(player, unit) {
  const pack = player.ready.get(String(unit?.res ?? ''));
  if (!pack) return null;
  const animations = pack.meta?.animations ?? {};
  const hpKeys = [
    ...(pack.meta?.attackHpAnims ?? []),
    ...Object.keys(animations).filter((key) => key.startsWith('attacking_') || key.startsWith('attack_')),
  ];
  const unique = [...new Set(hpKeys)].filter((key) => animations[key]?.frames?.length);
  if (unique.length) {
    unique.sort((a, b) => thresholdOf(a) - thresholdOf(b));
    const pct = (Number(unit?.hp) / Math.max(1, Number(unit?.maxHp) || 1)) * 100;
    const chosen = unique.find((key) => pct <= thresholdOf(key)) ?? unique.at(-1);
    if (chosen) return chosen;
  }
  if (animations.attacking?.frames?.length) return 'attacking';
  return Object.keys(animations).find((key) => isAttackState(key) && animations[key]?.frames?.length) ?? null;
}

function attackRate(anim) {
  return Math.max(MIN_ATTACK_FPS, Number(anim?.frameRate) || 12);
}

function attackDuration(anim, fallback) {
  const frames = anim?.frames?.length ?? 0;
  return frames ? frames / attackRate(anim) : fallback;
}

export function installBattleAttackTimingCalibrationFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const oldAttackDuration = unitAnimPlayer.resolveAttackDuration.bind(unitAnimPlayer);
  const oldAnimDuration = unitAnimPlayer.resolveAnimationDuration.bind(unitAnimPlayer);
  const oldFrameDelay = unitAnimPlayer.resolveAnimationFrameDelay.bind(unitAnimPlayer);
  const oldAnimRelease = unitAnimPlayer.resolveAnimationReleaseDelay.bind(unitAnimPlayer);
  const oldAttackRelease = unitAnimPlayer.resolveAttackReleaseDelay.bind(unitAnimPlayer);

  unitAnimPlayer.resolveAttackDuration = function calibratedAttackDuration(unit, explicitDuration) {
    if (explicitDuration != null) return explicitDuration;
    const state = pickAttackState(this, unit);
    const anim = state ? this.ready.get(String(unit?.res))?.meta?.animations?.[state] : null;
    return anim?.frames?.length ? attackDuration(anim, 3.5) : oldAttackDuration(unit, explicitDuration);
  };

  unitAnimPlayer.resolveAnimationDuration = function calibratedAnimationDuration(unit, state, fallback = 1.5) {
    if (!isAttackState(state)) return oldAnimDuration(unit, state, fallback);
    const pack = this.ready.get(String(unit?.res));
    const anim = pack?.meta?.animations?.[state];
    return anim?.frames?.length ? attackDuration(anim, fallback) : oldAnimDuration(unit, state, fallback);
  };

  unitAnimPlayer.resolveAnimationFrameDelay = function calibratedFrameDelay(unit, state, frame, fallback = 0) {
    if (!isAttackState(state)) return oldFrameDelay(unit, state, frame, fallback);
    const pack = this.ready.get(String(unit?.res));
    const anim = pack?.meta?.animations?.[state];
    if (!anim?.frames?.length) return oldFrameDelay(unit, state, frame, fallback);
    const safe = Math.max(0, Math.min(anim.frames.length - 1, Number(frame) || 0));
    return safe / attackRate(anim);
  };

  unitAnimPlayer.resolveAnimationReleaseDelay = function calibratedAnimationRelease(unit, state, fallbackRatio = 0.42) {
    if (!isAttackState(state)) return oldAnimRelease(unit, state, fallbackRatio);
    const pack = this.ready.get(String(unit?.res));
    const anim = pack?.meta?.animations?.[state];
    if (!anim?.frames?.length) return oldAnimRelease(unit, state, fallbackRatio);
    const duration = attackDuration(anim, 1.5);
    if (anim.releaseFrame != null) {
      return Math.max(0, Math.min(duration, Number(anim.releaseFrame) / attackRate(anim)));
    }
    return Math.max(0.08, Math.min(duration * 0.75, duration * fallbackRatio));
  };

  unitAnimPlayer.resolveAttackReleaseDelay = function calibratedAttackRelease(unit) {
    const state = pickAttackState(this, unit);
    const pack = this.ready.get(String(unit?.res));
    const anim = state ? pack?.meta?.animations?.[state] : null;
    if (!anim?.frames?.length) return oldAttackRelease(unit);
    const duration = attackDuration(anim, 3.5);
    if (anim.releaseFrame != null) {
      return Math.max(0, Math.min(duration, Number(anim.releaseFrame) / attackRate(anim)));
    }
    const ratio = Number(anim.releaseRatio ?? pack?.meta?.attackReleaseRatio ?? 0.42);
    return Math.max(0.08, Math.min(duration * 0.7, duration * ratio));
  };

  globalThis.__verifyBattleAttackTimingCalibrationFinal = () => ({
    enabled: true,
    attackAliasesUseSameClock: ['attacking', 'attacking_100', 'attack_60'].every(isAttackState),
    minimumAttackFps: MIN_ATTACK_FPS,
  });
}

export function scheduleBattleAttackTimingCalibrationFinal() {
  queueMicrotask(() => installBattleAttackTimingCalibrationFinal());
}
