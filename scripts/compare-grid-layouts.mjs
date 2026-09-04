/**
 * 对比三种格子布局，输出标注图供选定方案后再改 BattleConfig。
 * 用法: node scripts/compare-grid-layouts.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const BG_PATH = path.join(ROOT, 'assets/battle/jungle/background.jpg');
const REF_PATH =
  'C:/Users/佰震/Pictures/Screenshots/屏幕截图 2026-06-24 170721.png';
const OUT_DIR = path.join(ROOT, 'scripts/output');

const GAME_W = 1248;
const GAME_H = 832;
const FIELD_LEFT = 135;
const FIELD_TOP = 105;
const FIELD_W = GAME_W - FIELD_LEFT * 2;
const FIELD_H = GAME_H - FIELD_TOP - 25;
const LANES = 5;
const COLS = 12;
const GAP = 3;

/** 170721 实测格子外框(橙线 bbox) */
const REF_W = 1201;
const REF_H = 705;
const REF_GRID = { left: 60, right: 1055, top: 126, bottom: 506 };

/** 草地走廊地标(仅画参考线，不作格子外框高) */
const CORRIDOR = {
  originX: 1,
  originY: 87,
  rootTop: 645,
  rightMargin: 64,
};

function buildSquareGrid({ name, originX, originY, innerW, innerH }) {
  const cellSize = Math.min(
    (innerW - GAP * (COLS - 1)) / COLS,
    (innerH - GAP * (LANES - 1)) / LANES,
  );
  const bodyW = COLS * cellSize + (COLS - 1) * GAP;
  const bodyH = LANES * cellSize + (LANES - 1) * GAP;
  const vPad = (innerH - bodyH) / 2;
  const boxBottom = originY + innerH;
  const row0Y = originY + vPad;
  return {
    name,
    originX,
    originY,
    innerW,
    innerH,
    boxBottom,
    GRID_GAP: GAP,
    CELL_W: cellSize,
    CELL_H: cellSize,
    GRID_BODY_W: bodyW,
    GRID_BODY_H: bodyH,
    GRID_V_PAD: vPad,
    row0Y,
    row4Bottom: row0Y + 4 * (cellSize + GAP) + cellSize,
  };
}

/** 当前：走廊全高 + 垂直居中(172609 问题方案) */
function layoutCurrent() {
  const innerW = FIELD_W - CORRIDOR.originX - CORRIDOR.rightMargin;
  const innerH = CORRIDOR.rootTop - CORRIDOR.originY;
  return buildSquareGrid({
    name: 'current',
    originX: CORRIDOR.originX,
    originY: CORRIDOR.originY,
    innerW,
    innerH,
  });
}

/** 方案 A：170721 外框宽高比映射到 game 坐标 */
function layoutYoutubeBbox() {
  const gridLeftGame = (REF_GRID.left / REF_W) * GAME_W;
  const gridRightGame = (REF_GRID.right / REF_W) * GAME_W;
  const gridTopGame = (REF_GRID.top / REF_H) * GAME_H;
  const gridBottomGame = (REF_GRID.bottom / REF_H) * GAME_H;

  const originX = Math.max(0, gridLeftGame - FIELD_LEFT);
  const originY = gridTopGame - FIELD_TOP;
  const innerW = gridRightGame - FIELD_LEFT - originX;
  const innerH = gridBottomGame - gridTopGame;

  return buildSquareGrid({
    name: 'youtube_bbox',
    originX,
    originY,
    innerW,
    innerH,
  });
}

/** 方案 B：横向顶满走廊，竖向跟 YouTube 比例框 */
function layoutFullWidth() {
  const gridTopGame = (REF_GRID.top / REF_H) * GAME_H;
  const gridBottomGame = (REF_GRID.bottom / REF_H) * GAME_H;
  const innerW = FIELD_W - CORRIDOR.originX - CORRIDOR.rightMargin;
  const innerH = gridBottomGame - gridTopGame;

  return buildSquareGrid({
    name: 'full_width',
    originX: CORRIDOR.originX,
    originY: gridTopGame - FIELD_TOP,
    innerW,
    innerH,
  });
}

