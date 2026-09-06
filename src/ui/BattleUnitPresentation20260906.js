import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import { CELL_W } from '../battle/BattleConfig.js';
import { normalizeCraftQuality, resolveCraftQuality } from '../core/constants.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleUnitPresentation20260906');
const PRESENTATION_FLAG = '__pvpBossUnitPresentation20260906';
const HP_BAR_HEIGHT = 5;
const HP_BAR_RADIUS = 4;
const HP_BAR_WIDTH_RATIO = 0.78;
const PEDESTAL_MIN_W = 38;
const PEDESTAL_MAX_W = 66;
const PEDESTAL_ASPECT = 0.27;
const PEDESTAL_CACHE_LIMIT = 36;
const STAR_PEDESTAL_OFFSET = 13;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex) {
  const value = String(hex ?? '#ffffff').replace('#', '').trim();
  const expanded = value.length === 3
    ? value.split('').map((part) => `${part}${part}`).join('')
    : value.padEnd(6, 'f').slice(0, 6);
  const number = Number.parseInt(expanded, 16);
  if (!Number.isFinite(number)) return { r: 255, g: 255, b: 255 };
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(Math.max(0, radius), width / 2, height / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function isPvpOrBossRenderer(renderer) {
  return renderer?.[PRESENTATION_FLAG] === true;
}

function createPedestalSurface(width, height, color, lowQuality) {
  let surface = null;
  if (typeof OffscreenCanvas === 'function') {
    surface = new OffscreenCanvas(width, height);
  } else if (typeof document !== 'undefined' && document.createElement) {
    surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
  }
  if (!surface) return null;

  const ctx = surface.getContext?.('2d');
  if (!ctx) return null;

  const cx = width / 2;
  const cy = height * 0.49;
  const outerRx = width * 0.43;
  const outerRy = height * 0.28;
  const ringRx = width * 0.38;
  const ringRy = height * 0.215;
  const innerRx = width * 0.29;
  const innerRy = height * 0.115;

  // 参考软泥怪脚下底座：贴地扁圆，外圈发光，中央透暗，不做“品质文字牌”。
  ctx.clearRect(0, 0, width, height);

  if (!lowQuality) {
    ctx.fillStyle = rgba(color, 0.10);
    ctx.beginPath();
    ctx.ellipse(cx, cy, outerRx * 1.13, outerRy * 1.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(color, 0.18);
    ctx.beginPath();
    ctx.ellipse(cx, cy, outerRx * 1.02, outerRy * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 地面阴影让人物像真正站在圆环上，而不是悬在发光贴纸上。
  ctx.fillStyle = 'rgba(5,8,12,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + height * 0.035, ringRx, ringRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // 品质色主环。
  ctx.strokeStyle = rgba(color, lowQuality ? 0.78 : 0.96);
  ctx.lineWidth = lowQuality ? 2 : 2.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, ringRx, ringRy, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 第二层内圈，让底座有软泥怪参考图里的“双层圆盘”质感。
  if (!lowQuality) {
    ctx.strokeStyle = rgba(color, 0.52);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.4, ringRx * 0.86, ringRy * 0.73, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 中央只轻微压暗，保持“圆环”而不是实心色块。
  ctx.fillStyle = 'rgba(7,10,16,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 0.6, innerRx, innerRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // 上沿白亮反光，模拟参考图粉/蓝底座的高亮边。
  if (!lowQuality) {
    ctx.strokeStyle = 'rgba(255,255,255,0.58)';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy - 0.25,
      ringRx * 0.88,
      ringRy * 0.82,
      0,
      Math.PI * 1.08,
      Math.PI * 1.92,
    );
    ctx.stroke();
  }

  return surface;
}

function pedestalSurface(renderer, craftQuality, width, lowQuality) {
  const cq = normalizeCraftQuality(craftQuality);
  const quality = resolveCraftQuality(cq);
  const widthBucket = Math.round(width / 4) * 4;
  const height = Math.max(14, Math.round(widthBucket * PEDESTAL_ASPECT));
  const key = `${cq}:${widthBucket}:${lowQuality ? 1 : 0}`;

  renderer.__qualityPedestalCache20260906 ??= new Map();
  const cache = renderer.__qualityPedestalCache20260906;
  if (cache.has(key)) return { image: cache.get(key), width: widthBucket, height };

  const image = createPedestalSurface(widthBucket, height, quality.color, lowQuality);
  if (image) {
    if (cache.size >= PEDESTAL_CACHE_LIMIT) cache.clear();
    cache.set(key, image);
  }
  return { image, width: widthBucket, height };
}

function drawPedestalFallback(ctx, color, cx, cy, width, height, lowQuality) {
  ctx.save();
  if (!lowQuality) {
    ctx.fillStyle = rgba(color, 0.12);
    ctx.beginPath();
    ctx.ellipse(cx, cy, width * 0.51, height * 0.54, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(5,8,12,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, width * 0.39, height * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(color, lowQuality ? 0.78 : 0.96);
  ctx.lineWidth = lowQuality ? 2 : 2.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width * 0.39, height * 0.25, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawQualityPedestalRing(renderer, ctx, unit, layout) {
  if (layout.isDying) return;
  const cq = normalizeCraftQuality(unit.craftQuality);
  const quality = resolveCraftQuality(cq);
  const lowQuality = Boolean(renderer._lowQuality);
  const targetWidth = clamp(layout.circleSize * 0.98, PEDESTAL_MIN_W, PEDESTAL_MAX_W);
  const cached = pedestalSurface(renderer, cq, targetWidth, lowQuality);
  const width = cached.width || targetWidth;
  const height = cached.height || Math.max(14, width * PEDESTAL_ASPECT);
  const x = layout.cx - width / 2;
  const y = layout.footY - height * 0.46;

  if (cached.image) {
    ctx.drawImage(cached.image, x, y, width, height);
  } else {
    drawPedestalFallback(
      ctx,
      quality.color,
      layout.cx,
      layout.footY + height * 0.02,
      width,
      height,
      lowQuality,
    );
  }
}

function drawHpBar(ctx, unit, layout) {
  const width = CELL_W * HP_BAR_WIDTH_RATIO;
  const height = HP_BAR_HEIGHT;
  const x = layout.cx - width / 2;
  // 对齐旧版“bottom:3px;height:5px”规范：cellBottom - 8。
  const y = layout.cellBottom - 8;
  const ratio = clamp(Number(unit.hp) / Math.max(1, Number(unit.maxHp) || 1), 0, 1);
  const fill = unit.team === 'player'
    ? '#47b36f'
    : unit.team === 'enemy'
      ? '#d86a4d'
      : '#c9a94d';

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, HP_BAR_RADIUS);
  ctx.fillStyle = 'rgba(25,28,25,0.28)';
  ctx.fill();

  if (ratio > 0) {
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, HP_BAR_RADIUS);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width * ratio, height);
    ctx.restore();
  }

  roundedRectPath(ctx, x, y, width, height, HP_BAR_RADIUS);
  ctx.strokeStyle = 'rgba(255,255,255,0.70)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawAuthorityStars(renderer, ctx, unit, cx, footY, circleSize) {
  const level = Math.max(0, Math.floor(Number(unit.strengthLv ?? unit.star) || 0));
  if (level <= 0) return;

  const rows = [];
  let remainingLevel = level;
  while (remainingLevel > 0) {
    const row = Math.min(7, remainingLevel);
    rows.push(row);
    remainingLevel -= row;
  }

  const starSize = clamp(circleSize * 0.135, 9, 12);
  const firstY = footY + STAR_PEDESTAL_OFFSET;

  rows.forEach((rowStars, rowIndex) => {
    let remaining = rowStars;
    let x = cx - rowStars * starSize / 2;
    const y = firstY + rowIndex * (starSize + 1);
    while (remaining > 0) {
      const chunk = Math.min(6, remaining);
      const image = renderer.partsCache.get(`single_star_${chunk}`);
      if (image) SpriteAtlas.drawContained(ctx, image, x, y, chunk * starSize, starSize);
      x += chunk * starSize;
      remaining -= chunk;
    }
  });
}

export function installBattleUnitPresentation20260906() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithPvpBossUnitPresentation20260906(...args) {
    const result = await previousRenderBattle.apply(this, args);
    if (this.renderer) this.renderer[PRESENTATION_FLAG] = Boolean(this.pvp);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpBossUnitPresentation20260906(...args) {
    if (this.renderer) {
      this.renderer[PRESENTATION_FLAG] = false;
      this.renderer.__qualityPedestalCache20260906?.clear?.();
    }
    return previousDestroy.apply(this, args);
  };

  const previousHalo = BattleRenderer.prototype.drawUnitHalo;
  BattleRenderer.prototype.drawUnitHalo = function drawPvpBossQualityPedestal20260906(ctx, unit, layout) {
    if (!isPvpOrBossRenderer(this)) return previousHalo.call(this, ctx, unit, layout);
    return drawQualityPedestalRing(this, ctx, unit, layout);
  };

  const previousStars = BattleRenderer.prototype.drawStrengthStars;
  BattleRenderer.prototype.drawStrengthStars = function drawPvpBossStars20260906(ctx, unit, cx, footY, circleSize) {
    if (!isPvpOrBossRenderer(this)) return previousStars.call(this, ctx, unit, cx, footY, circleSize);
    return drawAuthorityStars(this, ctx, unit, cx, footY, circleSize);
  };

  const previousUi = BattleRenderer.prototype.drawUnitUi;
  BattleRenderer.prototype.drawUnitUi = function drawPvpBossUnitUi20260906(ctx, unit, layout, engine) {
    if (!isPvpOrBossRenderer(this)) return previousUi.call(this, ctx, unit, layout, engine);
    if (layout.isDying) return;

    this.drawUnitName(
      ctx,
      layout.portraitX,
      layout.cellTop + 2,
      layout.portraitW,
      unit.customName || unit.name,
      unit.team,
    );

    drawHpBar(ctx, unit, layout);
    // 底座已在 drawUnitHalo 阶段绘制，保证它永远位于单位脚下而不是盖住角色。
    if (!this._lowQuality) {
      this.drawStrengthStars(ctx, unit, layout.cx, layout.footY, layout.circleSize);
    }
    if (engine) this.drawStatusEffects(ctx, unit, engine, layout);
  };

  if (typeof window !== 'undefined') {
    window.__verifyBattleUnitPresentation20260906 = () => ({
      enabled: true,
      scope: 'PVP/BOSS only',
      qualityPedestal: 'flat cached oval ring under the feet; quality-colored rim + dark translucent center; no text plate',
      pedestalRendering: 'pre-rendered offscreen cache by quality/size bucket',
      animatedQualityPackPerUnit: false,
      hpBar: {
        widthRatio: HP_BAR_WIDTH_RATIO,
        height: HP_BAR_HEIGHT,
        radius: HP_BAR_RADIUS,
        bottom: 3,
      },
      starSize: '9~12px; max 7 per row; unlimited rows',
      automaticVisualDowngrade: false,
      manualLowQualityPreserved: true,
    });
  }
}
