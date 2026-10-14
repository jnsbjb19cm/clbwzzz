// Shared by authoritative snapshots and their client-side animation prediction.
export function attackReadyAt(unit, time) {
  return Math.max(Number(unit.firstAttackReadyAt) || 0,
    Number(time) + Math.max(0, Number(unit.atkTimer) || 0));
}
