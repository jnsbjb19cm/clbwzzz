import { BattleEngine } from '../../src/battle/BattleEngine.js';
import {
  PARABOLA_RELEASE_SOURCE,
  getParabolaReleaseDelaySec,
  getParabolaReleaseFrame,
} from '../../src/battle/ParabolaReleaseCalibration.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpProjectileReleaseCalibrationFinal');

export function installPvpProjectileReleaseCalibrationFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousTryAttack = BattleEngine.prototype.tryAttack;
  BattleEngine.prototype.tryAttack = function tryAttackWithCalibratedThrowRelease(unit) {
    const before = this._pendingAttackReleases?.length ?? 0;
    const startedAt = Number(this.time) || 0;
    const result = previousTryAttack.call(this, unit);
    const frame = getParabolaReleaseFrame(unit?.res);
    const delay = getParabolaReleaseDelaySec(unit?.res);
    if (!result || frame == null || delay == null) return result;

    const releaseAt = startedAt + delay;
    const pending = this._pendingAttackReleases ?? [];
    for (let index = before; index < pending.length; index += 1) {
      const action = pending[index];
      if (action?.sourceUid !== unit.uid || !action.ranged || action.trajectory !== 'parabola') continue;
      action.at = releaseAt;
      action.releaseFrame = frame;
      action.releaseSource = PARABOLA_RELEASE_SOURCE;
    }
    return result;
  };
}
