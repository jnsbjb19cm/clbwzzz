/**
 * 从 卡槽参考.png 裁切：
 * - card_slot_frame.png   单槽银框
 * - slot_lock.png         锁头
 * - top_bar_strip.png     整条顶栏(抹除卡槽区，保留银框+天空+左侧藤蔓)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'resources/background/卡槽参考.png');
const PARTS = path.join(ROOT, 'assets/sprites/parts');
const BG_OUT = path.join(ROOT, 'assets/battle/background');

fs.mkdirSync(PARTS, { recursive: true });
fs.mkdirSync(BG_OUT, { recursive: true });

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;

let bestX = 0;
let bestScore = 0;
const scanY0 = Math.floor(h * 0.15);
const scanY1 = Math.floor(h * 0.85);
for (let x = Math.floor(w * 0.35); x < w - 80; x++) {
  let silver = 0;
  let brown = 0;
  for (let y = scanY0; y < scanY1; y++) {
    const i = (y * w + x) * ch;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 160 && g > 160 && b > 160) silver++;
    if (r > 90 && r < 160 && g > 40 && g < 110 && b > 20 && b < 70) brown++;
  }
  const score = silver + brown * 0.5;
  if (score > bestScore) {
    bestScore = score;
    bestX = x;
  }
}

const slotW = 88;
const slotH = 58;
const slotLeft = Math.max(0, bestX - 2);
const slotTop = Math.round((h - slotH) / 2);
const slotGap = 4;

await sharp(SRC)
  .extract({ left: slotLeft, top: slotTop, width: slotW, height: slotH })
  .png()
  .toFile(path.join(PARTS, 'card_slot_frame.png'));
console.log('wrote card_slot_frame.png', { slotLeft, slotTop, detectX: bestX });

const lockPad = 6;
await sharp(SRC)
  .extract({
    left: slotLeft + lockPad,
    top: slotTop + lockPad,
    width: slotW - lockPad * 2,
    height: slotH - lockPad * 2,
  })
  .png()
  .toFile(path.join(PARTS, 'slot_lock.png'));
console.log('wrote slot_lock.png');

const barPixels = Buffer.from(data);
const slotCount = Math.min(12, Math.floor((w - slotLeft - 8) / (slotW + slotGap)));

let skyR = 168;
let skyG = 205;
let skyB = 235;
{
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = slotTop + 4; y < slotTop + slotH - 4; y++) {
    for (let x = slotLeft - 50; x < slotLeft - 6; x++) {
      if (x < 0) continue;
      const i = (y * w + x) * ch;
      sr += barPixels[i];
      sg += barPixels[i + 1];
      sb += barPixels[i + 2];
      n++;
    }
  }
  if (n > 0) {
    skyR = Math.round(sr / n);
    skyG = Math.round(sg / n);
    skyB = Math.round(sb / n);
  }
}

for (let si = 0; si < slotCount; si++) {
  const sx = slotLeft + si * (slotW + slotGap);
  const sy = slotTop;
  for (let y = sy; y < sy + slotH; y++) {
    for (let x = sx; x < sx + slotW; x++) {
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const i = (y * w + x) * ch;
      barPixels[i] = skyR;
      barPixels[i + 1] = skyG;
      barPixels[i + 2] = skyB;
      if (ch === 4) barPixels[i + 3] = 255;
    }
  }
}

const stripOut = path.join(BG_OUT, 'top_bar_strip.png');
await sharp(barPixels, { raw: { width: w, height: h, channels: ch } }).png().toFile(stripOut);
console.log('wrote top_bar_strip.png', { w, h, slotCount, slotLeft, slotTop });

const meta = { sourceW: w, sourceH: h, slotLeft, slotTop, slotW, slotH, slotGap, slotCount };
fs.writeFileSync(path.join(BG_OUT, 'top_bar_meta.json'), JSON.stringify(meta, null, 2));
console.log('wrote top_bar_meta.json');