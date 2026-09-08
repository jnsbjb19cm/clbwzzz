import { BattleRenderer } from '../battle/BattleRenderer.js';
import { cellCenterX, cellCenterY } from '../battle/BattleConfig.js';
import {
  getCraftMaterialImage,
  getCraftMaterialSprite,
  SMITHY_MATERIAL_ART,
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

function isPowderId(itemId) {
  const id = Number(itemId);
  return id >= 10001 && id <= 10005;
}

function isSpecialLootDrop(drop) {
  return drop?.kind === 'craft-material'
    || drop?.kind === 'strengthen-powder'
    || isCraftMaterialId(drop?.itemId)
    || isPowderId(drop?.itemId);
}

function loadImage(url) {
  if (!url || typeof Image === 'undefined') return null;
  if (IMAGE_CACHE.has(url)) return IMAGE_CACHE.get(url);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  void image.decode?.().catch?.(() => {});
  IMAGE_CACHE.set(url, image);
  return image;
}

function materialArt(itemId) {
  const id = Number(itemId);

  // BattleEngine.rollDeathDrop() drops 10001..10005 reinforcement powders.
  // They are not part of preload_items.json, which is why the legacy renderer
  // showed a rotated yellow placeholder. The smithy already owns the real
  // powder sprite sheet; levels 1..4 use its four vertical cells and level 5
  // deliberately reuses the highest-tier artwork rather than a placeholder.
  if (isPowderId(id)) {
    return {
      image: loadImage(SMITHY_MATERIAL_ART.powder),
      verticalTier: Math.min(4, Math.max(1, id - 10000)),
      verticalTiers: 4,
    };
  }

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

function preloadSpecialLoot() {
  for (let level = 1; level <= 4; level += 1) {
    materialArt(50000 + level); // parchment
    materialArt(50010 + level); // gem
    materialArt(50020 + level); // charm
    materialArt(50030 + level); // DNA
  }
  for (let level = 1; level <= 5; level += 1) materialArt(10000 + level); // strengthen powder
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

function drawArtwork(ctx, art, cx, cy, size) {
  const image = art?.image;
  if (!(image?.complete && Number(image.naturalWidth) > 0 && Number(image.naturalHeight) > 0)) return false;

  if (art.verticalTier) {
    const tiers = Math.max(1, Number(art.verticalTiers) || 1);
    const tier = Math.max(1, Math.min(tiers, Number(art.verticalTier) || 1));
    const sourceW = Number(image.naturalWidth);
    const cellH = Number(image.naturalHeight) / tiers;
    const sourceY = (tier - 1) * cellH;
    const displayW = Math.min(size, size * sourceW / Math.max(1, cellH));
    const displayH = Math.min(size, size * cellH / Math.max(1, sourceW));
    const scale = Math.min(size / sourceW, size / cellH);
    const width = sourceW * scale;
    const height = cellH * scale;
    ctx.drawImage(image, 0, sourceY, sourceW, cellH, cx - width / 2, cy - height / 2, width, height);
    void displayW;
    void displayH;
    return true;
  }

  if (art.crop) {
    ctx.drawImage(
      image,
      art.crop.x, art.crop.y, art.crop.width, art.crop.height,
      cx - size / 2, cy - size / 2, size, size,
    );
    return true;
  }

  const sourceW = Math.max(1, Number(image.naturalWidth) || 1);
  const sourceH = Math.max(1, Number(image.naturalHeight) || 1);
  const scale = Math.min(size / sourceW, size / sourceH);
  const width = sourceW * scale;
  const height = sourceH * scale;
  ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
  return true;
}

function drawSpecialLootIcon(ctx, drop, now) {
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

  // Never paint a fallback square for these IDs. If the image is still decoding,
  // draw only the glow/label for a frame and let the real artwork appear next.
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

  if (art.image?.complete && Number(art.image.naturalWidth) > 0) {
    ctx.shadowColor = 'rgba(255,224,92,.95)';
    ctx.shadowBlur = 8;
    drawArtwork(ctx, art, cx, cy, size);
  }
  ctx.restore();

  drawDropLabel(ctx, cx, cy, size, alpha);
  return true;
}

export function installBattleLootMaterialIconFix20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  preloadSpecialLoot();

  const base = BattleRenderer.prototype.drawLootDrops;
  if (base?.__craftMaterialIcons20260908) return;

  function drawLootDropsWithCraftMaterialIcons20260908(ctx, engine) {
    const drops = Array.isArray(engine?.lootDrops) ? engine.lootDrops : [];
    const specialDrops = drops.filter(isSpecialLootDrop);
    const ordinaryDrops = drops.filter((drop) => !isSpecialLootDrop(drop));

    // 10001..10005 and 500xx are absent from the legacy item atlas. Hide them
    // from the old renderer completely so its yellow rotated-square placeholder
    // can never flash underneath the real artwork.
    const baseEngine = specialDrops.length
      ? Object.assign(Object.create(engine ?? null), engine ?? {}, { lootDrops: ordinaryDrops })
      : engine;
    const result = base.call(this, ctx, baseEngine);

    const now = Number(engine?.time) || 0;
    for (const drop of specialDrops) drawSpecialLootIcon(ctx, drop, now);
    return result;
  }
  drawLootDropsWithCraftMaterialIcons20260908.__craftMaterialIcons20260908 = true;
  BattleRenderer.prototype.drawLootDrops = drawLootDropsWithCraftMaterialIcons20260908;
}