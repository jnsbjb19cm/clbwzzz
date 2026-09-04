/**
 * 扫描 background.jpg 战场地标，输出 BattleConfig 网格常量。
 * 用法: node scripts/calibrate-battle-grid.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const BG_PATH = path.join(ROOT, 'assets/battle/jungle/background.jpg');
const OUT_DIR = path.join(ROOT, 'scripts/output');
const OUT_PNG = path.join(OUT_DIR, 'grid-calibration.png');

const GAME_W = 1248;
const FIELD_LEFT = 135;
const FIELD_TOP = 105;
const FIELD_W = GAME_W - FIELD_LEFT * 2;
const FIELD_H = 832 - FIELD_TOP - 25;
const LANES = 5;
const COLS = 12;

const BEARD_BOTTOM_GAME_Y = 192;
const BEARD_BOTTOM_FIELD_Y = BEARD_BOTTOM_GAME_Y - FIELD_TOP;
const FALLBACK_BEARD_LEFT = 0;
const GRID_RIGHT_MARGIN = 64;
const FALLBACK_ROOT_TOP = 640;
const ROOT_TOP_MAX = 645;

function px(data, w, ch, gx, gy) {
  const i = (gy * w + gx) * ch;
  return [data[i], data[i + 1], data[i + 2]];
}

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isGrass(r, g, b) {
  const l = lum(r, g, b);
  return g > r * 0.95 && g > b * 0.85 && l > 70 && l < 210;
}

/** 胡须下方草地走廊左缘：在胡须行以下取最靠左的可走草地 */
function detectBeardLeftFieldX(data, w, ch) {
  const samples = [];
  for (const fy of [100, 140, 200, 300, 400, 500]) {
    let edge = 0;
    let run = 0;
    for (let fx = 0; fx < 80; fx++) {
      const [r, g, b] = px(data, w, ch, FIELD_LEFT + fx, FIELD_TOP + fy);
      if (isGrass(r, g, b)) {
        run++;
        if (run >= 3 && edge === 0) edge = fx - 2;
      } else {
        run = 0;
      }
    }
    samples.push(edge);
  }
  if (!samples.length) return FALLBACK_BEARD_LEFT;
  samples.sort((a, b) => a - b);
  return samples[0];
}

/** 草地走廊下缘：树根带上沿(满草行最低点，向上内缩) */
function detectCorridorBottomFieldY(data, w, ch) {
  let bottom = FALLBACK_ROOT_TOP;
  for (let fy = 600; fy <= FIELD_H - 1; fy++) {
    let grass = 0;
    let n = 0;
    for (let fx = 80; fx <= 900; fx += 4) {
      const [r, g, b] = px(data, w, ch, FIELD_LEFT + fx, FIELD_TOP + fy);
      n++;
      if (isGrass(r, g, b)) grass++;
    }
    if (grass / n >= 0.995) bottom = fy;
  }
  return Math.min(bottom, ROOT_TOP_MAX);
}

function buildGrid(beardLeft, rootTop) {
  const gap = 3;
  const innerW = FIELD_W - beardLeft - GRID_RIGHT_MARGIN;
  const innerH = rootTop - BEARD_BOTTOM_FIELD_Y;
  const cellSize = Math.min(
    (innerW - gap * (COLS - 1)) / COLS,
    (innerH - gap * (LANES - 1)) / LANES,
  );
  const bodyH = LANES * cellSize + (LANES - 1) * gap;
  const vPad = (innerH - bodyH) / 2;
  return {
    PLAYER_TREE_BEARD_LEFT_FIELD_X: beardLeft,
    BOTTOM_ROOT_TOP_FIELD_Y: rootTop,
    GRID_ORIGIN_X: beardLeft,
    GRID_ORIGIN_Y: BEARD_BOTTOM_FIELD_Y,
    GRID_RIGHT_MARGIN,
    GRID_GAP: gap,
    GRID_INNER_W: Math.round(innerW),
    GRID_INNER_H: Math.round(innerH),
    GRID_V_PAD: Number(vPad.toFixed(2)),
    CELL_W: Number(cellSize.toFixed(2)),
    CELL_H: Number(cellSize.toFixed(2)),
  };
}

async function drawDebugOverlay(data, w, h, ch, grid) {
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

  const drawHLine = (fy, color, x0, x1) => {
    const gy = FIELD_TOP + fy;
    for (let gx = FIELD_LEFT + x0; gx <= FIELD_LEFT + x1; gx++) {
      setPixel(gx, gy, ...color);
    }
  };

  const drawVLine = (fx, color, y0, y1) => {
    const gx = FIELD_LEFT + fx;
    for (let gy = FIELD_TOP + y0; gy <= FIELD_TOP + y1; gy++) {
      setPixel(gx, gy, ...color);
    }
  };

  const {
    GRID_ORIGIN_X,
    GRID_ORIGIN_Y,
    CELL_W,
    CELL_H,
    GRID_GAP: gap,
    GRID_RIGHT_MARGIN,
    GRID_V_PAD: vPad,
  } = grid;
  const rootTop = grid.BOTTOM_ROOT_TOP_FIELD_Y;
  const col11Right = FIELD_W - GRID_RIGHT_MARGIN;

  drawHLine(GRID_ORIGIN_Y, [0, 255, 120], 0, FIELD_W - 1);
  drawHLine(rootTop, [255, 120, 0], 0, FIELD_W - 1);
  drawVLine(GRID_ORIGIN_X, [255, 80, 80], GRID_ORIGIN_Y, rootTop);
  drawVLine(col11Right, [255, 80, 80], GRID_ORIGIN_Y, rootTop);

  for (let lane = 0; lane < LANES; lane++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = Math.round(FIELD_LEFT + GRID_ORIGIN_X + col * (CELL_W + gap));
      const y0 = Math.round(
        FIELD_TOP + GRID_ORIGIN_Y + vPad + lane * (CELL_H + gap),
      );
      const x1 = Math.round(x0 + CELL_W);
      const y1 = Math.round(y0 + CELL_H);
      for (let x = x0; x <= x1; x++) {
        setPixel(x, y0, 255, 220, 0);
        setPixel(x, y1, 255, 220, 0);
      }
      for (let y = y0; y <= y1; y++) {
        setPixel(x0, y, 255, 220, 0);
        setPixel(x1, y, 255, 220, 0);
      }
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(OUT_PNG);
}

async function main() {
  const { data, info } = await sharp(BG_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const beardLeft = detectBeardLeftFieldX(data, w, ch);
  const rootTop = detectCorridorBottomFieldY(data, w, ch);
  const grid = buildGrid(beardLeft, rootTop);

  console.log('Landmarks (field coords):', {
    beardLeft,
    rootTop,
    originY: grid.GRID_ORIGIN_Y,
    gridRight: FIELD_W - GRID_RIGHT_MARGIN,
    rightMargin: GRID_RIGHT_MARGIN,
  });

  console.log('\n=== BattleConfig constants ===');
  console.log(JSON.stringify(grid, null, 2));

  const row4Bottom =
    grid.GRID_ORIGIN_Y +
    grid.GRID_V_PAD +
    4 * (grid.CELL_H + grid.GRID_GAP) +
    grid.CELL_H;
  console.log('Row 4 bottom:', Math.round(row4Bottom), '(rootTop:', rootTop, ')');

  await drawDebugOverlay(data, w, h, ch, grid);
  console.log(`\nDebug overlay: ${OUT_PNG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});