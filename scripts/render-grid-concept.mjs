/**
 * 输出格子布局概念图(结构示意，非游戏截图)。
 * 用法: node scripts/render-grid-concept.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OUT = path.resolve(import.meta.dirname, 'output/grid-layout-concept.png');

const COLS = 12;
const LANES = 5;
const PLAYER = 5;
const BUFFER = 2;
const ENEMY = 5;

const spec = {
  fieldW: 978,
  boxTop: 81,
  boxH: 574,
  cell: 78.67,
  gap: 3,
  vPad: 0,
  row0: 81,
  row4Bottom: 486.33,
  corridorTop: 87,
  corridorBottom: 645,
};

const bodyW = COLS * spec.cell + (COLS - 1) * spec.gap;
const bodyH = LANES * spec.cell + (LANES - 1) * spec.gap;

const W = 1100;
const H = 820;
const pad = 40;
const diagramW = W - pad * 2;
const diagramH = 520;
const ox = pad + 80;
const oy = pad + 100;

const scaleX = (diagramW - 120) / spec.fieldW;
const scaleY = (diagramH - 40) / 680;

function fy(y) {
  return oy + y * scaleY;
}
function fx(x) {
  return ox + x * scaleX;
}
function fw(w) {
  return w * scaleX;
}
function fh(h) {
  return h * scaleY;
}

const zones = [
  { cols: PLAYER, fill: '#166534', stroke: '#4ade80', label: '我方 5列' },
  { cols: BUFFER, fill: '#713f12', stroke: '#fbbf24', label: '缓冲 2列' },
  { cols: ENEMY, fill: '#7f1d1d', stroke: '#f87171', label: '敌方 5列' },
];

let colCursor = 0;
const zoneRects = zones.map((z) => {
  const x = fx(colCursor * (spec.cell + spec.gap));
  const w = fw(z.cols * spec.cell + (z.cols - 1) * spec.gap);
  const rect = { ...z, x, w };
  colCursor += z.cols;
  return rect;
});

const gridTop = fy(spec.row0);
const gridH = fh(bodyH);
const boxTop = fy(spec.boxTop);
const boxH = fh(spec.boxH);

let cellsSvg = '';
for (let lane = 0; lane < LANES; lane++) {
  for (let col = 0; col < COLS; col++) {
    const x = fx(col * (spec.cell + spec.gap));
    const y = fy(spec.row0 + lane * (spec.cell + spec.gap));
    cellsSvg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${fw(spec.cell).toFixed(1)}" height="${fh(spec.cell).toFixed(1)}" fill="rgba(255,255,255,0.06)" stroke="#fde047" stroke-width="1.2"/>`;
  }
}

const zoneSvg = zoneRects
  .map(
    (z) => `
  <rect x="${z.x.toFixed(1)}" y="${gridTop.toFixed(1)}" width="${z.w.toFixed(1)}" height="${gridH.toFixed(1)}" fill="${z.fill}" fill-opacity="0.35" stroke="${z.stroke}" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="${(z.x + z.w / 2).toFixed(1)}" y="${(gridTop + gridH / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="14" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">${z.label}</text>`,
  )
  .join('');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="${pad}" y="42" fill="#7dd3fc" font-size="22" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">丛林战场格子布局 — 概念图</text>
  <text x="${pad}" y="68" fill="#94a3b8" font-size="13" font-family="Segoe UI, Microsoft YaHei, sans-serif">依据 更改意见.png 蓝框 · 顶对齐 · 12×5 正方形 · 5+2+5 列分区</text>

  <!-- field 外框 -->
  <rect x="${fx(0).toFixed(1)}" y="${fy(0).toFixed(1)}" width="${fw(spec.fieldW).toFixed(1)}" height="${fh(680).toFixed(1)}" fill="#14532d" fill-opacity="0.25" stroke="#64748b" stroke-width="2" rx="4"/>
  <text x="${fx(spec.fieldW / 2).toFixed(1)}" y="${(fy(0) - 8).toFixed(1)}" text-anchor="middle" fill="#94a3b8" font-size="12" font-family="Segoe UI, Microsoft YaHei, sans-serif">battlefield field ${spec.fieldW}×702</text>

  <!-- 走廊参考 -->
  <line x1="${fx(0).toFixed(1)}" y1="${fy(spec.corridorTop).toFixed(1)}" x2="${fx(spec.fieldW).toFixed(1)}" y2="${fy(spec.corridorTop).toFixed(1)}" stroke="#4ade80" stroke-width="2" stroke-dasharray="8 5"/>
  <text x="${(fx(spec.fieldW) + 12).toFixed(1)}" y="${fy(spec.corridorTop).toFixed(1)}" fill="#4ade80" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">绿 胡须Y=87</text>
  <line x1="${fx(0).toFixed(1)}" y1="${fy(spec.corridorBottom).toFixed(1)}" x2="${fx(spec.fieldW).toFixed(1)}" y2="${fy(spec.corridorBottom).toFixed(1)}" stroke="#fb923c" stroke-width="2" stroke-dasharray="8 5"/>
  <text x="${(fx(spec.fieldW) + 12).toFixed(1)}" y="${fy(spec.corridorBottom).toFixed(1)}" fill="#fb923c" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">橙 树根Y=645</text>

  <!-- 用户蓝框 -->
  <rect x="${fx(0).toFixed(1)}" y="${boxTop.toFixed(1)}" width="${fw(spec.fieldW).toFixed(1)}" height="${boxH.toFixed(1)}" fill="none" stroke="#22d3ee" stroke-width="3"/>
  <text x="${(fx(0) - 8).toFixed(1)}" y="${(boxTop + 16).toFixed(1)}" text-anchor="end" fill="#22d3ee" font-size="12" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">蓝框顶 Y=81</text>
  <text x="${(fx(0) - 8).toFixed(1)}" y="${(boxTop + boxH).toFixed(1)}" text-anchor="end" fill="#22d3ee" font-size="12" font-family="Segoe UI, Microsoft YaHei, sans-serif">蓝框底</text>

  ${zoneSvg}
  ${cellsSvg}

  <!-- 行标注 -->
  <text x="${(fx(0) - 12).toFixed(1)}" y="${(gridTop + 8).toFixed(1)}" text-anchor="end" fill="#fde047" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">row0=81</text>
  <text x="${(fx(0) - 12).toFixed(1)}" y="${(gridTop + gridH).toFixed(1)}" text-anchor="end" fill="#fde047" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">row4底≈486</text>

  <!-- 公式区 -->
  <rect x="${pad}" y="${H - 200}" width="${W - pad * 2}" height="170" rx="10" fill="rgba(15,23,42,0.85)" stroke="#334155"/>
  <text x="${pad + 16}" y="${H - 172}" fill="#e2e8f0" font-size="14" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">BattleConfig 公式(顶对齐版)</text>
  <text x="${pad + 16}" y="${H - 148}" fill="#cbd5e1" font-size="12" font-family="Consolas, monospace">GRID_ORIGIN_X=0  GRID_ORIGIN_Y=81  GRID_V_PAD=0</text>
  <text x="${pad + 16}" y="${H - 126}" fill="#cbd5e1" font-size="12" font-family="Consolas, monospace">CELL = min((978-33)/12, (574-12)/5) = ${spec.cell}px 正方形</text>
  <text x="${pad + 16}" y="${H - 104}" fill="#cbd5e1" font-size="12" font-family="Consolas, monospace">cellX(c)=0+c*(CELL+3)   cellY(l)=81+l*(CELL+3)</text>
  <text x="${pad + 16}" y="${H - 82}" fill="#cbd5e1" font-size="12" font-family="Consolas, monospace">列区: 0-4我方 | 5-6缓冲 | 7-11敌方</text>
  <text x="${pad + 16}" y="${H - 60}" fill="#94a3b8" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">蓝框高于 5 行格体时：格体贴顶排列，蓝框下方至橙线仍为草地(非格子)</text>
  <text x="${pad + 16}" y="${H - 40}" fill="#94a3b8" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">选卡 overlay：仅黄角+红压，无区域贴图</text>

  <!-- 图例 -->
  <rect x="${W - pad - 200}" y="${oy}" width="190" height="130" rx="8" fill="rgba(0,0,0,0.35)" stroke="#475569"/>
  <text x="${W - pad - 190}" y="${oy + 22}" fill="#fff" font-size="12" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">图例</text>
  <line x1="${W - pad - 190}" y1="${oy + 38}" x2="${W - pad - 150}" y2="${oy + 38}" stroke="#22d3ee" stroke-width="3"/><text x="${W - pad - 140}" y="${oy + 42}" fill="#ccc" font-size="11">蓝框(用户指定区域)</text>
  <line x1="${W - pad - 190}" y1="${oy + 58}" x2="${W - pad - 150}" y2="${oy + 58}" stroke="#fde047" stroke-width="2"/><text x="${W - pad - 140}" y="${oy + 62}" fill="#ccc" font-size="11">黄格(12×5 单元)</text>
  <line x1="${W - pad - 190}" y1="${oy + 78}" x2="${W - pad - 150}" y2="${oy + 78}" stroke="#4ade80" stroke-width="2" stroke-dasharray="5 3"/><text x="${W - pad - 140}" y="${oy + 82}" fill="#ccc" font-size="11">绿线(走廊上沿)</text>
  <line x1="${W - pad - 190}" y1="${oy + 98}" x2="${W - pad - 150}" y2="${oy + 98}" stroke="#fb923c" stroke-width="2" stroke-dasharray="5 3"/><text x="${W - pad - 140}" y="${oy + 102}" fill="#ccc" font-size="11">橙线(走廊下沿)</text>
  <rect x="${W - pad - 190}" y="${oy + 110}" width="30" height="12" fill="#166534" fill-opacity="0.5" stroke="#4ade80"/><text x="${W - pad - 140}" y="${oy + 120}" fill="#ccc" font-size="11">5+2+5 分区</text>
</svg>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log('概念图:', OUT);