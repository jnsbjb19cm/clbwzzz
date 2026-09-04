import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import sharp from 'sharp';
import { toArray } from './lib/dragonbones-bake.mjs';
import { isFragmentSoldier } from './lib/soldier-sprite-quality.mjs';
import { chromaKeyRgbaBuffer } from './lib/chroma-key.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ATLAS_DIR = path.join(ROOT, 'assets/atlas');
const DATA_DIR = path.join(ROOT, 'src/data');
const CARD_OUT = path.join(ROOT, 'assets/sprites/cards');
const UNIT_OUT = path.join(ROOT, 'assets/sprites/units');
const BULLET_OUT = path.join(ROOT, 'assets/sprites/bullets');
const PARTS_OUT = path.join(ROOT, 'assets/sprites/parts');

const CARD_PART_NAMES = [
  'default_bg',
  'card_bg_1',
  'card_bg_2',
  'card_bg_3',
  'card_bg_4',
  'card_bg_5',
  'card_bg_6',
  'single_star_0',
  'single_star_1',
  'single_star_2',
  'single_star_3',
  'single_star_4',
  'single_star_5',
  'single_star_6',
];

const QUALITY_CIRCLE_NAME = 'qualityLightCircleFile-Graphic - qua-shape 2 - qua';
const QUALITY_DISC_NAME = 'bumpFile-Graphic - qua-shape 2 - qua';
const SKELETON_XML = path.join(ROOT, 'assets/assets/dySkeletonXML/soldier_skeleton.xml');

const skeletonParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  trimValues: true,
});

let bulletArmByResCache = null;

function loadBulletArmByRes() {
  if (bulletArmByResCache) return bulletArmByResCache;
  const map = new Map();
  if (!fs.existsSync(SKELETON_XML)) {
    bulletArmByResCache = map;
    return map;
  }
  const skeleton = skeletonParser.parse(fs.readFileSync(SKELETON_XML, 'utf8'));
  for (const arm of toArray(skeleton.dragonBones?.armature)) {
    const m = /^Bullet(\d+)$/.exec(arm.name ?? '');
    if (m) map.set(Number(m[1]), arm);
  }
  bulletArmByResCache = map;
  return map;
}

function pickBulletSpriteFromArmature(bulletArm, sprites) {
  if (!bulletArm) return null;
  const anims = toArray(bulletArm.animation);
  const flyAnim = anims.find((a) => ['yidong', 'moving', 'move', 'default'].includes(a.name))
    ?? anims.find((a) => !/^bao/i.test(a.name))
    ?? anims[0];
  if (!flyAnim) return null;

  const animatedKeys = new Set(toArray(flyAnim.timeline).map((tl) => tl.name));
  const displayNames = [];
  for (const slot of toArray(bulletArm.skin?.slot)) {
    if (!animatedKeys.has(slot.parent) && !animatedKeys.has(slot.name)) continue;
    const timelines = toArray(flyAnim.timeline).filter(
      (tl) => tl.name === slot.parent || tl.name === slot.name,
    );
    let displayIndex = 0;
    for (const tl of timelines) {
      for (const fr of toArray(tl.frame)) {
        const di = fr.displayIndex != null ? Number(fr.displayIndex) : 0;
        if (di >= 0) {
          displayIndex = di;
          break;
        }
      }
    }
    const displays = toArray(slot.display);
    const display = displays[displayIndex] ?? displays[0];
    if (display?.name) displayNames.push(display.name);
  }

  let best = null;
  let bestScore = -1;
  for (const name of displayNames) {
    const sprite = findSprite(sprites, name);
    if (!sprite) continue;
    const score = bulletFrameScore(sprite, name);
    if (score > bestScore) {
      best = sprite;
      bestScore = score;
    }
  }
  return best;
}

function imagePath(baseName) {
  const p = path.join(ATLAS_DIR, `${baseName}.png`);
  return fs.existsSync(p) ? p : null;
}

function isPngAtlas(atlasPath) {
  return /\.png$/i.test(atlasPath ?? '');
}

function findSprite(sprites, name) {
  return sprites.find((s) => s.name === name || s.name === Number(name) || String(s.name) === String(name));
}

function isBadSoldierFrame(name) {
  return /Graphic|shape|补间|MovieClip|zha|溅射|Bullet|bullet/i.test(String(name ?? ''));
}

function soldierFrameScore(sprite) {
  const w = sprite.width;
  const h = sprite.height;
  if (w < 24 || h < 24) return -1;
  const aspect = w / Math.max(1, h);
  if (aspect > 2.6 || aspect < 0.38) return -1;

  let score = w * h;
  const nm = String(sprite.name ?? '');
  if (/元件 1/.test(nm)) score += 8000;
  if (/--\d+$/.test(nm)) score += 2000;
  if (isBadSoldierFrame(nm)) return -1;
  return score;
}

