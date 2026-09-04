import { BattleRenderer } from '../battle/BattleRenderer.js';
import { normalizeCraftQuality, resolveCraftQuality } from '../core/constants.js';
import { installBattleMushroomFxCleanupFinal } from '../battle/BattleMushroomFxCleanupFinal.js';
import { scheduleBattlefieldRuntimeStability20260810 } from './BattlefieldRuntimeStability20260810.js';
import { schedulePvpAuthorityVisualLifetimeFinal } from './PvpAuthorityVisualLifetimeFinal.js';
import { scheduleBattleFxAssetBudgetFinal } from './BattleFxAssetBudgetFinal.js';
import { scheduleBattleAttackTimingCalibrationFinal } from './BattleAttackTimingCalibrationFinal.js';
import { scheduleProjectileLaunchOwnershipFinal } from './ProjectileLaunchOwnershipFinal.js';
import { reassertBattleStatusFxPerformanceFinal } from './BattleStatusFxPerformanceFinal.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleUnitHaloFinal');

function parseHexColor(hex) {
  const value = String(hex ?? '#8aa0a0').replace('#', '');
  const full = value.length === 3
    ? value.split('').map((ch) => ch + ch).join('')
    : value.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * 战场品质底座：只在当前主 Canvas 画几何图形，不创建 radialGradient / 离屏 Canvas / DOM 读取。
 * 这样保留战斗热路径性能约束，同时恢复用户要求的“品质底座 + 品质闪烁”。
 */
export function drawCraftQualityPedestal(ctx, unit, layout) {
  if (!layout || layout.isDying) return;
  const quality = normalizeCraftQuality(unit?.craftQuality);
  const color = resolveCraftQuality(quality).color;
  const { r, g, b } = parseHexColor(color);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now / 1000 + (Number(unit?.uid) || 0) * 0.071;
  const width = Math.max(34, layout.circleSize * (0.98 + quality * 0.025));
  const height = width * 0.34;
  const x = layout.cx;
  const y = layout.footY - layout.circleSize * 0.105;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + height * 0.08, width * 0.53, height * 0.55, 0, 0, Math.PI * 2);
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = 'rgb(10,16,21)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(x, y, width * 0.49, height * 0.48, 0, 0, Math.PI * 2);
  ctx.globalAlpha = 0.24 + quality * 0.035;
  ctx.fillStyle = `rgb(${Math.round(r * 0.42)},${Math.round(g * 0.42)},${Math.round(b * 0.42)})`;
  ctx.fill();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = quality >= 5 ? 2.5 : quality >= 4 ? 2.1 : 1.6;
  ctx.stroke();

  // Use the original animated qualityLightCircle pack, flattened into the
  // battlefield perspective. This is the game's real pedestal animation,
  // not a procedural approximation.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(0, y);
  ctx.scale(1, 0.36);
  ctx.translate(0, -y);
  // 大军团场景停用逐单位骨骼光圈，只保留下方的廉价品质底座。
  // 这样品质仍可辨认，同时避免几十个单位每帧各跑一套动画包。
  const allowAnimatedPack = !this._lowQuality && Number(this._visibleUnitCount ?? 0) < 60;
  const originalPackRendered = allowAnimatedPack && this.drawGlobalFxPack?.(
    ctx,
    'qualityLightCircle',
    x,
    y,
    width * 1.36,
    elapsed,
  ) === true;
  ctx.restore();

  // Keep a restrained inner ring while the asset is loading.
  ctx.beginPath();
  ctx.ellipse(x, y, width * 0.34, height * 0.31, 0, 0, Math.PI * 2);
  ctx.globalAlpha = originalPackRendered ? 0.2 : 0.5;
  ctx.strokeStyle = quality === 1 ? 'rgb(150,150,150)' : 'rgb(245,252,255)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  this._unitHaloAudit ??= [];
  if (this._unitHaloAudit.length > 160) this._unitHaloAudit.length = 0;
  this._unitHaloAudit.push({
    uid: unit?.uid,
    quality,
    width,
    height,
    cellCircleSize: layout.circleSize,
    centerX: x,
    centerY: y,
    footY: layout.footY,
    pedestalLayers: 3,
    qualityPedestal: true,
    qualityShimmer: originalPackRendered,
    usesRadialGradient: false,
    usesOffscreenCanvas: false,
    animatedQualityLightCircle: originalPackRendered,
    highUnitCountThrottled: !allowAnimatedPack,
    sourcePack: 'qualityLightCircle',
  });
}

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