/** 蓝框(YouTube 170721 竖向比例 + 走廊全宽)— current 按此扩展的目标 */
function layoutBlueBox() {
  return layoutFullWidth();
}

function refBboxInRefImage() {
  return {
    left: REF_GRID.left,
    top: REF_GRID.top,
    width: REF_GRID.right - REF_GRID.left,
    height: REF_GRID.bottom - REF_GRID.top,
  };
}

/** 把我们的布局映射到 170721 参考图坐标(用于叠图对比) */
function layoutToRefCoords(layout) {
  const sx = REF_W / GAME_W;
  const sy = REF_H / GAME_H;
  const gameLeft = FIELD_LEFT + layout.originX;
  const gameTop = FIELD_TOP + layout.originY;
  return {
    left: gameLeft * sx,
    top: gameTop * sy,
    width: layout.innerW * sx,
    height: layout.innerH * sy,
    cellW: layout.CELL_W * sx,
    cellH: layout.CELL_H * sy,
    vPad: layout.GRID_V_PAD * sy,
    gap: GAP * sx,
  };
}

function createOverlayBuffer(w, h, srcData, srcCh, drawFn) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const si = i * srcCh;
    const di = i * 4;
    rgba[di] = srcData[si];
    rgba[di + 1] = srcData[si + 1];
    rgba[di + 2] = srcData[si + 2];
    rgba[di + 3] = 255;
  }

  const setPixel = (gx, gy, r, g, b, a = 230) => {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
    const i = (gy * w + gx) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  const drawHLineField = (fy, color, x0, x1, thick = 1) => {
    const gy = FIELD_TOP + fy;
    for (let t = 0; t < thick; t++) {
      for (let gx = FIELD_LEFT + x0; gx <= FIELD_LEFT + x1; gx++) {
        setPixel(gx, gy + t, ...color);
      }
    }
  };

  const drawVLineField = (fx, color, y0, y1, thick = 1) => {
    const gx = FIELD_LEFT + fx;
    for (let t = 0; t < thick; t++) {
      for (let gy = FIELD_TOP + y0; gy <= FIELD_TOP + y1; gy++) {
        setPixel(gx + t, gy, ...color);
      }
    }
  };

  const drawRectField = (fx, fy, fw, fh, color, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let x = fx; x <= fx + fw; x++) {
        drawHLineField(fy + t, color, x, x);
        drawHLineField(fy + fh - t, color, x, x);
      }
      for (let y = fy; y <= fy + fh; y++) {
        drawVLineField(fx + t, color, y, y);
        drawVLineField(fx + fw - t, color, y, y);
      }
    }
  };

  const drawCells = (layout, color = [255, 220, 0], alpha = 230) => {
    const { originX, originY, CELL_W, CELL_H, GRID_V_PAD: vPad } = layout;
    for (let lane = 0; lane < LANES; lane++) {
      for (let col = 0; col < COLS; col++) {
        const x0 = Math.round(originX + col * (CELL_W + GAP));
        const y0 = Math.round(originY + vPad + lane * (CELL_H + GAP));
        const x1 = Math.round(x0 + CELL_W);
        const y1 = Math.round(y0 + CELL_H);
        for (let x = FIELD_LEFT + x0; x <= FIELD_LEFT + x1; x++) {
          setPixel(x, FIELD_TOP + y0, ...color, alpha);
          setPixel(x, FIELD_TOP + y1, ...color, alpha);
        }
        for (let y = FIELD_TOP + y0; y <= FIELD_TOP + y1; y++) {
          setPixel(FIELD_LEFT + x0, y, ...color, alpha);
          setPixel(FIELD_LEFT + x1, y, ...color, alpha);
        }
      }
    }
  };

  const fillRectField = (fx, fy, fw, fh, color, alpha = 40) => {
    for (let y = fy; y <= fy + fh; y++) {
      for (let x = fx; x <= fx + fw; x++) {
        const gx = FIELD_LEFT + x;
        const gy = FIELD_TOP + y;
        if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
        const i = (gy * w + gx) * 4;
        rgba[i] = Math.round(rgba[i] * (1 - alpha / 255) + color[0] * (alpha / 255));
        rgba[i + 1] = Math.round(rgba[i + 1] * (1 - alpha / 255) + color[1] * (alpha / 255));
        rgba[i + 2] = Math.round(rgba[i + 2] * (1 - alpha / 255) + color[2] * (alpha / 255));
      }
    }
  };

  drawFn({
    setPixel,
    drawHLineField,
    drawVLineField,
    drawRectField,
    drawCells,
    fillRectField,
  });
  return rgba;
}

