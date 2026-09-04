/**
 * 从 更改意见.png 提取用户蓝框，按 12×5 正方形均分并出对比图。
 * 用法: node scripts/render-user-grid-feedback.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const BG_PATH = path.join(ROOT, 'assets/battle/jungle/background.jpg');
const USER_PATH = path.join(ROOT, 'scripts/output/更改意见.png');
const CURRENT_PATH = path.join(ROOT, 'scripts/output/grid-layout-current.png');
const OUT_DIR = path.join(ROOT, 'scripts/output');

const GAME_W = 1248;
const FIELD_LEFT = 135;
const FIELD_TOP = 105;
const FIELD_W = GAME_W - FIELD_LEFT * 2;
const LANES = 5;
const COLS = 12;
const GAP = 3;
const PLAYER_COLS = 5;
const BUFFER_COLS = 2;

/** 检测失败时的回退值(由 diff 更改意见 vs current 得出) */
const FALLBACK_USER_BOX = {
  originX: 0,
  originY: 81,
  innerW: FIELD_W,
  innerH: 645 - 81,
};

async function detectUserBlueBox() {
  try {
    const [user, base] = await Promise.all([
      sharp(USER_PATH).raw().toBuffer({ resolveWithObject: true }),
      sharp(CURRENT_PATH).raw().toBuffer({ resolveWithObject: true }),
    ]);
    const { data: du, info } = user;
    const { data: db } = base;
    const { width: w, channels: ch } = info;

    const pts = [];
    for (let fy = 0; fy < 660; fy++) {
      for (let fx = 0; fx < FIELD_W; fx++) {
        const gx = FIELD_LEFT + fx;
        const gy = FIELD_TOP + fy;
        const i = (gy * w + gx) * ch;
        const diff =
          Math.abs(du[i] - db[i]) +
          Math.abs(du[i + 1] - db[i + 1]) +
          Math.abs(du[i + 2] - db[i + 2]);
        if (diff > 80 && du[i + 2] > du[i] + 30 && du[i + 1] > 100) {
          pts.push([fx, fy]);
        }
      }
    }
    if (pts.length < 500) return { ...FALLBACK_USER_BOX, source: 'fallback' };

    const yhist = {};
    for (const [, y] of pts) yhist[y] = (yhist[y] || 0) + 1;
    const heavyY = Object.entries(yhist)
      .filter(([, c]) => c > 150)
      .map(([y]) => Number(y))
      .sort((a, b) => a - b);

    const topCluster = heavyY.filter((y) => y < 120);
    const botCluster = heavyY.filter((y) => y > 600);
    const originY = topCluster.length ? Math.min(...topCluster) : FALLBACK_USER_BOX.originY;
    const boxBottom = botCluster.length ? Math.max(...botCluster) : originY + FALLBACK_USER_BOX.innerH;

    const xs = pts.map((p) => p[0]);
    const originX = Math.max(0, Math.min(...xs));
    const innerW = Math.min(FIELD_W, Math.max(...xs) - originX);
    const innerH = boxBottom - originY;

    return {
      originX,
      originY,
      innerW,
      innerH,
      boxBottom,
      source: 'detected',
    };
  } catch {
    return { ...FALLBACK_USER_BOX, source: 'fallback' };
  }
}

/** 蓝框内：12 列均分 + 5 行均分，格为正方形(取宽/高较小者) */
function buildUserGrid(box, align = 'center') {
  const { originX, originY, innerW, innerH } = box;
  const cellSize = Math.min(
    (innerW - GAP * (COLS - 1)) / COLS,
    (innerH - GAP * (LANES - 1)) / LANES,
  );
  const bodyW = COLS * cellSize + (COLS - 1) * GAP;
  const bodyH = LANES * cellSize + (LANES - 1) * GAP;
  const hPad = (innerW - bodyW) / 2;
  const vPad =
    align === 'top' ? 0 : align === 'bottom' ? innerH - bodyH : (innerH - bodyH) / 2;
  const gridOriginX = originX + hPad;
  const row0Y = originY + vPad;

  return {
    name: align === 'top' ? 'user_feedback_top' : 'user_feedback',
    align,
    box,
    originX: gridOriginX,
    originY,
    innerW,
    innerH,
    GRID_GAP: GAP,
    CELL_W: cellSize,
    CELL_H: cellSize,
    GRID_BODY_W: bodyW,
    GRID_BODY_H: bodyH,
    GRID_H_PAD: hPad,
    GRID_V_PAD: vPad,
    row0Y,
    row4Bottom: row0Y + 4 * (cellSize + GAP) + cellSize,
    boxBottom: originY + innerH,
  };
}

