import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANIM_DIR = path.join(ROOT, 'assets', 'sprites', 'unit_anim');
const PADDING = 6;
const ROUND_TO = 8;

function roundUp(value, step = ROUND_TO) {
  return Math.ceil(value / step) * step;
}

function cropRaw(source, sourceWidth, left, top, width, height) {
  const output = Buffer.allocUnsafe(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * sourceWidth + left) * 4;
    source.copy(output, row * width * 4, sourceStart, sourceStart + width * 4);
  }
  return output;
}

async function bake(res) {
  const jsonPath = path.join(ANIM_DIR, `${res}.json`);
  const pngPath = path.join(ANIM_DIR, `${res}.png`);
  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const animation = meta.animations?.underMoving;
  if (!animation?.frames?.length) throw new Error(`res ${res} has no underMoving animation`);

  const bounds = animation.frames.map((frame) => frame.bounds).filter(Boolean);
  const originX = Math.max(0, Math.min(...bounds.map((item) => Number(item.left))) - PADDING);
  const originY = Math.max(0, Math.min(...bounds.map((item) => Number(item.top))) - PADDING);
  const right = Math.min(Number(meta.frameW) - 1, Math.max(...bounds.map((item) => Number(item.right))) + PADDING);
  const bottom = Math.min(Number(meta.frameH) - 1, Math.max(...bounds.map((item) => Number(item.bottom))) + PADDING);
  const frameW = roundUp(right - originX + 1);
  const frameH = roundUp(bottom - originY + 1);

  const decoded = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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

  const outputPng = path.join(ANIM_DIR, `${res}.underMoving.png`);
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

  const runtimeMeta = {
    res,
    state: 'underMoving',
    logicalFrameW: Number(meta.frameW),
    logicalFrameH: Number(meta.frameH),
    originX,
    originY,
    frameW,
    frameH,
    sheetWidth,
    sheetHeight,
    sourceFrameCount: animation.frames.length,
    uniqueFrameCount: unique.length,
    animation: {
      frameRate: Number(animation.frameRate) || 12,
      loop: true,
      frames,
    },
  };
  fs.writeFileSync(
    path.join(ANIM_DIR, `${res}.underMoving.json`),
    `${JSON.stringify(runtimeMeta, null, 2)}\n`,
  );
  console.log(`res ${res}: ${sheetWidth}x${sheetHeight}, ${animation.frames.length} refs, ${unique.length} unique`);
}

for (const res of [41, 43]) await bake(res);