function labelSvg(title, lines, w, h) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rowH = 18;
  const boxH = 28 + lines.length * rowH;
  const text = lines.map((l, i) => {
    const y = 42 + i * rowH;
    return `<text x="14" y="${y}" fill="#fff" font-size="13" font-family="Segoe UI, Microsoft YaHei, sans-serif">${esc(l)}</text>`;
  }).join('');
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="420" height="${boxH}" rx="8" fill="rgba(8,12,18,0.82)" stroke="rgba(255,255,255,0.25)"/>
  <text x="14" y="30" fill="#7dd3fc" font-size="15" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">${esc(title)}</text>
  ${text}
  <text x="14" y="${20 + boxH}" fill="#fbbf24" font-size="12" font-family="Segoe UI, Microsoft YaHei, sans-serif">绿线=胡须87  橙线=树根645  蓝框=格子外框  黄线=12x5单元格</text>
</svg>`);
}

function layoutLabelLines(layout) {
  return [
    `originY=${layout.originY.toFixed(1)}  boxH=${layout.innerH.toFixed(1)}  bottom=${layout.boxBottom.toFixed(1)}`,
    `cell=${layout.CELL_W.toFixed(1)}px  vPad=${layout.GRID_V_PAD.toFixed(1)}  row0Y=${layout.row0Y.toFixed(1)}`,
    `body ${layout.GRID_BODY_W.toFixed(0)}x${layout.GRID_BODY_H.toFixed(0)}  inner ${layout.innerW.toFixed(0)}x${layout.innerH.toFixed(0)}`,
  ];
}

async function renderOnBackground(layout, outName, title) {
  const { data, info } = await sharp(BG_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rgba = createOverlayBuffer(w, h, data, ch, ({ drawHLineField, drawVLineField, drawRectField, drawCells }) => {
    drawHLineField(CORRIDOR.originY, [0, 255, 120], 0, FIELD_W - 1, 2);
    drawHLineField(CORRIDOR.rootTop, [255, 120, 0], 0, FIELD_W - 1, 2);
    drawVLineField(CORRIDOR.originX, [0, 200, 100], CORRIDOR.originY, CORRIDOR.rootTop, 1);
    drawVLineField(FIELD_W - CORRIDOR.rightMargin, [0, 200, 100], CORRIDOR.originY, CORRIDOR.rootTop, 1);

    drawRectField(
      layout.originX,
      layout.originY,
      layout.innerW,
      layout.innerH,
      [60, 140, 255],
      2,
    );
    drawCells(layout);
  });

  const base = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const label = labelSvg(title, layoutLabelLines(layout), w, h);
  const labeled = await sharp(base)
    .composite([{ input: label, top: 0, left: 0 }])
    .png()
    .toFile(path.join(OUT_DIR, outName));
  return labeled;
}

function expandedExplainSvg(current, expanded, w, h) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [
    '【改法】在保留 current 横向顶满(12列)前提下，把格子外框缩到蓝线范围：',
    `① 外框顶 GRID_ORIGIN_Y：${current.originY.toFixed(0)} → ${expanded.originY.toFixed(0)}(改用蓝框顶，不再从绿线87起算)`,
    `② 外框高 GRID_BOX_H：${current.innerH.toFixed(0)} → ${expanded.innerH.toFixed(0)}(不再用走廊全高558，改用YouTube比例448)`,
    `③ 垂直留白 vPad：${current.GRID_V_PAD.toFixed(0)} → ${expanded.GRID_V_PAD.toFixed(0)}；首行 row0Y：${current.row0Y.toFixed(0)} → ${expanded.row0Y.toFixed(0)}`,
    `④ 格子边长 cell 不变：${current.CELL_W.toFixed(1)}px(仍由12列宽决定)；黄格整体上移并铺满蓝框`,
    '红虚格=改前(current)  黄实格=改后(按蓝框扩展)  蓝框=目标外框',
  ];
  const rowH = 20;
  const boxH = 36 + lines.length * rowH;
  const text = lines
    .map((l, i) => {
      const y = 52 + i * rowH;
      const fill = i === 0 ? '#7dd3fc' : '#fff';
      const weight = i === 0 ? '700' : '400';
      return `<text x="14" y="${y}" fill="${fill}" font-size="13" font-weight="${weight}" font-family="Segoe UI, Microsoft YaHei, sans-serif">${esc(l)}</text>`;
    })
    .join('');
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="${Math.min(w - 16, 1180)}" height="${boxH}" rx="8" fill="rgba(8,12,18,0.9)" stroke="rgba(96,165,250,0.6)" stroke-width="2"/>
  <text x="14" y="32" fill="#60a5fa" font-size="16" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">current 按蓝框扩展 — 改法说明</text>
  ${text}
</svg>`);
}