function createFieldDrawer(w, h, srcData, srcCh) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const si = i * srcCh;
    const di = i * 4;
    rgba[di] = srcData[si];
    rgba[di + 1] = srcData[si + 1];
    rgba[di + 2] = srcData[si + 2];
    rgba[di + 3] = 255;
  }

  const setPixel = (gx, gy, r, g, b, a = 240) => {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
    const i = (gy * w + gx) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  const drawHLineField = (fy, color, x0, x1, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let fx = x0; fx <= x1; fx++) {
        setPixel(FIELD_LEFT + fx, FIELD_TOP + fy + t, ...color);
      }
    }
  };

  const drawVLineField = (fx, color, y0, y1, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let fy = y0; fy <= y1; fy++) {
        setPixel(FIELD_LEFT + fx + t, FIELD_TOP + fy, ...color);
      }
    }
  };

  const drawRectField = (fx, fy, fw, fh, color, thick = 3) => {
    for (let t = 0; t < thick; t++) {
      for (let x = fx; x <= fx + fw; x++) {
        setPixel(FIELD_LEFT + x, FIELD_TOP + fy + t, ...color);
        setPixel(FIELD_LEFT + x, FIELD_TOP + fy + fh - t, ...color);
      }
      for (let y = fy; y <= fy + fh; y++) {
        setPixel(FIELD_LEFT + fx + t, FIELD_TOP + y, ...color);
        setPixel(FIELD_LEFT + fx + fw - t, FIELD_TOP + y, ...color);
      }
    }
  };

  const drawCells = (layout, color = [255, 220, 0]) => {
    const { originX, row0Y, CELL_W, CELL_H } = layout;
    for (let lane = 0; lane < LANES; lane++) {
      for (let col = 0; col < COLS; col++) {
        const x0 = Math.round(originX + col * (CELL_W + GAP));
        const y0 = Math.round(row0Y + lane * (CELL_H + GAP));
        const x1 = Math.round(x0 + CELL_W);
        const y1 = Math.round(y0 + CELL_H);
        for (let x = FIELD_LEFT + x0; x <= FIELD_LEFT + x1; x++) {
          setPixel(x, FIELD_TOP + y0, ...color);
          setPixel(x, FIELD_TOP + y1, ...color);
        }
        for (let y = FIELD_TOP + y0; y <= FIELD_TOP + y1; y++) {
          setPixel(FIELD_LEFT + x0, y, ...color);
          setPixel(FIELD_LEFT + x1, y, ...color);
        }
      }
    }
  };

  const drawZoneDividers = (layout) => {
    const { originX, row0Y, CELL_W, CELL_H } = layout;
    const y0 = row0Y;
    const y1 = row0Y + LANES * (CELL_H + GAP) - GAP + CELL_H;
    const xAfterPlayer = originX + PLAYER_COLS * (CELL_W + GAP) - GAP;
    const xAfterBuffer = xAfterPlayer + BUFFER_COLS * (CELL_W + GAP);
    drawVLineField(xAfterPlayer, [120, 220, 255], y0, y1, 2);
    drawVLineField(xAfterBuffer, [120, 220, 255], y0, y1, 2);
  };

  return { rgba, setPixel, drawHLineField, drawVLineField, drawRectField, drawCells, drawZoneDividers };
}

