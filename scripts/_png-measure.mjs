/**
 * 量一张截图里"卡槽"的宽度：用列方向的边缘能量做自相关，找重复周期。
 * 用法：node scripts/_png-measure.mjs <图片> [边缘阈值]
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
const buf = readFileSync(file);
let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
  else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  pos += 12 + len;
}
const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
const raw = inflateSync(Buffer.concat(idat));
const stride = width * ch;
const px = Buffer.alloc(height * stride);
let rp = 0;
for (let y = 0; y < height; y += 1) {
  const f = raw[rp]; rp += 1;
  const line = raw.subarray(rp, rp + stride); rp += stride;
  const out = px.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x += 1) {
    const a = x >= ch ? out[x - ch] : 0, b = prev ? prev[x] : 0, c = prev && x >= ch ? prev[x - ch] : 0;
    let v = line[x];
    if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
    else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
    out[x] = v & 255;
  }
}
const lum = (x, y) => { const i = y * stride + x * ch; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; };

// 列边缘能量（对每一列，累加与左列的亮度差）
const colEdge = new Float64Array(width);
for (let x = 1; x < width; x += 1) {
  let s = 0;
  for (let y = 0; y < height; y += 1) s += Math.abs(lum(x, y) - lum(x - 1, y));
  colEdge[x] = s / height;
}
// 自相关找周期
const mean = colEdge.reduce((a, b) => a + b, 0) / width;
const best = [];
for (let lag = 20; lag <= 140; lag += 1) {
  let num = 0, d1 = 0, d2 = 0;
  for (let x = 0; x + lag < width; x += 1) {
    const a = colEdge[x] - mean, b = colEdge[x + lag] - mean;
    num += a * b; d1 += a * a; d2 += b * b;
  }
  const corr = num / Math.sqrt(d1 * d2 || 1);
  best.push({ lag, corr });
}
best.sort((a, b) => b.corr - a.corr);
console.log(`图片 ${width}x${height} | 列边缘均值 ${mean.toFixed(1)}`);
console.log('自相关最强的几个周期（lag = 卡宽 + 间隔）：');
for (const row of best.slice(0, 6)) console.log(`  lag=${row.lag}px  相关度=${row.corr.toFixed(3)}`);
// 边缘峰值位置（前 20 个强边）
const peaks = [];
for (let x = 2; x < width - 2; x += 1) if (colEdge[x] > colEdge[x - 1] && colEdge[x] >= colEdge[x + 1] && colEdge[x] > mean * 1.6) peaks.push(x);
console.log('强边缘 x 位置（前 24 个）:', peaks.slice(0, 24).join(', '));
if (peaks.length > 3) {
  const gaps = [];
  for (let i = 1; i < peaks.length; i += 1) gaps.push(peaks[i] - peaks[i - 1]);
  console.log('相邻强边间隔:', gaps.slice(0, 20).join(', '));
}
