import {
  CELL_H,
  CELL_W,
  cellCenterY,
  fracColToCenterX,
} from '../battle/BattleConfig.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { getAttackPattern, getCardTraits } from '../core/CardTraitRegistry.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleCardTraitFxFinal');

const PROFILES = Object.freeze({
  fire: { stroke: '#ff9a45', glow: '255,108,34' },
  ice: { stroke: '#8eeaff', glow: '72,197,255' },
  poison: { stroke: '#9cf06b', glow: '92,221,76' },
  lightning: { stroke: '#ffe66f', glow: '255,215,58' },
  drain: { stroke: '#e395ff', glow: '190,84,225' },
  area: { stroke: '#ff8d78', glow: '255,99,79' },
  normal: { stroke: '#fff0a0', glow: '255,232,126' },
});

// 原始卡牌数据并不是所有特殊攻击都带有可直接推导的 trait 字段，
// 对标志性单位做显式归类，避免火龙/蘑菇仙人/黑暗精灵仍显示普通攻击光。
const SIGNATURE_PROFILES = new Map([
  [56, 'fire'],       // 火龙：火焰前方范围攻击
  [58, 'area'],       // 蘑菇仙人：全场法阵攻击
  [46, 'lightning'],  // 黑暗精灵：同行最远目标雷击
  [77, 'ice'],        // 极寒大法师
  [84, 'ice'],        // 冰霜射手
  [90, 'fire'],       // 火图腾
  [63, 'poison'],     // 毒系单位
  [75, 'poison'],
  [97, 'drain'],      // 嗜血/吸血系
  [98, 'drain'],
  [107, 'drain'],
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveProfile(cardId) {
  const id = Number(cardId) || 0;
  const signature = SIGNATURE_PROFILES.get(id);
  if (signature) return signature;

  const traits = getCardTraits(id);
  const pattern = getAttackPattern(id);
  if (traits.burnDps || traits.burnMelee) return 'fire';
  if (traits.freezeChance || traits.freezeMeleeSec || traits.slowSec) return 'ice';
  if (traits.poisonChance || traits.poisonDps) return 'poison';
  if (traits.stunChance || traits.firstHitStunSec || traits.rootChance) return 'lightning';
  if (traits.lifestealRatio || traits.healOnHitRatio || traits.healMaxHpOnHit) return 'drain';
  if (pattern && pattern.kind !== 'forward') return 'area';
  return 'normal';
}

function decorateFeedback(engine) {
  for (const fx of engine?.cardFeedbackFx ?? []) {
    if (fx.kind !== 'attack') continue;
    fx.profile ??= resolveProfile(fx.cardId);
    fx.attackPattern ??= getAttackPattern(fx.cardId)?.kind ?? 'single';
  }
}

function drawGlow(ctx, x, y, radius, rgb, alpha) {
  if (alpha <= 0.001) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(2, radius));
  gradient.addColorStop(0, `rgba(${rgb},0.58)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEllipse(ctx, x, y, rx, ry, stroke, alpha, width = 2) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLightning(ctx, x, y, direction, progress, alpha, stroke) {
  const length = CELL_W * (0.2 + progress * 0.25);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - CELL_H * 0.16);
  ctx.lineTo(x + direction * length * 0.35, y - CELL_H * 0.04);
  ctx.lineTo(x + direction * length * 0.12, y + CELL_H * 0.02);
  ctx.lineTo(x + direction * length, y + CELL_H * 0.13);
  ctx.stroke();
  ctx.restore();
}

function drawTraitAccents(ctx, engine) {
  decorateFeedback(engine);
  for (const fx of engine?.cardFeedbackFx ?? []) {
    if (fx.kind !== 'attack') continue;
    const duration = Math.max(0.001, finite(fx.duration, 0.28));
    const progress = Math.max(0, Math.min(1, finite(fx.t) / duration));
    const alpha = 1 - progress;
    const direction = fx.team === 'enemy' ? -1 : 1;
    const x = fracColToCenterX(finite(fx.col)) + direction * CELL_W * 0.3;
    const y = cellCenterY(Math.max(0, Math.min(4, Math.round(finite(fx.lane, 2))))) - CELL_H * 0.08;
    const profile = PROFILES[fx.profile] ?? PROFILES.normal;

    drawGlow(ctx, x, y, CELL_W * (0.12 + progress * 0.2), profile.glow, alpha * 0.72);

    const areaPattern = ['all', 'square', 'square_self', 'cross', 'x', 'rect', 'row_splash', 'col_splash']
      .includes(fx.attackPattern);
    const rx = CELL_W * (areaPattern ? 0.18 + progress * 0.48 : 0.08 + progress * 0.22);
    const ry = CELL_H * (areaPattern ? 0.08 + progress * 0.23 : 0.04 + progress * 0.11);
    drawEllipse(ctx, x, y, rx, ry, profile.stroke, alpha * 0.9, areaPattern ? 3 : 2);

    if (fx.profile === 'lightning') {
      drawLightning(ctx, x, y, direction, progress, alpha, profile.stroke);
    }
    if (fx.profile === 'ice') {
      drawEllipse(ctx, x, y, rx * 0.58, ry * 1.5, '#e5fbff', alpha * 0.74, 1.5);
    }
    if (fx.profile === 'poison') {
      drawEllipse(ctx, x - direction * CELL_W * 0.08, y - CELL_H * 0.08, rx * 0.35, ry * 0.55, '#d5ffc1', alpha * 0.7, 1.5);
    }
    if (fx.profile === 'drain') {
      drawEllipse(ctx, x, y, rx * 0.52, ry * 0.52, '#ffe4ff', alpha * 0.72, 1.5);
    }
  }
}

export function installBattleCardTraitFxFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousDrawFloats = BattleRenderer.prototype.drawFloats;
  BattleRenderer.prototype.drawFloats = function drawTraitAwareCardFeedback(ctx, engine) {
    const result = previousDrawFloats.call(this, ctx, engine);
    drawTraitAccents(ctx, engine);
    return result;
  };

  window.__resolveBattleCardTraitFxProfile = resolveProfile;
  window.__verifyBattleCardTraitFxFinal = () => ({
    enabled: true,
    fire: resolveProfile(56),
    ice: resolveProfile(77),
    poison: resolveProfile(63),
    lightning: resolveProfile(46),
    drain: resolveProfile(97),
    area: resolveProfile(58),
  });
}
