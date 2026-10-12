import { formatBattleDelta } from './BattleConfig.js';

// Shared by local, authoritative and orphan-unit feedback. Keep native font
// rendering: no digit atlas, binary thresholding, or extra text scaling.
export function drawBattleFloatText(ctx, amount, x, y, { alpha = 1, size = 20 } = {}) {
  const text = formatBattleDelta(amount);
  ctx.save();
  // Draw glyphs in CSS pixels: the battlefield canvas may be stretched
  // differently on X/Y. Keep the anchor, but don't squash the native font.
  const rect = ctx.canvas?.getBoundingClientRect?.();
  if (rect?.width > 0 && rect?.height > 0 && ctx.getTransform) {
    const m = ctx.getTransform();
    const scaleX = rect.width / ctx.canvas.width;
    const scaleY = rect.height / ctx.canvas.height;
    const anchorX = m.a * x + m.c * y + m.e;
    const anchorY = m.b * x + m.d * y + m.f;
    ctx.setTransform(1 / scaleX, 0, 0, 1 / scaleY, anchorX, anchorY);
    x = 0;
    y = 0;
  }
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
  ctx.font = `bold ${size}px SimSun, "宋体", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 2026-10-12 用户：2px 描边会被填色盖住内侧一半（外露黑边仅约 1px），改为 4px ✔
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = amount > 0 ? '#32e63b' : '#ef2929';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}
