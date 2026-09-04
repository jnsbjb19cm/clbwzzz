import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = path.join(ROOT, 'assets', 'sprites', 'unit_anim', '58.json');
const PNG_PATH = path.join(ROOT, 'assets', 'sprites', 'unit_anim', '58.png');
const ALPHA_THRESHOLD = 96;
const CHROMA_THRESHOLD = 24;
const LOWER_BODY_HEIGHT = 30;

const meta = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const decoded = await sharp(PNG_PATH).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const sheetWidth = Number(decoded.info.width);
const uniform = meta.uniformBounds;

function lowerBodyLeft(frame) {
  let lowerBodyBottom = -1;
  for (let y = 0; y < Number(meta.frameH); y += 1) {
    for (let x = 0; x < Number(meta.frameW); x += 1) {
      const pixel = ((Number(frame.y) + y) * sheetWidth + Number(frame.x) + x) * 4;
      const alpha = decoded.data[pixel + 3];
      const red = decoded.data[pixel];
      const green = decoded.data[pixel + 1];
      const blue = decoded.data[pixel + 2];
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (alpha >= ALPHA_THRESHOLD && chroma >= CHROMA_THRESHOLD) {
        lowerBodyBottom = Math.max(lowerBodyBottom, y);
      }
    }
  }
  if (lowerBodyBottom < 0) return Number(uniform.left);

  let left = Infinity;
  const sampleTop = Math.max(0, lowerBodyBottom - LOWER_BODY_HEIGHT);
  for (let y = sampleTop; y <= lowerBodyBottom; y += 1) {
    for (let x = 0; x < Number(meta.frameW); x += 1) {
      const pixel = ((Number(frame.y) + y) * sheetWidth + Number(frame.x) + x) * 4;
      const alpha = decoded.data[pixel + 3];
      const red = decoded.data[pixel];
      const green = decoded.data[pixel + 1];
      const blue = decoded.data[pixel + 2];
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (alpha < ALPHA_THRESHOLD || chroma < CHROMA_THRESHOLD) continue;
      left = Math.min(left, x);
    }
  }
  return Number.isFinite(left) ? left : Number(uniform.left);
}

const idleAnchors = meta.animations.default.frames.map(lowerBodyLeft);
const stableAnchorX = idleAnchors.reduce((sum, value) => sum + value, 0) / idleAnchors.length;
const attacking = meta.animations.attacking.frames;
for (const frame of attacking) {
  frame.anchorOffsetX = Math.round((stableAnchorX - lowerBodyLeft(frame)) * 100) / 100;
}
meta.visualAnchorPolicy = {
  state: 'attacking',
  anchorKind: 'colored-pedestal-left',
  lowerBodyHeight: LOWER_BODY_HEIGHT,
  alphaThreshold: ALPHA_THRESHOLD,
  chromaThreshold: CHROMA_THRESHOLD,
  stableAnchorX: Math.round(stableAnchorX * 100) / 100,
};
fs.writeFileSync(JSON_PATH, `${JSON.stringify(meta, null, 2)}\n`);

const offsets = attacking.map((frame) => Number(frame.anchorOffsetX) || 0);
console.log(`res 58 attack anchor offsets ${Math.min(...offsets)}..${Math.max(...offsets)}`);
