import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets/sprites/unit_anim');
const MAX_SHEET_HEIGHT = 12_000;
const SAFETY_PAD = 32;
const MIN_FRAME = 256;
const ROUND_TO = 32;

function roundUp(value, step = ROUND_TO) {
  return Math.ceil(value / step) * step;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scaleFreeUnion(meta) {
  const bounds = [];
  for (const animation of Object.values(meta.animations ?? {})) {
    for (const frame of animation.frames ?? []) {
      if (frame?.bounds) bounds.push(frame.bounds);
    }
  }
  if (!bounds.length) return null;
  return {
    left: Math.min(...bounds.map((b) => Number(b.left))),
    top: Math.min(...bounds.map((b) => Number(b.top))),
    right: Math.max(...bounds.map((b) => Number(b.right))),
    bottom: Math.max(...bounds.map((b) => Number(b.bottom))),
  };
}

function cropPlan(meta) {
  const sourceW = Number(meta.frameW) || 0;
  const sourceH = Number(meta.frameH) || 0;
  const union = scaleFreeUnion(meta);
  if (!union || sourceW <= 0 || sourceH <= 0) return null;

  const contentW = union.right - union.left + 1;
  const contentH = union.bottom - union.top + 1;
  const mushroom = Number(meta.res) === 58;
  const safetyPad = mushroom ? 4 : SAFETY_PAD;
  const minFrame = mushroom ? 224 : MIN_FRAME;
  const roundTo = mushroom ? 8 : ROUND_TO;
  const target = Math.min(
    Math.max(sourceW, sourceH),
    roundUp(Math.max(minFrame, contentW + safetyPad * 2, contentH + safetyPad * 2), roundTo),
  );

  const centerX = (union.left + union.right + 1) / 2;
  const centerY = (union.top + union.bottom + 1) / 2;
  const cropX = clamp(Math.round(centerX - target / 2), 0, Math.max(0, sourceW - target));
  const cropY = clamp(Math.round(centerY - target / 2), 0, Math.max(0, sourceH - target));

  return { sourceW, sourceH, target, cropX, cropY, union, safetyPad };
}

function translateBounds(bounds, dx, dy, frameSize) {
  if (!bounds) return bounds;
  return {
    ...bounds,
    left: clamp(Math.round(Number(bounds.left) - dx), 0, frameSize - 1),
    top: clamp(Math.round(Number(bounds.top) - dy), 0, frameSize - 1),
    right: clamp(Math.round(Number(bounds.right) - dx), 0, frameSize - 1),
    bottom: clamp(Math.round(Number(bounds.bottom) - dy), 0, frameSize - 1),
  };
}

function placement(index, frameSize, totalFrames) {
  const rowsPerColumn = Math.max(1, Math.floor(MAX_SHEET_HEIGHT / frameSize));
  const columns = Math.max(1, Math.ceil(totalFrames / rowsPerColumn));
  const rows = Math.max(1, Math.min(totalFrames, rowsPerColumn));
  return {
    x: Math.floor(index / rowsPerColumn) * frameSize,
    y: (index % rowsPerColumn) * frameSize,
    width: columns * frameSize,
    height: rows * frameSize,
  };
}

function cropRawRgba(source, sourceWidth, sourceHeight, left, top, size) {
  const channels = 4;
  if (left < 0 || top < 0 || left + size > sourceWidth || top + size > sourceHeight) {
    throw new Error(`raw crop 越界: (${left},${top},${size}) in ${sourceWidth}x${sourceHeight}`);
  }
  const rowBytes = size * channels;
  const output = Buffer.allocUnsafe(size * rowBytes);
  for (let row = 0; row < size; row += 1) {
    const sourceStart = ((top + row) * sourceWidth + left) * channels;
    source.copy(output, row * rowBytes, sourceStart, sourceStart + rowBytes);
  }
  return output;
}

function rgbaHash(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

async function compactRes(res) {
  const jsonPath = path.join(OUT_DIR, `${res}.json`);
  const pngPath = path.join(OUT_DIR, `${res}.png`);
  if (!fs.existsSync(jsonPath) || !fs.existsSync(pngPath)) {
    console.warn(`  compact res=${res}: 缺少 wide bake 输出，跳过`);
    return false;
  }

  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const plan = cropPlan(meta);
  if (!plan) return false;
  if (plan.target >= plan.sourceW && plan.target >= plan.sourceH) {
    console.log(`  compact res=${res}: ${plan.sourceW}x${plan.sourceH} 已是最小安全范围`);
    return true;
  }

  const allFrames = [];
  for (const [animationKey, animation] of Object.entries(meta.animations ?? {})) {
    for (let index = 0; index < (animation.frames ?? []).length; index += 1) {
      allFrames.push({ animationKey, index, frame: animation.frames[index] });
    }
  }
  if (!allFrames.length) return false;

  /*
   * Debug sheet 可能有上百帧。整张图只解码一次；随后先把每个裁切帧做 SHA-1。
   * 完全相同的 RGBA 帧只在正式图集中保存一次，但 animation.frames 仍保留原来的
   * 帧数/顺序/时长，只让多个 frame.x/y 指向同一图块。这样减少 PNG 解码像素和显存，
   * 不会删帧、提速或改变 DragonBones 动作节奏。
   */
  const decoded = await sharp(pngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sourceWidth = Number(decoded.info.width);
  const sourceHeight = Number(decoded.info.height);
  if (Number(decoded.info.channels) !== 4) {
    throw new Error(`compact res=${res}: 期望 RGBA4，实际 channels=${decoded.info.channels}`);
  }

  const uniqueFrames = [];
  const uniqueByHash = new Map();
  for (const entry of allFrames) {
    const oldFrame = entry.frame;
    const sourceLeft = Math.round(Number(oldFrame.x) + plan.cropX);
    const sourceTop = Math.round(Number(oldFrame.y) + plan.cropY);
    const frameBuffer = cropRawRgba(
      decoded.data,
      sourceWidth,
      sourceHeight,
      sourceLeft,
      sourceTop,
      plan.target,
    );
    const hash = rgbaHash(frameBuffer);
    const candidates = uniqueByHash.get(hash) ?? [];
    let uniqueIndex = candidates.find((idx) => uniqueFrames[idx].buffer.equals(frameBuffer));
    if (uniqueIndex == null) {
      uniqueIndex = uniqueFrames.length;
      uniqueFrames.push({ buffer: frameBuffer, hash });
      candidates.push(uniqueIndex);
      uniqueByHash.set(hash, candidates);
    }
    entry.uniqueIndex = uniqueIndex;
  }

  const uniqueCount = uniqueFrames.length;
  const firstPlacement = placement(0, plan.target, uniqueCount);
  const composites = uniqueFrames.map((entry, index) => {
    const pos = placement(index, plan.target, uniqueCount);
    return {
      input: entry.buffer,
      raw: { width: plan.target, height: plan.target, channels: 4 },
      left: pos.x,
      top: pos.y,
    };
  });

  for (const entry of allFrames) {
    const pos = placement(entry.uniqueIndex, plan.target, uniqueCount);
    entry.frame.x = pos.x;
    entry.frame.y = pos.y;
    entry.frame.w = plan.target;
    entry.frame.h = plan.target;
    entry.frame.bounds = translateBounds(entry.frame.bounds, plan.cropX, plan.cropY, plan.target);
  }

  await sharp({
    create: {
      width: firstPlacement.width,
      height: firstPlacement.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(`${pngPath}.tmp.png`);
  fs.renameSync(`${pngPath}.tmp.png`, pngPath);

  meta.frameW = plan.target;
  meta.frameH = plan.target;
  meta.uniformBounds = translateBounds(meta.uniformBounds, plan.cropX, plan.cropY, plan.target);
  meta.sheetLayout = {
    ...(meta.sheetLayout ?? {}),
    mode: 'columns-deduplicated',
    maxHeight: MAX_SHEET_HEIGHT,
    width: firstPlacement.width,
    height: firstPlacement.height,
    frameReferences: allFrames.length,
    uniqueFrames: uniqueCount,
  };
  if (Number.isFinite(Number(meta.footOpaqueInset))) {
    meta.footOpaqueInset = Math.max(0, Number(meta.footOpaqueInset));
  }

  // drawFootY 是“脚底在 frameH 中的比例”，裁掉顶部后必须按新 frameH 重算。
  const drawFootY = {};
  for (const [key, animation] of Object.entries(meta.animations ?? {})) {
    const bounds = animation.frames?.[0]?.bounds;
    if (bounds) drawFootY[key] = (bounds.bottom + 1) / plan.target;
  }
  if (Object.keys(drawFootY).length) meta.drawFootY = drawFootY;

  meta.compactedFrom = {
    frameW: plan.sourceW,
    frameH: plan.sourceH,
    cropX: plan.cropX,
    cropY: plan.cropY,
    safetyPad: plan.safetyPad,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(meta, null, 2));

  const edgeHits = allFrames.filter(({ frame }) => {
    const b = frame.bounds;
    return b && (b.left <= 3 || b.top <= 3 || b.right >= plan.target - 4 || b.bottom >= plan.target - 4);
  });
  if (edgeHits.length) {
    throw new Error(`compact res=${res}: ${edgeHits.length} 帧仍贴近 ${plan.target}px 边界`);
  }

  const saved = allFrames.length - uniqueCount;
  console.log(
    `  compact res=${res}: ${plan.sourceW}px debug → ${plan.target}px runtime, `
      + `${allFrames.length} refs → ${uniqueCount} unique (dedupe ${saved}), `
      + `crop(${plan.cropX},${plan.cropY}), sheet ${firstPlacement.width}x${firstPlacement.height}`,
  );
  return true;
}

async function main() {
  const requested = process.argv.slice(2).map(Number).filter(Number.isFinite);
  if (!requested.length) throw new Error('请指定需要压缩的 res，例如：58 23');
  for (const res of requested) await compactRes(res);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