function pickSoldierSprite(sprites, res) {
  const r = String(res);
  const names = [
    `soldier${r}-元件 1--${r}`,
    `soldier${r}-元件 1`,
    `soldier${r}-补间 1--${r}`,
    `soldier${r}-补间 1`,
  ];
  for (const n of names) {
    const s = findSprite(sprites, n);
    if (s && soldierFrameScore(s) > 0) return s;
  }
  const prefix = `soldier${r}-`;
  let best = null;
  let bestScore = -1;
  for (const s of sprites) {
    const nm = String(s.name ?? '');
    if (!nm.startsWith(prefix)) continue;
    const score = soldierFrameScore(s);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function bulletFrameScore(sprite, nm) {
  if (sprite.width < 6 || sprite.height < 6) return -1;
  if (sprite.width > 120 || sprite.height > 120) return -1;
  if (/zha|溅射|爆炸|hit|Hit/i.test(nm)) return -1;

  let score = sprite.width * sprite.height;
  if (/Bullet/i.test(nm)) score += 8000;
  if (/\.png/i.test(nm)) score += 4000;
  if (/0-blt|00\.png|001\.png/i.test(nm)) score += 2500;
  if (/补间 1/.test(nm)) score += 2000;
  if (/blt\d/i.test(nm)) score += 1500;
  if (/MovieClip.*sprite 11/i.test(nm)) score += 1200;
  if (/Graphic.*shape 2/i.test(nm)) score += 600;
  if (/Graphic|MovieClip|shape/i.test(nm)) score -= 500;
  return score;
}

function pickBulletSprite(sprites, res, bulletArmByRes = null) {
  const r = String(res);
  const fromArm = pickBulletSpriteFromArmature(bulletArmByRes?.get(Number(res)), sprites);
  if (fromArm) return fromArm;

  const exact = [
    `bulletFile${r}-Bullet-blt${r}`,
    `bulletFile${r}-Bullet`,
    `bulletFile${r}-0-blt${r}`,
    `bulletFile${r}-1.png-blt${r}`,
    `bulletFile${r}-00.png--blt${r}`,
    `bulletFile${r}-1.png 副本--blt${r}`,
    `soldier${r}-bullet`,
    `soldier${r}-bullet--${r}`,
    `soldier${r}-bullet---${r}`,
  ];
  for (const n of exact) {
    const s = findSprite(sprites, n);
    if (s && bulletFrameScore(s, n) > 0) return s;
  }

  const prefixes = [`bulletFile${r}-`, `bulletFile${r}`];
  let best = null;
  let bestScore = -1;
  for (const s of sprites) {
    const nm = String(s.name ?? '');
    const matched = prefixes.some((p) => nm.startsWith(p) || nm.includes(`bulletFile${r}`));
    if (!matched) continue;
    const score = bulletFrameScore(s, nm);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  if (best) return best;

  const soldierPrefix = `soldier${r}-`;
  for (const s of sprites) {
    const nm = String(s.name ?? '');
    if (!nm.startsWith(soldierPrefix)) continue;
    if (!/bullet|子弹|blt/i.test(nm)) continue;
    const score = bulletFrameScore(s, nm);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

async function extractFramed(atlasPath, sprite, outPath) {
  const fw = sprite.frameWidth ?? sprite.width;
  const fh = sprite.frameHeight ?? sprite.height;
  const fx = sprite.frameX ?? 0;
  const fy = sprite.frameY ?? 0;
  if (sprite.width <= 0 || sprite.height <= 0 || fw <= 0 || fh <= 0) return false;

  const pasteX = fx < 0 ? -fx : fx;
  const pasteY = fy < 0 ? -fy : fy;

  const crop = await sharp(atlasPath)
    .extract({
      left: Math.max(0, sprite.x),
      top: Math.max(0, sprite.y),
      width: sprite.width,
      height: sprite.height,
    })
    .toBuffer();

  await sharp({
    create: {
      width: fw,
      height: fh,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: crop, left: pasteX, top: pasteY }])
    .png()
    .toFile(outPath);
  return true;
}

async function extractRaw(atlasPath, sprite, outPath) {
  if (sprite.width < 8 || sprite.height < 8) return false;
  await sharp(atlasPath)
    .extract({
      left: Math.max(0, sprite.x),
      top: Math.max(0, sprite.y),
      width: sprite.width,
      height: sprite.height,
    })
    .png()
    .toFile(outPath);
  return true;
}

/** 战斗手牌蒙版：非透明区转白色剪影，供 CSS mask-image 使用 */
async function normalizeBattleCardMask(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 16) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    } else {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

/** 仅从四边泛洪去除背景，保留内部黑色(眼睛、嘴线) */
async function chromaKeyBlackFromEdges(filePath, {
  threshold = 24,
  defringe = true,
  soften = true,
} = {}) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  chromaKeyRgbaBuffer(data, info.width, info.height, { threshold, defringe, soften });
  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

async function chromaKeyBlack(filePath, { threshold = 32, softMax = 0, softSat = 0.15 } = {}) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;

    if (r <= threshold && g <= threshold && b <= threshold) {
      data[i + 3] = 0;
    } else if (softMax > 0 && max <= softMax && sat < softSat) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(filePath);
}

async function extractWithChroma(atlasPath, sprite, outPath, chromaOpts = { threshold: 32 }) {
  const hasFrame = sprite.frameWidth > 0 || sprite.frameX != null;
  const ok = hasFrame
    ? await extractFramed(atlasPath, sprite, outPath)
    : await extractRaw(atlasPath, sprite, outPath);
  if (!ok) return false;

  /** PNG 图集自带 alpha，保留透明通道；仅对 JPG 做黑底抠图 */
  if (isPngAtlas(atlasPath)) {
    if (chromaOpts.preserveAlpha) return true;
    if (chromaOpts.edgeClean === false) return true;
    await chromaKeyBlackFromEdges(outPath, {
      threshold: chromaOpts.threshold ?? 18,
      defringe: chromaOpts.defringe ?? false,
      soften: chromaOpts.soften ?? false,
    });
    return true;
  }

  if (chromaOpts.softMax > 0) {
    await chromaKeyBlack(outPath, chromaOpts);
  } else {
    await chromaKeyBlackFromEdges(outPath, {
      threshold: chromaOpts.threshold ?? 24,
      defringe: chromaOpts.defringe ?? true,
      soften: chromaOpts.soften ?? true,
    });
  }
  return true;
}

const CHROMA_PORTRAIT = { threshold: 24 };
const CHROMA_PORTRAIT_EYE_SAFE = { threshold: 24, defringe: false, soften: false };
const PNG_PORTRAIT = { preserveAlpha: true };
const PNG_PORTRAIT_EYE_SAFE = { preserveAlpha: true };
const EYE_SAFE_CARD_RES = new Set([2, 4, 21, 25]);
const CHROMA_PARTS = { threshold: 48, softMax: 58, softSat: 0.18 };
/** 子弹多为白底/浅灰底，需软抠图 */
const CHROMA_BULLET = { threshold: 28, softMax: 245, softSat: 0.12 };

async function main() {
  const cardJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'card.json'), 'utf8'));
  const cardAtlas = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'atlas/preload_card1.json'), 'utf8'),
  );
  const soldierAtlas = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'atlas/dyload_soldier.json'), 'utf8'),
  );
  const partsAtlas = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'atlas/preload_cardParts.json'), 'utf8'),
  );
  const battleAtlas = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'atlas/preload_battle.json'), 'utf8'),
  );

  const cardImg = imagePath('card1');
  const soldierImg = imagePath('soldier');
  const partsImg = imagePath('cardParts');
  const battleImg = imagePath('battle');
  if (!cardImg || !soldierImg || !partsImg) {
    console.error('缺少 card1 / soldier / cardParts PNG 图集，请先 npm run sync:atlas(resources/img)');
    process.exit(1);
  }
  const usePngAtlas = isPngAtlas(cardImg);
  if (usePngAtlas) {
    console.log('  图集源: PNG(resources/img，保留 alpha 通道)');
  }
  const portraitChroma = (res) => {
    if (!usePngAtlas) {
      return EYE_SAFE_CARD_RES.has(res) ? CHROMA_PORTRAIT_EYE_SAFE : CHROMA_PORTRAIT;
    }
    return EYE_SAFE_CARD_RES.has(res) ? PNG_PORTRAIT_EYE_SAFE : PNG_PORTRAIT;
  };
  const unitChroma = usePngAtlas ? PNG_PORTRAIT : CHROMA_PORTRAIT;
  const bulletChroma = usePngAtlas ? PNG_PORTRAIT : CHROMA_BULLET;
  const partsChroma = usePngAtlas ? PNG_PORTRAIT : CHROMA_PARTS;

  fs.mkdirSync(CARD_OUT, { recursive: true });
  fs.mkdirSync(UNIT_OUT, { recursive: true });
  fs.mkdirSync(BULLET_OUT, { recursive: true });
  fs.mkdirSync(PARTS_OUT, { recursive: true });

  const resSet = new Set();
  for (const c of cardJson) {
    if (c.res != null) resSet.add(Number(c.res));
  }
  const bulletArmByRes = loadBulletArmByRes();

  let cards = 0;
  let units = 0;
  let bullets = 0;
  const missingCard = [];
  const missingUnit = [];
  const missingBullet = [];
  const fragmentSoldiers = [];

  for (const res of [...resSet].sort((a, b) => a - b)) {
    const cardSprite = findSprite(cardAtlas.sprites, res);
    if (cardSprite) {
      const ok = await extractWithChroma(
        cardImg,
        cardSprite,
        path.join(CARD_OUT, `${res}.png`),
        portraitChroma(res),
      );
      if (ok) cards++;
      else missingCard.push(res);
    } else {
      missingCard.push(res);
    }

    const unitOut = path.join(UNIT_OUT, `${res}.png`);
    if (isFragmentSoldier(soldierAtlas.sprites, res)) {
      fragmentSoldiers.push(res);
      const cardOut = path.join(CARD_OUT, `${res}.png`);
      if (fs.existsSync(cardOut)) {
        fs.copyFileSync(cardOut, unitOut);
        units++;
      } else {
        if (fs.existsSync(unitOut)) fs.unlinkSync(unitOut);
        missingUnit.push(res);
      }
    } else {
      const unitSprite = pickSoldierSprite(soldierAtlas.sprites, res);
      if (unitSprite) {
        const ok = await extractWithChroma(
          soldierImg,
          unitSprite,
          unitOut,
          unitChroma,
        );
        if (ok) units++;
        else missingUnit.push(res);
      } else {
        if (fs.existsSync(unitOut)) fs.unlinkSync(unitOut);
        missingUnit.push(res);
      }
    }

    const bulletSprite = pickBulletSprite(soldierAtlas.sprites, res, bulletArmByRes);
    if (bulletSprite) {
      const ok = await extractWithChroma(
        soldierImg,
        bulletSprite,
        path.join(BULLET_OUT, `${res}.png`),
        bulletChroma,
      );
      if (ok) bullets++;
      else missingBullet.push(res);
    } else {
      missingBullet.push(res);
    }
  }

  const defaultBullet = pickBulletSprite(soldierAtlas.sprites, 1, bulletArmByRes);
  if (defaultBullet) {
    await extractWithChroma(
      soldierImg,
      defaultBullet,
      path.join(BULLET_OUT, 'default.png'),
      bulletChroma,
    );
  }

  let parts = 0;
  for (const name of CARD_PART_NAMES) {
    const sprite = findSprite(partsAtlas.sprites, name);
    if (!sprite) continue;
    const ok = await extractWithChroma(
      partsImg,
      sprite,
      path.join(PARTS_OUT, `${name}.png`),
      partsChroma,
    );
    if (ok) parts++;
  }

  const circleSprite = findSprite(soldierAtlas.sprites, QUALITY_CIRCLE_NAME);
  if (circleSprite) {
    const ok = await extractWithChroma(
      soldierImg,
      circleSprite,
      path.join(PARTS_OUT, 'quality_circle.png'),
      unitChroma,
    );
    if (ok) parts++;
  }

  const discSprite = findSprite(soldierAtlas.sprites, QUALITY_DISC_NAME);
  if (discSprite) {
    const ok = await extractWithChroma(
      soldierImg,
      discSprite,
      path.join(PARTS_OUT, 'quality_disc.png'),
      unitChroma,
    );
    if (ok) parts++;
  }

  const maskSprite = findSprite(battleAtlas.sprites, 'battle_card_mask')
    ?? findSprite(cardAtlas.sprites, 'battle_card_mask');
  const maskImg = battleImg ?? cardImg;
  if (maskSprite && maskImg) {
    const maskOut = path.join(PARTS_OUT, 'battle_card_mask.png');
    const ok = await extractFramed(maskImg, maskSprite, maskOut);
    if (ok) {
      await normalizeBattleCardMask(maskOut);
      parts++;
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: { card: 'card1', soldier: 'soldier', cardParts: 'cardParts', battle: 'battle' },
    cards,
    units,
    bullets,
    parts,
    missingCard,
    missingUnit,
    missingBullet,
    fragmentSoldiers,
  };
  fs.writeFileSync(path.join(ROOT, 'assets/sprites/manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`  卡牌立绘 ${cards} -> assets/sprites/cards/`);
  console.log(`  战场单位 ${units} -> assets/sprites/units/`);
  console.log(`  子弹素材 ${bullets} -> assets/sprites/bullets/`);
  console.log(`  卡牌部件 ${parts} -> assets/sprites/parts/`);
  if (missingCard.length) console.log(`  无立绘坐标: ${missingCard.slice(0, 12).join(', ')}${missingCard.length > 12 ? '…' : ''}`);
  if (missingUnit.length) console.log(`  无战场帧: ${missingUnit.slice(0, 12).join(', ')}${missingUnit.length > 12 ? '…' : ''}`);
  if (missingBullet.length) console.log(`  无子弹帧: ${missingBullet.slice(0, 12).join(', ')}${missingBullet.length > 12 ? '…' : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});