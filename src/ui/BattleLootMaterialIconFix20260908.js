import { BattleRenderer } from '../battle/BattleRenderer.js';
import { cellCenterX, cellCenterY } from '../battle/BattleConfig.js';
import {
  getCraftMaterialImage,
  getCraftMaterialSprite,
} from './SmithyMaterialArtwork.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleLootMaterialIconFix20260908');
const IMAGE_CACHE = new Map();

function isCraftMaterialId(itemId) {
  const id = Number(itemId);
  return (id >= 50001 && id <= 50004)
    || (id >= 50011 && id <= 50014)
    || (id >= 50021 && id <= 50024)
    || (id >= 50031 && id <= 50034);
}

function isCraftMaterialDrop(drop) {
  return drop?.kind === 'craft-material' || isCraftMaterialId(drop?.itemId);
}

function loadImage(url) {
  if (!url || typeof Image === 'undefined') return null;
  if (IMAGE_CACHE.has(url)) return IMAGE_CACHE.get(url);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  // Start decoding immediately. drawMaterialIcon still checks complete/naturalWidth,
  // so a decode rejection cannot break battle rendering.
  void image.decode?.().catch?.(() => {});
  IMAGE_CACHE.set(url, image);
  return image;
}

function materialArt(itemId) {
  const id = Number(itemId);
  const direct = getCraftMaterialImage(id);
  if (direct) return { image: loadImage(direct), crop: null };

  const sprite = getCraftMaterialSprite(id);
  if (sprite) {
    return {
      image: loadImage(sprite.image),
      crop: {
        x: Number(sprite.x) || 0,
        y: Number(sprite.y) || 0,
        width: Number(sprite.width) || 1,
        height: Number(sprite.height) || 1,
      },
    };
  }
  return null;
}

function preloadCraftMaterials() {
  for (let level = 1; level <= 4; level += 1) {
    materialArt(50000 + level); // parchment
    materialArt(50010 + level); // gem
    materialArt(50020 + level); // charm
    materialArt(50030 + level); // DNA
  }
}

function drawDropLabel(ctx, cx, cy, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff6bd';
  ctx.strokeStyle = 'rgba(35,48,31,.92)';
  ctx.lineWidth = 3;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeText('掉落', cx, cy + size * 0.68);
  ctx.fillText('掉落', cx, cy + size * 0.68);
  ctx.restore();
}

function drawMaterialIcon(ctx, drop, now) {
  const art = materialArt(drop?.itemId);
  if (!art) return false;

  const age = now - Number(drop.createdAt || 0);
  if (age < 0 || age > 3.2) return true;
  const appear = Math.min(1, age / 0.18);
  const fade = age > 2.55 ? Math.max(0, (3.2 - age) / 0.65) : 1;
  const alpha = appear * fade;
  if (alpha <= 0) return true;

  const cx = cellCenterX(drop.col);
  const cy = cellCenterY(drop.lane) - 18 - Math.sin(age * 5.5) * 5 - Math.min(13, age * 5);
  const size = 48 + Math.sin(age * 6) * 2;
  const image = art.image;

  // The old renderer used a rotated yellow square whenever preload_items had no
  // sprite. 500xx smithy materials intentionally live outside that atlas, so
  // NEVER fall back to that placeholder. While a large PNG is still decoding,
  // keep only the drop glow/label; the real artwork appears as soon as ready.
  ctx.save();
  ctx.globalAlpha = alpha;
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.82);
  glow.addColorStop(0, 'rgba(255,248,178,.84)');
  glow.addColorStop(0.5, 'rgba(117,218,255,.36)');
  glow.addColorStop(1, 'rgba(117,218,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.82, 0, Math.PI * 2);
  ctx.fill();

  if (image?.complete && Number(image.naturalWidth) > 0) {
    ctx.shadowColor = 'rgba(255,224,92,.95)';
    ctx.shadowBlur = 8;
    if (art.crop) {
      ctx.drawImage(
        image,
        art.crop.x, art.crop.y, art.crop.width, art.crop.height,
        cx - size / 2, cy - size / 2, size, size,
      );
    } else {
      const sourceW = Math.max(1, Number(image.naturalWidth) || 1);
      const sourceH = Math.max(1, Number(image.naturalHeight) || 1);
      const scale = Math.min(size / sourceW, size / sourceH);
      const width = sourceW * scale;
      const height = sourceH * scale;
      ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
    }
  }
  ctx.restore();

  drawDropLabel(ctx, cx, cy, size, alpha);
  return true;
}

export function installBattleLootMaterialIconFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  preloadCraftMaterials();

  const base = BattleRenderer.prototype.drawLootDrops;
  if (base?.__craftMaterialIcons20260908) return;

  function drawLootDropsWithCraftMaterialIcons20260908(ctx, engine) {
    const drops = Array.isArray(engine?.lootDrops) ? engine.lootDrops : [];
    const craftDrops = drops.filter(isCraftMaterialDrop);
    const ordinaryDrops = drops.filter((drop) => !isCraftMaterialDrop(drop));

    // Critical: do not let the legacy renderer see 500xx drops. It has no atlas
    // rect for them and therefore paints the yellow placeholder diamond first.
    // Use a shallow view of the engine so simulation state is never mutated.
    const baseEngine = craftDrops.length
      ? Object.assign(Object.create(engine ?? null), engine ?? {}, { lootDrops: ordinaryDrops })
      : engine;
    const result = base.call(this, ctx, baseEngine);

    const now = Number(engine?.time) || 0;
    for (const drop of craftDrops) drawMaterialIcon(ctx, drop, now);
    return result;
  }
  drawLootDropsWithCraftMaterialIcons20260908.__craftMaterialIcons20260908 = true;
  BattleRenderer.prototype.drawLootDrops = drawLootDropsWithCraftMaterialIcons20260908;
}