/** 单图：蓝框 + 改前红格 + 改后黄格 + 改动说明 */
async function renderCurrentExpandedOverlay(current, expanded) {
  const { data, info } = await sharp(BG_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rgba = createOverlayBuffer(w, h, data, ch, ({
    drawHLineField,
    drawVLineField,
    drawRectField,
    drawCells,
    fillRectField,
  }) => {
    drawHLineField(CORRIDOR.originY, [0, 255, 120], 0, FIELD_W - 1, 2);
    drawHLineField(CORRIDOR.rootTop, [255, 120, 0], 0, FIELD_W - 1, 2);

    fillRectField(
      expanded.originX,
      current.originY,
      expanded.innerW,
      current.innerH,
      [255, 60, 60],
      18,
    );

    drawRectField(
      expanded.originX,
      expanded.originY,
      expanded.innerW,
      expanded.innerH,
      [60, 140, 255],
      3,
    );

    drawCells(current, [255, 90, 90], 200);
    drawCells(expanded, [255, 220, 0], 255);

    const padTop = expanded.originY - current.originY;
    const padBottom = current.boxBottom - expanded.boxBottom;
    if (padTop > 4) {
      fillRectField(expanded.originX, current.originY, expanded.innerW, padTop, [255, 180, 0], 35);
    }
    if (padBottom > 4) {
      fillRectField(
        expanded.originX,
        expanded.boxBottom,
        expanded.innerW,
        padBottom,
        [255, 180, 0],
        35,
      );
    }
  });

  const base = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const label = expandedExplainSvg(current, expanded, w, h);
  await sharp(base)
    .composite([{ input: label, top: 0, left: 0 }])
    .png()
    .toFile(path.join(OUT_DIR, 'grid-layout-current-expanded.png'));
}

/** 左右对比：左=current原图 右=按蓝框扩展后 */
async function renderSideBySide(current, expanded) {
  const { data, info } = await sharp(BG_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const leftRgba = createOverlayBuffer(w, h, data, ch, ({
    drawHLineField,
    drawRectField,
    drawCells,
  }) => {
    drawHLineField(CORRIDOR.originY, [0, 255, 120], 0, FIELD_W - 1, 2);
    drawHLineField(CORRIDOR.rootTop, [255, 120, 0], 0, FIELD_W - 1, 2);
    drawRectField(
      current.originX,
      current.originY,
      current.innerW,
      current.innerH,
      [60, 140, 255],
      2,
    );
    drawCells(current);
  });

  const rightRgba = createOverlayBuffer(w, h, data, ch, ({
    drawHLineField,
    drawRectField,
    drawCells,
  }) => {
    drawHLineField(CORRIDOR.originY, [0, 255, 120], 0, FIELD_W - 1, 2);
    drawHLineField(CORRIDOR.rootTop, [255, 120, 0], 0, FIELD_W - 1, 2);
    drawRectField(
      expanded.originX,
      expanded.originY,
      expanded.innerW,
      expanded.innerH,
      [60, 140, 255],
      3,
    );
    drawCells(expanded);
  });

  const panelW = Math.floor(w / 2);
  const leftBuf = await sharp(leftRgba, { raw: { width: w, height: h, channels: 4 } })
    .resize(panelW, h)
    .png()
    .toBuffer();
  const rightBuf = await sharp(rightRgba, { raw: { width: w, height: h, channels: 4 } })
    .resize(panelW, h)
    .png()
    .toBuffer();

  const legend = Buffer.from(`<svg width="${panelW * 2}" height="56" xmlns="http://www.w3.org/2000/svg">
  <rect width="${panelW * 2}" height="56" fill="rgba(8,12,18,0.92)"/>
  <text x="${panelW / 2}" y="22" text-anchor="middle" fill="#f87171" font-size="14" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">左：改前 current(走廊全高+居中)</text>
  <text x="${panelW + panelW / 2}" y="22" text-anchor="middle" fill="#fbbf24" font-size="14" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">右：按蓝框扩展后</text>
  <text x="${panelW / 2}" y="44" text-anchor="middle" fill="#ccc" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">row0Y=${current.row0Y.toFixed(0)} vPad=${current.GRID_V_PAD.toFixed(0)}</text>
  <text x="${panelW + panelW / 2}" y="44" text-anchor="middle" fill="#ccc" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">row0Y=${expanded.row0Y.toFixed(0)} vPad=${expanded.GRID_V_PAD.toFixed(0)}</text>
  <line x1="${panelW}" y1="0" x2="${panelW}" y2="56" stroke="#fff" stroke-width="2"/>
</svg>`);

  await sharp({
    create: {
      width: panelW * 2,
      height: h + 56,
      channels: 4,
      background: { r: 20, g: 24, b: 30, alpha: 255 },
    },
  })
    .composite([
      { input: leftBuf, top: 56, left: 0 },
      { input: rightBuf, top: 56, left: panelW },
      { input: legend, top: 0, left: 0 },
    ])
    .png()
    .toFile(path.join(OUT_DIR, 'grid-layout-current-vs-expanded.png'));
}

async function renderOnRef(layouts) {
  const { data, info } = await sharp(REF_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const si = i * ch;
    const di = i * 4;
    rgba[di] = data[si];
    rgba[di + 1] = data[si + 1];
    rgba[di + 2] = data[si + 2];
    rgba[di + 3] = 255;
  }

  const setPixel = (gx, gy, r, g, b, a = 220) => {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
    const i = (gy * w + gx) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  const ref = refBboxInRefImage();
  for (let x = ref.left; x <= ref.left + ref.width; x++) {
    setPixel(x, ref.top, 255, 220, 0);
    setPixel(x, ref.top + ref.height, 255, 220, 0);
  }
  for (let y = ref.top; y <= ref.top + ref.height; y++) {
    setPixel(ref.left, y, 255, 220, 0);
    setPixel(ref.left + ref.width, y, 255, 220, 0);
  }

  const colors = {
    current: [255, 80, 80],
    youtube_bbox: [60, 180, 255],
    full_width: [180, 100, 255],
  };

  for (const layout of layouts) {
    const rc = layoutToRefCoords(layout);
    const color = colors[layout.name] ?? [255, 255, 255];
    for (let t = 0; t < 2; t++) {
      for (let x = rc.left; x <= rc.left + rc.width; x++) {
        setPixel(Math.round(x), Math.round(rc.top + t), ...color);
        setPixel(Math.round(x), Math.round(rc.top + rc.height - t), ...color);
      }
      for (let y = rc.top; y <= rc.top + rc.height; y++) {
        setPixel(Math.round(rc.left + t), Math.round(y), ...color);
        setPixel(Math.round(rc.left + rc.width - t), Math.round(y), ...color);
      }
    }
  }

  const base = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const legend = Buffer.from(`<svg width="${w}" height="120" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="120" fill="rgba(8,12,18,0.82)"/>
  <text x="12" y="24" fill="#fbbf24" font-size="14" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">170721 叠图：黄框=原片格子bbox  红=current  蓝=A youtube_bbox  紫=B full_width</text>
  <text x="12" y="48" fill="#fff" font-size="12" font-family="Segoe UI, Microsoft YaHei, sans-serif">选最接近黄框的方案；确认后再改 BattleConfig.js</text>
  <text x="12" y="72" fill="#a3e635" font-size="12" font-family="Segoe UI, Microsoft YaHei, sans-serif">A: ${layouts[1].CELL_W.toFixed(1)}px cell  row0 refY=${(layouts[1].row0Y * REF_H / GAME_H + FIELD_TOP * REF_H / GAME_H - FIELD_TOP * REF_H / GAME_H).toFixed(0)}</text>
  <text x="12" y="94" fill="#c4b5fd" font-size="12" font-family="Segoe UI, Microsoft YaHei, sans-serif">B: ${layouts[2].CELL_W.toFixed(1)}px cell  vPad=${layouts[2].GRID_V_PAD.toFixed(1)}  row0 fieldY=${layouts[2].row0Y.toFixed(1)}</text>
</svg>`);

  await sharp(base)
    .composite([{ input: legend, top: h - 120, left: 0 }])
    .png()
    .toFile(path.join(OUT_DIR, 'grid-layout-on-ref.png'));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const current = layoutCurrent();
  const youtubeBbox = layoutYoutubeBbox();
  const fullWidth = layoutFullWidth();
  const expanded = layoutBlueBox();
  const layouts = [current, youtubeBbox, fullWidth];

  console.log('=== 布局常量对比 (field 坐标) ===\n');
  for (const L of layouts) {
    console.log(`--- ${L.name} ---`);
    console.log(JSON.stringify({
      GRID_ORIGIN_X: +L.originX.toFixed(2),
      GRID_ORIGIN_Y: +L.originY.toFixed(2),
      GRID_BOX_H: +L.innerH.toFixed(2),
      GRID_BOX_BOTTOM: +L.boxBottom.toFixed(2),
      CELL_W: +L.CELL_W.toFixed(2),
      GRID_V_PAD: +L.GRID_V_PAD.toFixed(2),
      row0Y: +L.row0Y.toFixed(2),
      row4Bottom: +L.row4Bottom.toFixed(2),
    }, null, 2));
    console.log('');
  }

  const summary = {
    corridor: CORRIDOR,
    ref170721: REF_GRID,
    layouts: layouts.map((L) => ({
      name: L.name,
      GRID_ORIGIN_X: +L.originX.toFixed(2),
      GRID_ORIGIN_Y: +L.originY.toFixed(2),
      innerW: +L.innerW.toFixed(2),
      innerH: +L.innerH.toFixed(2),
      CELL_W: +L.CELL_W.toFixed(2),
      GRID_V_PAD: +L.GRID_V_PAD.toFixed(2),
      row0Y: +L.row0Y.toFixed(2),
    })),
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'grid-layout-compare.json'),
    JSON.stringify(summary, null, 2),
  );

  await renderOnBackground(current, 'grid-layout-current.png', '当前 (走廊全高+居中) — 172609 问题');
  await renderOnBackground(youtubeBbox, 'grid-layout-youtube-bbox.png', '方案 A youtube_bbox — 170721 宽高比');
  await renderOnBackground(fullWidth, 'grid-layout-full-width.png', '方案 B full_width — 宽顶满+竖向YouTube');
  await renderCurrentExpandedOverlay(current, expanded);
  await renderSideBySide(current, expanded);
  await renderOnRef(layouts);

  console.log('\n--- current → 按蓝框扩展 ---');
  console.log(JSON.stringify({
    before: {
      GRID_ORIGIN_Y: +current.originY.toFixed(2),
      GRID_BOX_H: +current.innerH.toFixed(2),
      GRID_V_PAD: +current.GRID_V_PAD.toFixed(2),
      row0Y: +current.row0Y.toFixed(2),
    },
    after: {
      GRID_ORIGIN_Y: +expanded.originY.toFixed(2),
      GRID_BOX_H: +expanded.innerH.toFixed(2),
      GRID_V_PAD: +expanded.GRID_V_PAD.toFixed(2),
      row0Y: +expanded.row0Y.toFixed(2),
    },
  }, null, 2));

  console.log('\n输出图片:');
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-current.png')}  (改前原图，已重生成)`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-current-expanded.png')}  (蓝框+红改前+黄改后+改法说明)`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-current-vs-expanded.png')}  (左右对比)`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-youtube-bbox.png')}`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-full-width.png')}`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-on-ref.png')}`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-compare.json')}`);
  console.log('\n请打开 current-expanded / vs-expanded 确认后，再改 BattleConfig。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});