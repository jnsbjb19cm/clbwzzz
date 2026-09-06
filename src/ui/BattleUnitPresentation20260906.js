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
const QUALITY_PLATE_HEIGHT = 11;

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

function drawSoftQualityHalo(renderer, ctx, unit, layout) {
  if (layout.isDying) return;
  const quality = resolveCraftQuality(normalizeCraftQuality(unit.craftQuality));
  const color = quality.color;
  const { cx, footY, circleSize } = layout;
  const lowQuality = Boolean(renderer._lowQuality);

  ctx.save();
  // 软填充椭圆，不再使用硬描边大圈。完美/精良只换品质色，几何保持一致。
  const layers = lowQuality
    ? [[0.94, 0.22]]
    : [[1.18, 0.10], [0.96, 0.18], [0.76, 0.27]];
  for (const [scale, alpha] of layers) {
    ctx.fillStyle = rgba(color, alpha);
    ctx.beginPath();
    ctx.ellipse(
      cx,
      footY + circleSize * 0.04,
      circleSize * 0.64 * scale,
      circleSize * 0.205 * scale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();

  // 正常画质始终保留原品质光效包，不再按“单位数>=N”删除；显式低画质才省略动画层。
  if (!lowQuality) {
    const now = performance.now() / 1000;
    renderer.drawGlobalFxPack(
      ctx,
      'qualityLightCircle',
      cx,
      footY - circleSize * 0.14,
      circleSize * 1.42,
      now,
    );
  }
}

function drawQualityPedestal(ctx, unit, layout) {
  const quality = resolveCraftQuality(normalizeCraftQuality(unit.craftQuality));
  const color = quality.color;
  const width = clamp(layout.circleSize * 1.08, 42, 68);
  const height = QUALITY_PLATE_HEIGHT;
  const x = layout.cx - width / 2;
  const y = layout.footY + 1;

  ctx.save();
  ctx.shadowColor = rgba(color, 0.72);
  ctx.shadowBlur = 7;
  roundedRectPath(ctx, x, y, width, height, 5);
  ctx.fillStyle = 'rgba(7,10,15,0.88)';
  ctx.fill();

  ctx.shadowBlur = 0;
  roundedRectPath(ctx, x, y, width, height, 5);
  ctx.strokeStyle = rgba(color, 0.96);
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // 中央品质标签沿用项目实际 1~5 制作品质名称：劣质/普通/优秀/精良/完美。
  ctx.font = 'bold 7px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(quality.name, layout.cx, y + height / 2 + 0.25);
  ctx.restore();

  return { x, y, width, height };
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

  // 每行最多 7 星；8+ 自动换第二行，15+ 继续换行，绝不截断真实强化等级。
  const rows = [];
  let remainingLevel = level;
  while (remainingLevel > 0) {
    const row = Math.min(7, remainingLevel);
    rows.push(row);
    remainingLevel -= row;
  }

  // 保持之前确定的星级视觉尺寸，不因单位数变化：9~12px，随单位底座轻微缩放。
  const starSize = clamp(circleSize * 0.135, 9, 12);
  const firstY = footY + QUALITY_PLATE_HEIGHT + 3;

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
    if (this.renderer) this.renderer[PRESENTATION_FLAG] = false;
    return previousDestroy.apply(this, args);
  };

  const previousHalo = BattleRenderer.prototype.drawUnitHalo;
  BattleRenderer.prototype.drawUnitHalo = function drawPvpBossQualityHalo20260906(ctx, unit, layout) {
    if (!isPvpOrBossRenderer(this)) return previousHalo.call(this, ctx, unit, layout);
    return drawSoftQualityHalo(this, ctx, unit, layout);
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
    drawQualityPedestal(ctx, unit, layout);
    // 星级只在“用户明确开启低画质”时省略；单位多本身绝不会触发低画质。
    if (!this._lowQuality) {
      this.drawStrengthStars(ctx, unit, layout.cx, layout.footY, layout.circleSize);
    }
    if (engine) this.drawStatusEffects(ctx, unit, engine, layout);
  };

  if (typeof window !== 'undefined') {
    window.__verifyBattleUnitPresentation20260906 = () => ({
      enabled: true,
      scope: 'PVP/BOSS only',
      qualityPedestal: 'thin dark rounded plate + quality border/glow + label',
      halo: 'soft filled quality glow; animated pack preserved at normal quality',
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
