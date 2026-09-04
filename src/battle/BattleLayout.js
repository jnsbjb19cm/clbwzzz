import profiles from './battleLayoutProfiles.json' with { type: 'json' };
import {
  BATTLE_SAFE_H,
  GAME_H,
  GAME_VISUAL_H,
  GAME_W,
  LEFT_COLUMN_W,
  RIGHT_COLUMN_W,
} from './BattleConfig.js';
import { buildBattleGridMetrics } from './BattleGridMetrics.js';

function pickProfile(aspect) {
  for (const bucket of profiles.buckets) {
    const min = bucket.minAspect ?? 0;
    const max = bucket.maxAspect ?? Infinity;
    if (aspect >= min && aspect < max) return bucket;
  }
  return profiles.buckets[profiles.buckets.length - 1];
}

/**
 * 动态战斗布局
 * - 标定屏：1248 画布 FIT
 * - 宽屏 stretchCanvas：高度铺满 + 画布横向拉长(格子与基地右缘一起动，等比 scale)
 * @param {number} availW
 * @param {number} availH
 */
export function computeBattleLayout(availW, availH) {
  const w = Math.max(1, availW);
  const h = Math.max(1, availH);
  const aspect = w / h;
  const profile = pickProfile(aspect);

  const designAspect = profiles.designAspect ?? GAME_W / BATTLE_SAFE_H;
  const scaleW = w / GAME_W;
  const scaleH = h / BATTLE_SAFE_H;
  const stretchCanvas =
    !!profile.stretchCanvas ||
    (profile.id === 'design' && aspect >= designAspect);

  let scale;
  let offsetX;
  let offsetY;
  let canvasW;

  if (stretchCanvas) {
    scale = scaleH;
    canvasW = Math.max(GAME_W, w / scale);
    offsetX = 0;
    offsetY = 0;
  } else {
    // COVER：宽于标定贴宽(柱子顶左右边)，高于标定贴高；避免 1.56:1 等两侧柱子整体内缩
    scale = Math.max(scaleW, scaleH);
    canvasW = GAME_W;
    offsetX = (w - canvasW * scale) / 2;
    if (profile.alignY === 'center') {
      offsetY = (h - BATTLE_SAFE_H * scale) / 2;
    } else if (profile.alignY === 'top' || scaleW > scaleH) {
      offsetY = 0;
    } else {
      offsetY = (h - BATTLE_SAFE_H * scale) / 2;
    }
  }

  const metrics = buildBattleGridMetrics(canvasW);
  const scaledGameW = canvasW * scale;
  const scaledSafeH = BATTLE_SAFE_H * scale;
  const sideBleedPx = Math.max(0, (w - scaledGameW) / 2);
  const pinPillarsToViewport = !!profile.pinPillarsToViewport;
  const pillarRightX = offsetX + (canvasW - RIGHT_COLUMN_W) * scale;

  return {
    profileId: profile.id,
    profileLabel: profile.label,
    aspect,
    stretchCanvas,
    scale,
    offsetX,
    offsetY,
    canvasW,
    pinPillarsToViewport,
    scaledGameW,
    scaledSafeH,
    sideBleedPx,
    pillarLeftW: LEFT_COLUMN_W * scale,
    pillarRightW: RIGHT_COLUMN_W * scale,
    pillarLeftH: GAME_VISUAL_H * scale,
    pillarRightH: GAME_H * scale,
    pillarRightX,
    metrics,
  };
}

export function getBattleLayoutProfiles() {
  return profiles;
}