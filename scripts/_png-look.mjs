/**
 * 把 PNG 解码成像素，并输出：
 *   ① 尺寸
 *   ② 降采样后的 ASCII 亮度图（用来"看"布局）
 *   ③ 指定横条区域的颜色变化（用来量卡片宽度/间距）
 *
 * 用途：本机 ReadImage 工具坏了（spawn EINVAL），只能靠代码"看"截图。
 * 用法：node scripts/_png-look.mjs <图片路径> [分析区域: y0 y1]
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
const buf = readFileSync(file);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');

let pos = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    bitDepth = data[8]; colorType = data[9]; interlace = data[12];
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  pos += 12 + len;
}
console.log(`尺寸: ${width} x ${height} | bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`);
if (bitDepth !== 8 || interlace !== 0) { console.log('（暂只支持 8bit 非隔行）'); process.exit(0); }

const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
if (!channels) { console.log('不支持的 colorType', colorType); process.exit(0); }

const raw = inflateSync(Buffer.concat(idat));
const stride = width * channels;
const px = Buffer.alloc(height * stride);
let rp = 0;
for (let y = 0; y < height; y += 1) {
  const filter = raw[rp]; rp += 1;
  const line = raw.subarray(rp, rp + stride); rp += stride;
  const out = px.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x += 1) {
    const a = x >= channels ? out[x - channels] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= channels ? prev[x - channels] : 0;
    let v = line[x];
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) {
      const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
    }
    out[x] = v & 255;
  }
}
const at = (x, y) => {
  const i = y * stride + x * channels;
  return [px[i], px[i + 1] ?? px[i], px[i + 2] ?? px[i]];
};

// ① ASCII 亮度图（降采样）
const cols = 110, rows = 42;
const ramp = ' .:-=+*#%@';
let art = '';
for (let ry = 0; ry < rows; ry += 1) {
  let line = '';
  for (let rx = 0; rx < cols; rx += 1) {
    const x0 = Math.floor(rx * width / cols), x1 = Math.max(x0 + 1, Math.floor((rx + 1) * width / cols));
    const y0 = Math.floor(ry * height / rows), y1 = Math.max(y0 + 1, Math.floor((ry + 1) * height / rows));
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const [r, g, b] = at(x, y); sum += 0.299 * r + 0.587 * g + 0.114 * b; n += 1; }
    const lum = n ? sum / n : 0;
    line += ramp[Math.min(ramp.length - 1, Math.floor(lum / 256 * ramp.length))];
  }
  art += line + '\n';
}
console.log('\n=== 亮度图（越靠右越亮：' + ramp + '）===');
console.log(art);

// ② 指定横条：找"颜色跳变"（量卡片边界）
const y0 = Number(process.argv[3] ?? Math.floor(height * 0.6));
const y1 = Number(process.argv[4] ?? y0 + 4);
const row = Math.floor((y0 + y1) / 2);
console.log(`=== 第 ${row} 行的横向颜色跳变（量卡片宽度/间距）===`);
let prev = null, runs = [];
for (let x = 0; x < width; x += 1) {
  const [r, g, b] = at(x, row);
  const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
  if (prev === null || key !== prev) { runs.push({ x, r, g, b }); prev = key; }
}
for (let i = 0; i < Math.min(runs.length, 60); i += 1) {
  const run = runs[i];
  const next = runs[i + 1];
  console.log(`x=${run.x} (宽 ${next ? next.x - run.x : '?'}) rgb(${run.r},${run.g},${run.b})`);
}
