import { normalizeCraftQuality } from '../core/constants.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleQualityHaloFix20260908');
// Reference pedestal is a wide, thin perspective ellipse. Dimensions are fixed
// so giant/small unit artwork cannot change the quality pedestal itself.
const HALO_RX = 38;
const HALO_RY = 11.5;

const QUALITY_PALETTES = Object.freeze({
  // 劣质：灰
  1: ['#626970', '#9ca4aa', '#e2e5e7', '#777e85'],
  // 普通：白
  2: ['#aeb8c1', '#f5f8fb', '#ffffff', '#d7e0e7'],
  // 优秀：绿
  3: ['#1f9d62', '#47cf79', '#eaffef', '#29b96b'],
  // 精良：青绿 → 青蓝 → 冰蓝高光 → 亮蓝
  4: ['#17ad9d', '#30d1de', '#e9ffff', '#238ff3'],
  // 完美：浅紫 → 亮紫 → 洋红 → 粉紫高光
  5: ['#9b66df', '#bf61ef', '#ffe7ff', '#e846bd'],
});

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(String(hex).replace('#', ''), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeRingGradient(ctx, cx, palette, alpha = 1) {
  const gradient = ctx.createLinearGradient(cx - HALO_RX, 0, cx + HALO_RX, 0);
  gradient.addColorStop(0, hexToRgba(palette[0], 0.9 * alpha));
  gradient.addColorStop(0.34, hexToRgba(palette[1], 0.98 * alpha));
  gradient.addColorStop(0.58, hexToRgba(palette[2], 1 * alpha));
  gradient.addColorStop(0.74, hexToRgba(palette[3], 0.98 * alpha));
  gradient.addColorStop(1, hexToRgba(palette[3], 0.84 * alpha));
  return gradient;
}

function ellipseArc(ctx, cx, cy, rx, ry, start, end) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, start, end);
}

export function installBattleQualityHaloFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  const proto = BattleRenderer.prototype;
  function drawReferenceQualityPedestal20260908(ctx, unit, layout) {
    if (!ctx || !layout || layout.isDying) return;
    const quality = normalizeCraftQuality(unit?.craftQuality ?? 1);
    const palette = QUALITY_PALETTES[quality] ?? QUALITY_PALETTES[2];
    const cx = Number(layout.cx) || 0;
    const cy = (Number(layout.footY) || 0) + 1;
    const isPerfect = quality === 5;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1) Feathered outer aura. It is deliberately only a glow around the ring:
    // the centre stays transparent instead of becoming a filled oval/shadow.
    ctx.shadowColor = hexToRgba(palette[1], 0.88);
    ctx.shadowBlur = isPerfect ? 13 : 10;
    ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 0.36);
    ctx.lineWidth = isPerfect ? 10 : 8;
    ellipseArc(ctx, cx, cy, HALO_RX + 1.5, HALO_RY + 0.8, 0, Math.PI * 2);
    ctx.stroke();

    // 2) Thin rear rim. Character art is rendered after this halo pass, so the
    // rear part naturally disappears behind the feet/body like the reference.
    ctx.shadowBlur = 5;
    ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 0.82);
    ctx.lineWidth = isPerfect ? 4.8 : 3.8;
    ellipseArc(ctx, cx, cy - 0.8, HALO_RX, HALO_RY, Math.PI, Math.PI * 2);
    ctx.stroke();

    // 3) Thick bright front edge: this is the important "energy donut" depth.
    ctx.shadowColor = hexToRgba(palette[3], 0.94);
    ctx.shadowBlur = isPerfect ? 10 : 8;
    ctx.strokeStyle = makeRingGradient(ctx, cx, palette, 1);
    ctx.lineWidth = isPerfect ? 9.2 : 7.2;
    ellipseArc(ctx, cx, cy, HALO_RX, HALO_RY, 0, Math.PI);
    ctx.stroke();

    // 4) A narrow inner/front highlight creates the icy white glint on refined
    // and the pink/lavender glint on perfect without painting the centre.
    ctx.shadowBlur = 3;
    ctx.strokeStyle = hexToRgba(palette[2], quality >= 4 ? 0.92 : 0.66);
    ctx.lineWidth = quality >= 4 ? 2.4 : 1.8;
    ellipseArc(ctx, cx + 3, cy - 0.6, HALO_RX - 7, HALO_RY - 3.6, 0.12 * Math.PI, 0.72 * Math.PI);
    ctx.stroke();

    // Side bulbs are subtle in blue and more pronounced in the thick purple
    // reference. Short arcs make the left/right ends look rounded rather than
    // like a flat neon outline.
    ctx.strokeStyle = hexToRgba(palette[1], 0.72);
    ctx.lineWidth = isPerfect ? 5.6 : 3.6;
    ctx.shadowBlur = isPerfect ? 7 : 4;
    ellipseArc(ctx, cx, cy, HALO_RX + 0.4, HALO_RY + 0.2, 0.78 * Math.PI, 1.17 * Math.PI);
    ctx.stroke();
    ellipseArc(ctx, cx, cy, HALO_RX + 0.4, HALO_RY + 0.2, -0.17 * Math.PI, 0.18 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  drawReferenceQualityPedestal20260908.__qualityHaloFixed20260908 = true;
  proto.drawUnitHalo = drawReferenceQualityPedestal20260908;
}
