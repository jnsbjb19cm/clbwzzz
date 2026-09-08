import { BattleRenderer } from '../battle/BattleRenderer.js';
import { cellCenterX, cellCenterY } from '../battle/BattleConfig.js';
import {
  getCraftMaterialImage,
  getCraftMaterialSprite,
} from './SmithyMaterialArtwork.js';

const INSTALL_FLAG = Symbol.for('clbwz.battleLootMaterialIconFix20260908');
const IMAGE_CACHE = new Map();

function loadImage(url) {
  if (!url || typeof Image === 'undefined') return null;
  if (IMAGE_CACHE.has(url)) return IMAGE_CACHE.get(url);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
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

function drawMaterialIcon(ctx, drop, now) {
  const art = materialArt(drop?.itemId);
  const image = art?.image;
  if (!image?.complete || Number(image.naturalWidth) <= 0) return false;

  const age = now - Number(drop.createdAt || 0);
  if (age < 0 || age > 3.2) return false;
  const appear = Math.min(1, age / 0.18);
  const fade = age > 2.55 ? Math.max(0, (3.2 - age) / 0.65) : 1;
  const alpha = appear * fade;
  if (alpha <= 0) return false;

  const cx = cellCenterX(drop.col);
  const cy = cellCenterY(drop.lane) - 18 - Math.sin(age * 5.5) * 5 - Math.min(13, age * 5);
  const size = 46 + Math.sin(age * 6) * 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(255,224,92,.95)';
  ctx.shadowBlur = 8;
  if (art.crop) {
    ctx.drawImage(
      image,
      art.crop.x, art.crop.y, art.crop.width, art.crop.height,
      cx - size / 2, cy - size / 2, size, size,
    );
  } else {
    // Preserve the source aspect ratio: parchment/charm/DNA art should not be
    // squashed into a square merely because the legacy atlas cells are square.
    const sourceW = Math.max(1, Number(image.naturalWidth) || 1);
    const sourceH = Math.max(1, Number(image.naturalHeight) || 1);
    const scale = Math.min(size / sourceW, size / sourceH);
    const width = sourceW * scale;
    const height = sourceH * scale;
    ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
  }
  ctx.restore();
  return true;
}

export function installBattleLootMaterialIconFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  preloadCraftMaterials();

  const base = BattleRenderer.prototype.drawLootDrops;
  if (base?.__craftMaterialIcons20260908) return;

  function drawLootDropsWithCraftMaterialIcons20260908(ctx, engine) {
    const result = base.call(this, ctx, engine);
    const now = Number(engine?.time) || 0;
    for (const drop of engine?.lootDrops ?? []) drawMaterialIcon(ctx, drop, now);
    return result;
  }
  drawLootDropsWithCraftMaterialIcons20260908.__craftMaterialIcons20260908 = true;
  BattleRenderer.prototype.drawLootDrops = drawLootDropsWithCraftMaterialIcons20260908;
}