function legendSvg(w, h, box, layout, current) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [
    '【你的更改意见】蓝框面积 → 均分 12列(5+2+5) × 5行，每格正方形',
    `蓝框 field: X=${box.originX} Y=${box.originY.toFixed(0)} W=${box.innerW.toFixed(0)} H=${box.innerH.toFixed(0)}(从更改意见.png 提取)`,
    `正方形 cell=${layout.CELL_W.toFixed(1)}px  vPad=${layout.GRID_V_PAD.toFixed(1)}  hPad=${layout.GRID_H_PAD.toFixed(1)}  首行Y=${layout.row0Y.toFixed(1)}`,
    `对比 current: cell=${current.CELL_W.toFixed(1)}  row0Y=${current.row0Y.toFixed(0)}  vPad=${current.GRID_V_PAD.toFixed(0)}`,
    '青框=你的蓝框  黄格=均分结果  浅蓝竖线=5|2|5 列分界  绿87/橙645=走廊参考',
  ];
  const rowH = 20;
  const boxH = 40 + lines.length * rowH;
  const text = lines
    .map((l, i) => {
      const y = 56 + i * rowH;
      const fill = i === 0 ? '#22d3ee' : '#fff';
      const weight = i === 0 ? '700' : '400';
      return `<text x="14" y="${y}" fill="${fill}" font-size="13" font-weight="${weight}" font-family="Segoe UI, Microsoft YaHei, sans-serif">${esc(l)}</text>`;
    })
    .join('');
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="${Math.min(w - 16, 1220)}" height="${boxH}" rx="8" fill="rgba(8,12,18,0.92)" stroke="#22d3ee" stroke-width="2"/>
  <text x="14" y="34" fill="#22d3ee" font-size="16" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">更改意见.png → 蓝框均分 12×5 正方形</text>
  ${text}
</svg>`);
}

function buildCurrentForCompare() {
  const innerW = FIELD_W - 1 - 64;
  const innerH = 645 - 87;
  const cell = Math.min((innerW - 33) / 12, (innerH - 12) / 5);
  const bodyH = 5 * cell + 12;
  const vPad = (innerH - bodyH) / 2;
  return {
    CELL_W: cell,
    CELL_H: cell,
    originX: 1,
    row0Y: 87 + vPad,
    GRID_V_PAD: vPad,
  };
}

async function renderUserFeedback(layout, box, current, outName) {
  const { data, info } = await sharp(BG_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const { rgba, drawHLineField, drawRectField, drawCells, drawZoneDividers } =
    createFieldDrawer(w, h, data, ch);

  drawHLineField(87, [0, 255, 120], 0, FIELD_W - 1, 2);
  drawHLineField(645, [255, 120, 0], 0, FIELD_W - 1, 2);

  drawRectField(box.originX, box.originY, box.innerW, box.innerH, [34, 211, 238], 4);
  drawCells(layout);
  drawZoneDividers(layout);

  const base = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const label = legendSvg(w, h, box, layout, current);
  await sharp(base)
    .composite([{ input: label, top: 0, left: 0 }])
    .png()
    .toFile(path.join(OUT_DIR, outName));
}

async function renderSideBySide(layout, box, current) {
  const { data, info } = await sharp(BG_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const makePanel = (draw) => {
    const { rgba, drawHLineField, drawRectField, drawCells, drawZoneDividers } =
      createFieldDrawer(w, h, data, ch);
    draw({ drawHLineField, drawRectField, drawCells, drawZoneDividers });
    return rgba;
  };

  const left = makePanel(({ drawHLineField, drawRectField, drawCells }) => {
    drawHLineField(87, [0, 255, 120], 0, FIELD_W - 1, 2);
    drawHLineField(645, [255, 120, 0], 0, FIELD_W - 1, 2);
    drawRectField(1, 87, FIELD_W - 1 - 64, 558, [60, 140, 255], 2);
    drawCells({
      originX: current.originX,
      row0Y: current.row0Y,
      CELL_W: current.CELL_W,
      CELL_H: current.CELL_H,
    });
  });

  const right = makePanel(({ drawHLineField, drawRectField, drawCells, drawZoneDividers }) => {
    drawHLineField(87, [0, 255, 120], 0, FIELD_W - 1, 2);
    drawHLineField(645, [255, 120, 0], 0, FIELD_W - 1, 2);
    drawRectField(box.originX, box.originY, box.innerW, box.innerH, [34, 211, 238], 4);
    drawCells(layout);
    drawZoneDividers(layout);
  });

  const panelW = Math.floor(w / 2);
  const leftBuf = await sharp(left, { raw: { width: w, height: h, channels: 4 } })
    .resize(panelW, h)
    .png()
    .toBuffer();
  const rightBuf = await sharp(right, { raw: { width: w, height: h, channels: 4 } })
    .resize(panelW, h)
    .png()
    .toBuffer();

  const legend = Buffer.from(`<svg width="${panelW * 2}" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect width="${panelW * 2}" height="64" fill="rgba(8,12,18,0.94)"/>
  <text x="${panelW / 2}" y="22" text-anchor="middle" fill="#f87171" font-size="14" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">左：current(小格+大留白)</text>
  <text x="${panelW + panelW / 2}" y="22" text-anchor="middle" fill="#22d3ee" font-size="14" font-weight="700" font-family="Segoe UI, Microsoft YaHei, sans-serif">右：更改意见蓝框均分</text>
  <text x="${panelW / 2}" y="46" text-anchor="middle" fill="#ccc" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">cell ${current.CELL_W.toFixed(1)}px row0Y=${current.row0Y.toFixed(0)}</text>
  <text x="${panelW + panelW / 2}" y="46" text-anchor="middle" fill="#ccc" font-size="11" font-family="Segoe UI, Microsoft YaHei, sans-serif">cell ${layout.CELL_W.toFixed(1)}px row0Y=${layout.row0Y.toFixed(0)}  5+2+5列</text>
  <line x1="${panelW}" y1="0" x2="${panelW}" y2="64" stroke="#fff" stroke-width="2"/>
