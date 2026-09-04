import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANIM_DIR = path.join(ROOT, 'assets', 'sprites', 'unit_anim');
const RESOURCES = [45];
const PADDING = 24;
const ROUND_TO = 8;
const MAX_DECODED_PIXELS = 6_000_000;

function roundUp(value, step = ROUND_TO) {
  return Math.ceil(value / step) * step;
}

function cropRaw(source, sourceWidth, left, top, width, height) {
  const output = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * sourceWidth + left) * 4;
    source.copy(output, row * width * 4, sourceStart, sourceStart + width * 4);
  }
  return output;
}

async function bakeState(res, meta, decoded, state, animation) {
  const bounds = animation.frames.map((frame) => frame.bounds).filter(Boolean);
  if (!bounds.length) throw new Error(`res ${res} state ${state} has no bounded frames`);
  const originX = Math.max(0, Math.min(...bounds.map((item) => Number(item.left))) - PADDING);
  const originY = Math.max(0, Math.min(...bounds.map((item) => Number(item.top))) - PADDING);
  const right = Math.min(
    Number(meta.frameW) - 1,
    Math.max(...bounds.map((item) => Number(item.right))) + PADDING,
  );
  const bottom = Math.min(
    Number(meta.frameH) - 1,
    Math.max(...bounds.map((item) => Number(item.bottom))) + PADDING,
  );
  const frameW = roundUp(right - originX + 1);
  const frameH = roundUp(bottom - originY + 1);
  const unique = [];
  const indices = [];
  const byHash = new Map();

  for (const frame of animation.frames) {
    const data = cropRaw(
      decoded.data,
      Number(decoded.info.width),
      Number(frame.x) + originX,
      Number(frame.y) + originY,
      frameW,
      frameH,
    );
    const hash = createHash('sha1').update(data).digest('hex');
    const candidates = byHash.get(hash) ?? [];
    let index = candidates.find((candidate) => unique[candidate].equals(data));
    if (index == null) {
      index = unique.length;
      unique.push(data);
      candidates.push(index);
      byHash.set(hash, candidates);
    }
    indices.push(index);
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(unique.length)));
  const rows = Math.max(1, Math.ceil(unique.length / columns));
  const sheetWidth = columns * frameW;
  const sheetHeight = rows * frameH;
  const decodedPixels = sheetWidth * sheetHeight;
  if (decodedPixels > MAX_DECODED_PIXELS) {
    throw new Error(`res ${res} state ${state} decodes ${decodedPixels} pixels`);
  }
  const frames = indices.map((index) => ({
    x: (index % columns) * frameW,
    y: Math.floor(index / columns) * frameH,
    w: frameW,
    h: frameH,
  }));
  const composites = unique.map((data, index) => ({
    input: data,
    raw: { width: frameW, height: frameH, channels: 4 },
    left: (index % columns) * frameW,
    top: Math.floor(index / columns) * frameH,
  }));
  const outputPng = path.join(ANIM_DIR, `${res}.${state}.runtime.png`);
  const temporaryPng = `${outputPng}.tmp.png`;
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites).png().toFile(temporaryPng);
  fs.renameSync(temporaryPng, outputPng);
  console.log(
    `res ${res} ${state}: ${sheetWidth}x${sheetHeight}, `
    + `${decodedPixels} pixels, ${unique.length}/${animation.frames.length} unique`,
  );
  return {
    originX,
    originY,
    frameW,
    frameH,
    sheetWidth,
    sheetHeight,
    decodedPixels,
    sourceFrameCount: animation.frames.length,
    uniqueFrameCount: unique.length,
    frames,
  };
}

async function bake(res) {
  const jsonPath = path.join(ANIM_DIR, `${res}.json`);
  const pngPath = path.join(ANIM_DIR, `${res}.png`);
  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const decoded = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const runtimeAnimations = {};
  for (const [state, animation] of Object.entries(meta.animations ?? {})) {
    if (!animation?.frames?.length) continue;
    runtimeAnimations[state] = await bakeState(res, meta, decoded, state, animation);
  }
  const runtimeMeta = {
    res,
    logicalFrameW: Number(meta.frameW),
    logicalFrameH: Number(meta.frameH),
    animations: runtimeAnimations,
  };
  fs.writeFileSync(
    path.join(ANIM_DIR, `${res}.runtime.json`),
    `${JSON.stringify(runtimeMeta, null, 2)}\n`,
  );
}

for (const res of RESOURCES) await bake(res);
