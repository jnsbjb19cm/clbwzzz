import { BattleRenderer } from '../battle/BattleRenderer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleFxAssetBudgetFinal');
// qualityLightCircle is the original animated quality pedestal and is now an
// intentional battle dependency. Keep the budget hook for future exclusions.
const REMOVED_GLOBAL_FX = new Set();

export function installBattleFxAssetBudgetFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRequestGlobalFx = BattleRenderer.prototype.requestGlobalFx;
  BattleRenderer.prototype.requestGlobalFx = function requestOnlyUsedGlobalFx(name, ...args) {
    if (REMOVED_GLOBAL_FX.has(String(name))) {
      this.fxPacks?.delete?.(String(name));
      this.fxLoading?.delete?.(String(name));
      return Promise.resolve(null);
    }
    return previousRequestGlobalFx.call(this, name, ...args);
  };

  globalThis.__verifyBattleFxAssetBudgetFinal = () => ({
    enabled: true,
    removedGlobalFx: [...REMOVED_GLOBAL_FX],
  });
}

export function scheduleBattleFxAssetBudgetFinal() {
  queueMicrotask(() => installBattleFxAssetBudgetFinal());
}
