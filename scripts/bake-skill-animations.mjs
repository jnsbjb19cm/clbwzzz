/** Bake top-level Skill### DragonBones armatures into readable runtime sheets. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import {
  bakeAnimationFrames,
  collectAllDisplayNames,
  parseArmature,
  renderFrame,
  toArray,
} from './lib/dragonbones-bake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKELETON = path.join(ROOT, 'assets/assets/dySkeletonXML/skill1_skeleton.xml');
const ATLAS_JSON = path.join(ROOT, 'src/data/atlas/dyload_skill1.json');
const ATLAS_PNG = path.join(ROOT, 'assets/atlas/skill1.png');
const OUT_DIR = path.join(ROOT, 'assets/sprites/skill_anim');
const CANVAS_SIZE = 640;
const SHEET_COLS = 4;
const PLAYBACK_RATE = 1.3;
const MIN_VISIBLE_DURATION = 0.85;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  trimValues: true,
});

async function cropSprite(sprite) {
  if (!sprite?.width || !sprite?.height) return null;
  const frameW = Number(sprite.frameWidth ?? sprite.width);
  const frameH = Number(sprite.frameHeight ?? sprite.height);
  const frameX = Number(sprite.frameX ?? 0);
  const frameY = Number(sprite.frameY ?? 0);
  const cropped = await sharp(ATLAS_PNG)
    .extract({ left: sprite.x, top: sprite.y, width: sprite.width, height: sprite.height })
    .ensureAlpha()
    .png()
    .toBuffer();
  const source = await loadImage(cropped);
  const canvas = createCanvas(frameW, frameH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, frameX < 0 ? -frameX : frameX, frameY < 0 ? -frameY : frameY);
  return loadImage(canvas.toBuffer('image/png'));
}

async function buildSpriteMap(sprites, displayNames) {
  const byName = new Map(sprites.map((sprite) => [sprite.name, sprite]));
  const map = new Map();
  for (const name of displayNames) {
    const sprite = byName.get(name);
    if (!sprite) continue;
    const image = await cropSprite(sprite);
    if (image) map.set(name, image);
  }
  return map;
}

async function measureBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 24) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right >= left ? { left, top, right, bottom } : null;
}

async function bakeSkill(rawArmature, armByName, sprites, rootFrameRate) {
  const arm = parseArmature(rawArmature, rawArmature.name);
  const animationName = arm.animations.attacking ? 'attacking' : Object.keys(arm.animations)[0];
  if (!animationName) return null;
  const frameIndices = bakeAnimationFrames(arm, animationName, null, 1);
  const spriteMap = await buildSpriteMap(sprites, collectAllDisplayNames(arm, armByName));
  if (!spriteMap.size) return null;
  const frameBuffers = [];
  for (const frameIndex of frameIndices) {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    renderFrame(ctx, arm, animationName, frameIndex, spriteMap, {
      armByName,
      armName: rawArmature.name,
      skipShadow: false,
      skipBullet: false,
    });
    const buffer = canvas.toBuffer('image/png');
    const bounds = await measureBounds(buffer);
    if (bounds) frameBuffers.push({ buffer, bounds });
  }
  if (!frameBuffers.length) return null;

  const sourceScale = Math.max(0.05, Number(arm.animations[animationName]?.scale) || 1);
  const readableFps = Math.max(4, (rootFrameRate * sourceScale / 2) * PLAYBACK_RATE);
  const duration = Math.max(MIN_VISIBLE_DURATION, frameBuffers.length / readableFps);
  const frameRate = frameBuffers.length / duration;
  const drawBounds = frameBuffers.reduce((union, frame) => ({
    left: Math.min(union.left, frame.bounds.left),
    top: Math.min(union.top, frame.bounds.top),
    right: Math.max(union.right, frame.bounds.right),
    bottom: Math.max(union.bottom, frame.bounds.bottom),
  }), { left: CANVAS_SIZE, top: CANVAS_SIZE, right: 0, bottom: 0 });
  const cellW = drawBounds.right - drawBounds.left + 1;
  const cellH = drawBounds.bottom - drawBounds.top + 1;
  const rows = Math.ceil(frameBuffers.length / SHEET_COLS);
  const sheet = createCanvas(cellW * SHEET_COLS, cellH * rows);
  const sheetCtx = sheet.getContext('2d');
  const frames = [];
  for (let index = 0; index < frameBuffers.length; index++) {
    const image = await loadImage(frameBuffers[index].buffer);
    const x = (index % SHEET_COLS) * cellW;
    const y = Math.floor(index / SHEET_COLS) * cellH;
    sheetCtx.drawImage(
      image,
      drawBounds.left,
      drawBounds.top,
      cellW,
      cellH,
      x,
      y,
      cellW,
      cellH,
    );
    frames.push({ x, y, w: cellW, h: cellH });
  }
  return {
    image: sheet.toBuffer('image/png'),
    meta: {
      skillId: Number(String(rawArmature.name).replace('Skill', '')),
      frameW: cellW,
      frameH: cellH,
      frameRate,
      duration,
      releaseRatio: 0.42,
      drawBounds: { left: 0, top: 0, right: cellW - 1, bottom: cellH - 1 },
      frames,
    },
  };
}

async function main() {
  const parsed = parser.parse(fs.readFileSync(SKELETON, 'utf8'));
  const root = parsed.dragonBones;
  const rootFrameRate = Math.max(1, Number(root.frameRate) || 40);
  const armatures = toArray(root.armature);
  const armByName = new Map(armatures.map((armature) => [armature.name, armature]));
  const atlas = JSON.parse(fs.readFileSync(ATLAS_JSON, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), skills: {}, missing: [] };
  const requested = new Set(process.argv.slice(2).map(Number).filter(Number.isFinite));
  for (const armature of armatures.filter((item) => /^Skill\d+$/.test(item.name))) {
    const id = Number(armature.name.slice(5));
    if (requested.size && !requested.has(id)) continue;
    const baked = await bakeSkill(armature, armByName, atlas.sprites, rootFrameRate);
    if (!baked) {
      manifest.missing.push(id);
      continue;
    }
    fs.writeFileSync(path.join(OUT_DIR, `${id}.png`), baked.image);
    fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(baked.meta, null, 2));
    manifest.skills[id] = { duration: baked.meta.duration, frameRate: baked.meta.frameRate };
    console.log(`Skill${id}: ${baked.meta.frames.length} frames, ${baked.meta.duration.toFixed(2)}s`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});