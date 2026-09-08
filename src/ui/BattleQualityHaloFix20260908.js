import { resolveCraftQuality } from '../core/constants.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleQualityHaloFix20260908');
const HALO_RX = 31;
const HALO_RY = 14;

function rgb(hex) {
  const text = String(hex || '#ffffff').replace('#', '');
  const value = Number.parseInt(text.length === 3
    ? text.split('').map((c) => c + c).join('')
    : text.padEnd(6, 'f').slice(0, 6), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function installBattleQualityHaloFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  const proto = BattleRenderer.prototype;
  function drawFixedQualityHalo20260908(ctx, unit, layout) {
    if (!ctx || !layout || layout.isDying) return;
    const quality = resolveCraftQuality(unit?.craftQuality ?? 1);
    const { r, g, b } = rgb(quality.color);
    const cx = Number(layout.cx) || 0;
    const cy = (Number(layout.footY) || 0) + 2;

    ctx.save();
    // Fixed dimensions: large/small unit art must never resize the quality circle.
    const fill = ctx.createRadialGradient(cx, cy, 2, cx, cy, HALO_RX + 5);
    fill.addColorStop(0, `rgba(${r},${g},${b},0.18)`);
    fill.addColorStop(0.65, `rgba(${r},${g},${b},0.10)`);
    fill.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, HALO_RX + 5, HALO_RY + 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark separator + bright colored stroke makes the ring readable over grass/ice/sand.
    ctx.beginPath();
    ctx.ellipse(cx, cy, HALO_RX, HALO_RY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(10,18,22,0.82)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.shadowColor = `rgba(${r},${g},${b},0.95)`;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.98)`;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Inner highlight keeps low-quality grey/white rings visible without changing size.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,255,255,0.38)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, HALO_RX - 3, HALO_RY - 2, 0, Math.PI * 1.08, Math.PI * 1.88);
    ctx.stroke();
    ctx.restore();
  }

  drawFixedQualityHalo20260908.__qualityHaloFixed20260908 = true;
  proto.drawUnitHalo = drawFixedQualityHalo20260908;
}