</svg>`);

  await sharp({
    create: {
      width: panelW * 2,
      height: h + 64,
      channels: 4,
      background: { r: 20, g: 24, b: 30, alpha: 255 },
    },
  })
    .composite([
      { input: leftBuf, top: 64, left: 0 },
      { input: rightBuf, top: 64, left: panelW },
      { input: legend, top: 0, left: 0 },
    ])
    .png()
    .toFile(path.join(OUT_DIR, 'grid-layout-user-vs-current.png'));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const box = await detectUserBlueBox();
  const layoutCenter = buildUserGrid(box, 'center');
  const layoutTop = buildUserGrid(box, 'top');
  const current = buildCurrentForCompare();

  const summary = {
    userBlueBox: box,
    userGridCenter: {
      CELL_W: +layoutCenter.CELL_W.toFixed(2),
      CELL_H: +layoutCenter.CELL_H.toFixed(2),
      GRID_ORIGIN_X: +layoutCenter.originX.toFixed(2),
      GRID_BOX_ORIGIN_Y: +layoutCenter.originY.toFixed(2),
      GRID_BOX_INNER_W: +layoutCenter.innerW.toFixed(2),
      GRID_BOX_INNER_H: +layoutCenter.innerH.toFixed(2),
      GRID_V_PAD: +layoutCenter.GRID_V_PAD.toFixed(2),
      GRID_H_PAD: +layoutCenter.GRID_H_PAD.toFixed(2),
      row0Y: +layoutCenter.row0Y.toFixed(2),
      row4Bottom: +layoutCenter.row4Bottom.toFixed(2),
      columns: '5+2+5',
      rows: 5,
    },
    userGridTopAligned: {
      CELL_W: +layoutTop.CELL_W.toFixed(2),
      row0Y: +layoutTop.row0Y.toFixed(2),
      row4Bottom: +layoutTop.row4Bottom.toFixed(2),
      GRID_V_PAD: 0,
      note: '首行贴蓝框顶(对应「这里的一行也是格子」)',
    },
    current,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'grid-layout-user-feedback.json'),
    JSON.stringify(summary, null, 2),
  );

  await renderUserFeedback(layoutCenter, box, current, 'grid-layout-user-feedback.png');
  await renderUserFeedback(layoutTop, box, current, 'grid-layout-user-feedback-top.png');
  await renderSideBySide(layoutTop, box, current);

  console.log(JSON.stringify(summary, null, 2));
  console.log('\n输出:');
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-user-feedback.png')}  (蓝框内居中均分)`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-user-feedback-top.png')}  (首行贴蓝框顶)`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-user-vs-current.png')}  (右=顶对齐版)`);
  console.log(`  ${path.join(OUT_DIR, 'grid-layout-user-feedback.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});