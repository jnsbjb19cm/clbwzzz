/**
 * 1248x832 战斗 UI 预览合成
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts');
const layout = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/battle/battleUiLayout.json'), 'utf8'),
);

const W = layout.canvas.w;
const H = layout.canvas.h;
const assets = (p) => path.join(ROOT, 'assets', p.replace(/^\//, ''));

const topLeft = layout.topUi.left;
const topRight = layout.topUi.right;
const topW = W - topLeft - topRight;
const scale = topW / layout.barSource.w;
const topH = Math.round(layout.barSource.h * scale);
const top = layout.topUi.top;

fs.mkdirSync(OUT_DIR, { recursive: true });
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const grass = await loadImage(assets('/battle/background/grassbg.jpg'));
const leftCol = await loadImage(assets('/battle/background/leftcolumn1.png'));
const rightCol = await loadImage(assets('/battle/background/rightcolumn1.png'));
const barStrip = await loadImage(assets('/battle/background/top_bar_strip.png'));
const slotFrame = await loadImage(assets('/sprites/parts/card_slot_frame.png'));
const resSun = await loadImage(assets('/battle/jungle/res_sun.png'));
const resFood = await loadImage(assets('/battle/jungle/res_food.png'));
const hpLeft = await loadImage(assets('/sprites/parts/HeroHP_left_bg.png'));
const hpRight = await loadImage(assets('/sprites/parts/HeroHP_right_bg.png'));

const grassScale = Math.max(W / grass.width, H / grass.height);
ctx.drawImage(grass, (W - grass.width * grassScale) / 2, H * 0.62 - (grass.height * grassScale) / 2, grass.width * grassScale, grass.height * grassScale);

const colH = H + 25;
ctx.drawImage(leftCol, 0, 0, (leftCol.width / leftCol.height) * colH, colH);
const rcW = (rightCol.width / rightCol.height) * H;
ctx.drawImage(rightCol, W - rcW, 0, rcW, H);

ctx.drawImage(barStrip, topLeft, top, topW, topH);

const drawResNum = (src, num) => {
  const x = topLeft + Math.round(src.x * scale);
  const y = top + Math.round(src.y * scale);
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeText(String(num), x, y);
  ctx.fillText(String(num), x, y);
};
drawResNum(layout.resourcesSource.sun, 10);
drawResNum(layout.resourcesSource.food, 10);

const sl = layout.slotsSource;
const rowX = topLeft + Math.round(sl.left * scale);
const rowY = top + Math.round(sl.top * scale);
const gap = Math.max(2, Math.round(sl.gap * scale));
const areaW = topW - Math.round(sl.left * scale) - Math.round(8 * scale);
const slotW = Math.floor((areaW - gap * 9) / 10);
const slotH = Math.round((slotW * sl.h) / sl.w);

for (let i = 0; i < 10; i++) {
  const x = rowX + i * (slotW + gap);
  ctx.drawImage(slotFrame, x, rowY, slotW, slotH);
}

ctx.drawImage(hpLeft, 18, 108, 197, 43);
ctx.drawImage(hpRight, W - 18 - 197, 108, 197, 43);

const outPath = path.join(OUT_DIR, 'battle-ui-preview.png');
fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log('wrote', outPath, { topW, topH, slotW, slotH });