import { BattleRenderer } from '../battle/BattleRenderer.js';
import { drawCraftQualityPedestal } from './BattleUnitHaloGeometry20260905.js';
import { installBattleMushroomFxCleanupFinal } from '../battle/BattleMushroomFxCleanupFinal.js';
import { scheduleBattlefieldRuntimeStability20260810 } from './BattlefieldRuntimeStability20260810.js';
import { schedulePvpAuthorityVisualLifetimeFinal } from './PvpAuthorityVisualLifetimeFinal.js';
import { scheduleBattleFxAssetBudgetFinal } from './BattleFxAssetBudgetFinal.js';
import { scheduleBattleAttackTimingCalibrationFinal } from './BattleAttackTimingCalibrationFinal.js';
import { scheduleProjectileLaunchOwnershipFinal } from './ProjectileLaunchOwnershipFinal.js';
import { reassertBattleStatusFxPerformanceFinal } from './BattleStatusFxPerformanceFinal.js';

export { drawCraftQualityPedestal } from './BattleUnitHaloGeometry20260905.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleUnitHaloFinal');

export function installBattleUnitHaloFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleRenderer.prototype.drawUnitHalo = drawCraftQualityPedestal;
  installBattleMushroomFxCleanupFinal();

  globalThis.__verifyBattleUnitHaloFinal = () => {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView;
    return {
      enabled: true,
      qualityPedestal: true,
      qualityShimmer: true,
      usesRadialGradient: false,
      usesOffscreenCanvas: false,
      animatedQualityLightCircle: true,
      sourcePack: 'qualityLightCircle',
      compactFootMarker: false,
      finalRendererReasserted: BattleRenderer.prototype.drawUnitHalo === drawCraftQualityPedestal,
      runtime: view?.renderer?._unitHaloAudit ?? [],
    };
  };

  scheduleBattlefieldRuntimeStability20260810();
  schedulePvpAuthorityVisualLifetimeFinal();
  scheduleBattleFxAssetBudgetFinal();
  scheduleBattleAttackTimingCalibrationFinal();
  scheduleProjectileLaunchOwnershipFinal();

  // RuntimeStability 会在自己的微任务里移除旧的大型品质光圈；等这些“旧 final”全安装完，
  // 再把新的轻量品质底座作为真正最终 drawUnitHalo 放回去，避免再次被后装补丁清空。
  queueMicrotask(() => {
    BattleRenderer.prototype.drawUnitHalo = drawCraftQualityPedestal;
    reassertBattleStatusFxPerformanceFinal();
  });
}
