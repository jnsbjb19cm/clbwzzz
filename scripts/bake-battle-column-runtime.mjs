import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets', 'battle', 'background');
const ALPHA_THRESHOLD = 8;
const SIDE_PADDING = 24;

for (const name of [
  'leftrock',
  'rightrock',
  'leftice',
  'rightice',
  'mushroomleft',
  'mushroomright',
]) {
  const input = path.join(DIR, `${name}.png`);
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = Number(decoded.info.width);
  const height = Number(decoded.info.height);
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (decoded.data[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (right < left) throw new Error(`${name} has no visible pixels`);
  const cropLeft = Math.max(0, left - SIDE_PADDING);
  const cropRight = Math.min(width - 1, right + SIDE_PADDING);
  const cropWidth = cropRight - cropLeft + 1;
  await sharp(input)
    .extract({ left: cropLeft, top: 0, width: cropWidth, height })
    .png()
    .toFile(path.join(DIR, `${name}-column.png`));
  console.log(`${name}: ${width}x${height} -> ${cropWidth}x${height}`);
}
