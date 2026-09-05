const PATCH_FLAG = Symbol.for('clbwzzz.battleCardFeedbackFinal');

/**
 * Synthetic card-feedback rings were removed from production gameplay.
 *
 * The previous patch wrapped attack, damage, summon and death events and drew
 * extra Canvas arc/ellipse/radial-gradient markers on top of the real battle
 * animation. Those markers looked like debug HIT/deploy circles, duplicated
 * existing projectile/impact/unit animation feedback, and added avoidable work
 * on every attack and placement event.
 *
 * Keep the installer/verifier surface so older bootstrap and diagnostic callers
 * remain compatible, but do not attach runtime wrappers or allocate feedback
 * objects anymore.
 */
export function installBattleCardFeedbackFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  globalThis.__verifyBattleCardFeedbackFinal = () => ({
    enabled: true,
    syntheticCircularFeedback: false,
    count: 0,
    kinds: [],
  });
}
