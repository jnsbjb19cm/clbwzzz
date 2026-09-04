export const SKILL_RESOURCE_ID = Object.freeze({
  527: 506,
  538: 502,
});

export const SKILL_ANIMATION_DURATION = Object.freeze({
  500: 1.23,
  501: 2.76,
  502: 0.85,
  503: 0.85,
  506: 1.04,
  507: 0.85,
  514: 0.85,
  517: 0.85,
  523: 1.25,
  529: 0.85,
  530: 0.85,
  531: 0.85,
  532: 0.85,
  533: 0.85,
  534: 1.11,
  535: 1.79,
  536: 0.85,
  537: 1.65,
  539: 0.85,
  542: 0.85,
  543: 0.85,
  544: 0.85,
  550: 0.85,
  552: 0.85,
  557: 0.85,
});

export function resolveSkillResourceId(skillId) {
  const id = Number(skillId) || 500;
  return SKILL_RESOURCE_ID[id] ?? id;
}

export const SKILL_PLAYBACK_RATE = 0.72;

export function getSkillAnimationDuration(skillId, fallback = 0.9) {
  const sourceDuration = SKILL_ANIMATION_DURATION[resolveSkillResourceId(skillId)] ?? fallback;
  return sourceDuration / SKILL_PLAYBACK_RATE;
}

/**
 * Full visual lifetime for one cast. Meteor Rain intentionally plays the
 * original 517 sequence twice; Firebird has its own single-pass animation.
 */
export function getSkillVisualDuration(skillId, fallback = 0.9) {
  const id = Number(skillId);
  const onePass = getSkillAnimationDuration(id, fallback);
  if (id === 517) return Math.max(1.2, onePass * 2);
  return onePass;
}

/** Damage for Meteor Rain and Firebird resolves only after the visual ends. */
export function getSkillResolutionDelay(skillId, fallback = 0.9) {
  const id = Number(skillId);
  if (id === 517 || id === 537) return getSkillVisualDuration(id, fallback);
  return getSkillAnimationDuration(id, fallback) * 0.42;
}
