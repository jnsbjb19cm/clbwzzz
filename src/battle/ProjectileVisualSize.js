export function projectileVisualSize(projectile, animated = false) {
  const sourceRes = Number(projectile?.sourceRes);
  if (sourceRes === 118 && projectile?.trajectory === 'straight') return animated ? 42 : 40;
  if (projectile?.trajectory === 'parabola') return animated ? 30 : 28;
  return animated ? 24 : 22;
}
