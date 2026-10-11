import { qualityPedestalGeometry } from './unitDisplayTuning.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';

// All modes share the visible oval, so stars and HP cannot drift independently.
export function unitFootUiGeometry(unit, cx, footY, circleSize) {
  const disc = qualityPedestalGeometry(cx, footY, circleSize, unit.craftQuality);
  const count = Math.min(99, Math.max(0, Math.floor(Number(unit.strengthLv ?? unit.star) || 0)));
  const rows = Math.ceil(count / 7);
  const gap = rows > 2 ? .5 : 1;
  const size = Math.min(Math.max(7, Math.min(10, circleSize * .105)),
    disc.rx * 1.4 / 7, (disc.ry * 1.35 - Math.max(0, rows - 1) * gap) / Math.max(1, rows));
  const firstY = disc.twoThirdsY - rows * size - Math.max(0, rows - 1) * gap;
  const stars = Array.from({length:rows}, (_, row) => {
    const amount = Math.min(7, count - row * 7);
    return {count:amount, x:disc.cx - amount * size / 2, y:firstY + row * (size + gap), size};
  });
  return {disc, stars, bar:{x:disc.cx - disc.rx * .54, y:disc.tangentY, width:disc.rx * 1.08, height:7}};
}

export function drawUnitFootStars(renderer, ctx, unit, cx, footY, circleSize) {
  const {stars} = unitFootUiGeometry(unit, cx, footY, circleSize);
  for (const row of stars) {
    let remaining = row.count, x = row.x;
    while (remaining > 0) {
      const chunk = Math.min(6, remaining), image = renderer.partsCache.get(`single_star_${chunk}`);
      if (image) SpriteAtlas.drawContained(ctx, image, x, row.y, chunk * row.size, row.size);
      x += chunk * row.size; remaining -= chunk;
    }
  }
}

export function drawUnitFootHp(ctx, unit, layout) {
  const {bar} = unitFootUiGeometry(unit, layout.cx, layout.footY, layout.circleSize);
  const ratio = Math.max(0, Math.min(1, (Number(unit.hp) || 0) / Math.max(1, Number(unit.maxHp) || 1)));
  ctx.save();
  ctx.fillStyle = 'rgba(8,18,10,.8)';ctx.fillRect(bar.x - 1, bar.y, bar.width + 2, bar.height + 1);
  ctx.fillStyle = '#f1ffe8';ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  ctx.fillStyle = '#18251a';ctx.fillRect(bar.x + 1, bar.y + 1, bar.width - 2, bar.height - 2);
  ctx.fillStyle = unit.team === 'player' ? '#73ff39' : unit.team === 'enemy' ? '#ff3838' : '#ffe04f';
  ctx.fillRect(bar.x + 1, bar.y + 1, (bar.width - 2) * ratio, bar.height - 2);
  ctx.restore();
}
