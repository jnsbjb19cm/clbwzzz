export const GROUND = 1;
export const AIR = 2;

const ALL_LAYERS = GROUND | AIR;

function targetLayerMask(targetOrLayer) {
  if (typeof targetOrLayer === 'number') return targetOrLayer & ALL_LAYERS;
  return targetOrLayer?.isFlying?.() ? AIR : GROUND;
}

/**
 * Resolve the layers a unit may attack at the instant it launches an attack.
 * A flying unit attacks air only; a mobile ground unit attacks ground only.
 * Stationary lobbers are the sole ground units that can also attack air.
 */
export function getUnitAttackLayerMask(unit) {
  if (unit?.isFlying?.()) return AIR;

  const movable = typeof unit?.isMovable === 'function'
    ? unit.isMovable()
    : Number(unit?.moveSpeed) > 0;
  if (movable) return GROUND;

  if (unit?.isParabola?.()) return ALL_LAYERS;
  return GROUND;
}

export function canUnitAttackTargetLayer(unit, targetOrLayer) {
  return Boolean(getUnitAttackLayerMask(unit) & targetLayerMask(targetOrLayer));
}

export function projectileCanHitTargetLayer(projectile, targetOrLayer) {
  let attackLayerMask = projectile?.targetLayerMask;
  if (attackLayerMask == null) {
    attackLayerMask = projectile?.source
      ? getUnitAttackLayerMask(projectile.source)
      : projectile?.trajectory === 'parabola' ? ALL_LAYERS : GROUND;
  }
  return Boolean((Number(attackLayerMask) & ALL_LAYERS) & targetLayerMask(targetOrLayer));
}
