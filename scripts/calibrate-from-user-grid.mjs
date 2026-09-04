/**
 * 从 resources/ck/我想要的.png 提取黄格线与蓝外框，生成两套 12×5 正方形对比预览。
 * 用法: node scripts/calibrate-from-user-grid.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const USER_GRID_PATH = path.join(ROOT, 'resources/ck/我想要的.png');
const RES = path.join(ROOT, 'resources/background');
const OUT_DIR = path.join(ROOT, 'scripts/output');
const OUT_JSON = path.join(OUT_DIR, 'grid-calibration-user-desired.json');

const GAME_W = 1248;
const GAME_H = 832;
const COLUMN_OVERHANG = 25;
const FIELD_LEFT = 135;
const FIELD_TOP = 105;
const FIELD_W = GAME_W - FIELD_LEFT * 2;
const FIELD_H = GAME_H - FIELD_TOP - 25;

const LANES = 5;
const COLS = 12;
const GAP = 3;
const PLAYER_COLS = 5;
const BUFFER_COLS = 2;

const BEARD_BOTTOM_FIELD_Y = 87;
const BOTTOM_ROOT_TOP_FIELD_Y = 645;

/** 检测失败时的回退(来自像素分析) */
const FALLBACK = {
  yellow_grid: {
    originX: 0,
    originY: 163,
    innerW: 977,
    innerH: 406,
    source: 'fallback',
  },
  blue_frame: {
    originX: -62,
    originY: -63,
    innerW: 1099,
    innerH: 721,
    source: 'fallback',
  },
};

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isGrass(r, g, b) {
  const l = lum(r, g, b);
  return g > r * 0.95 && g > b * 0.85 && l > 70 && l < 210;
}

function px(data, w, ch, gx, gy) {
  const i = (gy * w + gx) * ch;
  return [data[i], data[i + 1], data[i + 2]];
}

/** 仅匹配用户图里画的亮黄格线，排除树/UI 杂色 */
function isYellowGridPixel(r, g, b) {
  return r > 220 && g > 200 && b < 80 && r - b > 140;
}

function isBlueFramePixel(r, g, b) {
  return b > 140 && b > r + 35 && b > g + 15 && g > 70 && r < 180;
}

function bboxFromPoints(pts) {
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function gameToField(gx, gy) {
  return [gx - FIELD_LEFT, gy - FIELD_TOP];
}

function fieldBoxFromGameBbox(bb) {
  const [fx0, fy0] = gameToField(bb.left, bb.top);
  const [fx1, fy1] = gameToField(bb.right, bb.bottom);
  return {
    originX: fx0,
    originY: fy0,
    innerW: fx1 - fx0,
    innerH: fy1 - fy0,
    boxBottom: fy1,
    gameBbox: bb,
  };
}

/** 从用户标注图扫描黄格线 / 蓝外框 */
async function detectFromUserImage() {
  const { data, info } = await sharp(USER_GRID_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const yellowPts = [];
  const bluePts = [];

  const fieldX0 = FIELD_LEFT;
  const fieldX1 = FIELD_LEFT + FIELD_W;
  const fieldY0 = FIELD_TOP + BEARD_BOTTOM_FIELD_Y;
  const fieldY1 = FIELD_TOP + BOTTOM_ROOT_TOP_FIELD_Y;

  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const [r, g, b] = px(data, w, ch, gx, gy);
      if (isBlueFramePixel(r, g, b)) bluePts.push([gx, gy]);
      if (gx >= fieldX0 && gx < fieldX1 && gy >= fieldY0 && gy <= fieldY1) {
        if (isYellowGridPixel(r, g, b)) yellowPts.push([gx, gy]);
      }
    }
  }

  const yellowGame = bboxFromPoints(yellowPts);
  const blueGame = bboxFromPoints(bluePts);

  const yellow =
    yellowPts.length > 800 && yellowGame
      ? { ...fieldBoxFromGameBbox(yellowGame), source: 'detected', pointCount: yellowPts.length }
      : { ...FALLBACK.yellow_grid, boxBottom: FALLBACK.yellow_grid.originY + FALLBACK.yellow_grid.innerH };

  const blue =
    bluePts.length > 800 && blueGame
      ? { ...fieldBoxFromGameBbox(blueGame), source: 'detected', pointCount: bluePts.length }
      : { ...FALLBACK.blue_frame, boxBottom: FALLBACK.blue_frame.originY + FALLBACK.blue_frame.innerH };

  return { yellow, blue, imageSize: { w, h } };
}

function detectPlayableEdges(data, w, ch) {
  const sampleYs = [150, 250, 350, 450, 550];
  const leftSamples = [];
  const rightSamples = [];

  for (const fy of sampleYs) {
    let leftEdge = 0;
    for (let fx = 0; fx < FIELD_W; fx++) {
      const [r, g, b] = px(data, w, ch, FIELD_LEFT + fx, FIELD_TOP + fy);
      if (isGrass(r, g, b)) {
        leftEdge = fx;
        break;
      }
    }
    leftSamples.push(leftEdge);

    let rightEdge = 0;
    for (let fx = FIELD_W - 1; fx >= 0; fx--) {
      const [r, g, b] = px(data, w, ch, FIELD_LEFT + fx, FIELD_TOP + fy);
      if (isGrass(r, g, b)) {
        rightEdge = fx;
        break;
      }
    }
    rightSamples.push(rightEdge);
  }

  const gridLeftFieldX = Math.max(0, Math.min(...leftSamples));
  const gridRightFieldX = Math.min(FIELD_W - 1, Math.min(...rightSamples));
  const playableW = Math.max(COLS * 20, gridRightFieldX - gridLeftFieldX);

  return {
    gridLeftFieldX,
    gridRightFieldX,
    playableW,
    leftSamples,
    rightSamples,
    source: 'detected',
  };
}

/** 在标定框内均分 12×5 正方形 */
function buildSquareLayout(scheme, box) {
  const { originX, originY, innerW, innerH } = box;
  const cellSize = Math.min(
    (innerW - GAP * (COLS - 1)) / COLS,
    (innerH - GAP * (LANES - 1)) / LANES,
  );
  const bodyW = COLS * cellSize + (COLS - 1) * GAP;
  const bodyH = LANES * cellSize + (LANES - 1) * GAP;
  const hPad = (innerW - bodyW) / 2;
  const vPad = (innerH - bodyH) / 2;
  const gridOriginX = originX + hPad;
  const row0Y = originY + vPad;

  return {
    scheme,
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
    GRID_ORIGIN_X: gridOriginX,
    GRID_ORIGIN_Y: originY,
    row0Y,
    row4Bottom: row0Y + bodyH,
    boxBottom: originY + innerH,
    GRID_RIGHT_MARGIN: Math.max(0, FIELD_W - gridOriginX - bodyW),
    columns: '5+2+5',
    rows: LANES,
  };
}

function captionSvg(lines) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const h = 28 + (lines.length - 1) * 14;
  const text = lines
    .map((l, i) => {
      const y = 18 + i * 14;
      return `<text x="12" y="${y}" fill="#fde047" font-size="12" font-weight="${i === 0 ? 600 : 400}" font-family="Segoe UI, Microsoft YaHei, sans-serif">${esc(l)}</text>`;
    })
    .join('');
  return Buffer.from(`<svg width="${GAME_W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${GAME_W}" height="${h}" fill="rgba(8,12,18,0.88)"/>
  ${text}
</svg>`);
}

async function compositeScene() {
  const canvasH = GAME_H + COLUMN_OVERHANG;

  const grass = await sharp(path.join(RES, 'grassbg.jpg'))
    .resize(GAME_W, GAME_H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const leftCol = await sharp(path.join(RES, 'leftcolumn1.png'))
    .resize(GAME_W, canvasH, { fit: 'fill' })
    .png()
    .toBuffer();

  const rightCol = await sharp(path.join(RES, 'rightcolumn1.png'))
    .resize({ height: GAME_H })
    .png()
    .toBuffer();
  const rightMeta = await sharp(rightCol).metadata();

  const tall = await sharp({
    create: {
      width: GAME_W,
      height: canvasH,
      channels: 4,
      background: { r: 10, g: 15, b: 12, alpha: 255 },
    },
  })
    .composite([
      { input: grass, left: 0, top: COLUMN_OVERHANG },
      { input: leftCol, left: 0, top: 0 },
      { input: rightCol, left: GAME_W - rightMeta.width, top: COLUMN_OVERHANG },
    ])
    .png()
    .toBuffer();

  return sharp(tall)
    .extract({ left: 0, top: COLUMN_OVERHANG, width: GAME_W, height: GAME_H })
    .png()
    .toBuffer();
}

function createOverlay(w, h, srcData, srcCh, layout, edges, calibBox) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const si = i * srcCh;
    const di = i * 4;
    rgba[di] = srcData[si];
    rgba[di + 1] = srcData[si + 1];
    rgba[di + 2] = srcData[si + 2];
    rgba[di + 3] = 255;
  }

  const setPx = (gx, gy, r, g, b, a = 255) => {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
    const i = (gy * w + gx) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  const fieldToGame = (fx, fy) => [FIELD_LEFT + fx, FIELD_TOP + fy];

  const drawHLineField = (fy, color, x0, x1, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let fx = x0; fx <= x1; fx++) {
        const [gx, gy] = fieldToGame(fx, fy + t);
        setPx(gx, gy, ...color);
      }
    }
  };

  const drawVLineField = (fx, color, y0, y1, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let fy = y0; fy <= y1; fy++) {
        const [gx, gy] = fieldToGame(fx + t, fy);
        setPx(gx, gy, ...color);
      }
    }
  };

  const fillRectField = (fx, fy, fw, fh, color, alpha = 70) => {
    for (let y = fy; y < fy + fh; y++) {
      for (let x = fx; x < fx + fw; x++) {
        const [gx, gy] = fieldToGame(x, y);
        setPx(gx, gy, ...color, alpha);
      }
    }
  };

  const drawRectField = (fx, fy, fw, fh, color, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let x = fx; x <= fx + fw; x++) {
        const [gx0, gy0] = fieldToGame(x, fy + t);
        const [gx1, gy1] = fieldToGame(x, fy + fh - t);
        setPx(gx0, gy0, ...color);
        setPx(gx1, gy1, ...color);
      }
      for (let y = fy; y <= fy + fh; y++) {
        const [gx0, gy0] = fieldToGame(fx + t, y);
        const [gx1, gy1] = fieldToGame(fx + fw - t, y);
        setPx(gx0, gy0, ...color);
        setPx(gx1, gy1, ...color);
      }
    }
  };

  const { originX: gx0, row0Y, CELL_W, CELL_H } = layout;
  const lineThick = 2;

  const platformLeft = edges.gridLeftFieldX;
  const platformRight = edges.gridRightFieldX;
  const corridorW = platformRight - platformLeft;

  drawHLineField(BEARD_BOTTOM_FIELD_Y, [0, 255, 120], 0, FIELD_W - 1, 2);
  drawHLineField(BOTTOM_ROOT_TOP_FIELD_Y, [255, 120, 0], 0, FIELD_W - 1, 2);
  drawRectField(platformLeft, BEARD_BOTTOM_FIELD_Y, corridorW, BOTTOM_ROOT_TOP_FIELD_Y - BEARD_BOTTOM_FIELD_Y, [34, 211, 238], 2);
  drawVLineField(platformLeft, [255, 80, 255], BEARD_BOTTOM_FIELD_Y, BOTTOM_ROOT_TOP_FIELD_Y, 2);
  drawVLineField(platformRight, [255, 80, 255], BEARD_BOTTOM_FIELD_Y, BOTTOM_ROOT_TOP_FIELD_Y, 2);

  const { originX: bx, originY: by, innerW: bw, innerH: bh } = calibBox;
  drawRectField(bx, by, bw, bh, [34, 211, 238], 3);

  const zoneColors = [
    { cols: PLAYER_COLS, fill: [34, 120, 55] },
    { cols: BUFFER_COLS, fill: [120, 90, 30] },
    { cols: COLS - PLAYER_COLS - BUFFER_COLS, fill: [160, 70, 25] },
  ];
  let colOff = 0;
  for (const z of zoneColors) {
    const zw = z.cols * CELL_W + (z.cols - 1) * GAP;
    fillRectField(gx0 + colOff * (CELL_W + GAP), row0Y, zw, layout.GRID_BODY_H, z.fill);
    colOff += z.cols;
  }

  for (let lane = 0; lane < LANES; lane++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = Math.round(gx0 + col * (CELL_W + GAP));
      const y0 = Math.round(row0Y + lane * (CELL_H + GAP));
      const x1 = Math.round(x0 + CELL_W);
      const y1 = Math.round(y0 + CELL_H);
      for (let t = 0; t < lineThick; t++) {
        for (let x = x0; x <= x1; x++) {
          const [gx, gy] = fieldToGame(x, y0 + t);
          setPx(gx, gy, 255, 220, 40);
          const [gx2, gy2] = fieldToGame(x, y1 - t);
          setPx(gx2, gy2, 255, 220, 40);
        }
        for (let y = y0; y <= y1; y++) {
          const [gx, gy] = fieldToGame(x0 + t, y);
          setPx(gx, gy, 255, 220, 40);
          const [gx2, gy2] = fieldToGame(x1 - t, y);
          setPx(gx2, gy2, 255, 220, 40);
        }
      }
    }
  }

  const xAfterPlayer = gx0 + PLAYER_COLS * (CELL_W + GAP) - GAP;
  const xAfterBuffer = xAfterPlayer + BUFFER_COLS * (CELL_W + GAP);
  drawVLineField(xAfterPlayer, [120, 220, 255], row0Y, row0Y + layout.GRID_BODY_H, 1);
  drawVLineField(xAfterBuffer, [120, 220, 255], row0Y, row0Y + layout.GRID_BODY_H, 1);

  return rgba;
}

function toBattleConfig(layout, edges) {
  return {
    scheme: layout.scheme,
    GRID_ORIGIN_X: +layout.GRID_ORIGIN_X.toFixed(2),
    GRID_ORIGIN_Y: +layout.GRID_ORIGIN_Y.toFixed(2),
    GRID_GAP: layout.GRID_GAP,
    CELL_W: +layout.CELL_W.toFixed(2),
    CELL_H: +layout.CELL_H.toFixed(2),
    GRID_BODY_W: +layout.GRID_BODY_W.toFixed(2),
    GRID_BODY_H: +layout.GRID_BODY_H.toFixed(2),
    GRID_V_PAD: +layout.GRID_V_PAD.toFixed(2),
    GRID_H_PAD: +layout.GRID_H_PAD.toFixed(2),
    GRID_RIGHT_MARGIN: layout.GRID_RIGHT_MARGIN,
    calibBox: {
      originX: layout.box.originX,
      originY: layout.box.originY,
      innerW: layout.box.innerW,
      innerH: layout.box.innerH,
      source: layout.box.source,
    },
    row0Y: +layout.row0Y.toFixed(2),
    row4Bottom: +layout.row4Bottom.toFixed(2),
    PLAYER_TREE_BEARD_BOTTOM_FIELD_Y: BEARD_BOTTOM_FIELD_Y,
    BOTTOM_ROOT_TOP_FIELD_Y,
    leftColumnTop: -COLUMN_OVERHANG,
    columns: layout.columns,
    rows: layout.rows,
    playableEdges: edges,
  };
}

async function renderPreview(base, data, info, layout, edges, calibBox, captionLines, outPath) {
  const overlay = createOverlay(info.width, info.height, data, info.channels, layout, edges, calibBox);
  const overlayBuf = await sharp(overlay, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const cap = captionSvg(captionLines);
  await sharp(base)
    .composite([
      { input: overlayBuf, top: 0, left: 0 },
      { input: cap, top: 0, left: 0 },
    ])
    .png()
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const detected = await detectFromUserImage();
  const base = await compositeScene();
  const { data, info } = await sharp(base).raw().toBuffer({ resolveWithObject: true });
  const edges = detectPlayableEdges(data, info.width, info.channels);

  const variants = [
    {
      scheme: 'yellow_grid',
      label: '按黄格',
      filename: '格子预览-按黄格-我想要的.png',
      box: detected.yellow,
      caption: (layout) => [
        `按黄格线标定：cell=${layout.CELL_W.toFixed(1)}px  框 field X=${detected.yellow.originX}~${(detected.yellow.originX + detected.yellow.innerW).toFixed(0)} Y=${detected.yellow.originY}~${detected.yellow.boxBottom}`,
        `绿线=胡须87  橙线=树根645  青框=标定外框  紫线=台子内缘  黄线=战斗格  浅蓝=5+2+5`,
      ],
    },
    {
      scheme: 'blue_frame',
      label: '按蓝框',
      filename: '格子预览-按蓝框-我想要的.png',
      box: detected.blue,
      caption: (layout) => [
        `按蓝外框标定：cell=${layout.CELL_W.toFixed(1)}px  框 field X=${detected.blue.originX}~${(detected.blue.originX + detected.blue.innerW).toFixed(0)} Y=${detected.blue.originY}~${detected.blue.boxBottom}(可伸入树柱区)`,
        `绿线=胡须87  橙线=树根645  青框=标定外框  紫线=台子内缘  黄线=战斗格  浅蓝=5+2+5`,
      ],
    },
  ];

  const outputs = [];
  for (const v of variants) {
    const layout = buildSquareLayout(v.scheme, v.box);
    const outPath = path.join(OUT_DIR, v.filename);
    await renderPreview(base, data, info, layout, edges, v.box, v.caption(layout), outPath);
    outputs.push({
      scheme: v.scheme,
      label: v.label,
      outputPng: outPath,
      detectedBox: v.box,
      proposedBattleConfig: toBattleConfig(layout, edges),
    });
  }

  const calibration = {
    generatedAt: new Date().toISOString(),
    sourceImage: USER_GRID_PATH,
    imageSize: detected.imageSize,
    canvas: { GAME_W, GAME_H, FIELD_LEFT, FIELD_TOP, FIELD_W, FIELD_H },
    columnAlign: {
      leftColumnHeight: GAME_H + COLUMN_OVERHANG,
      leftColumnTop: -COLUMN_OVERHANG,
      rightColumnHeight: GAME_H,
      note: '左柱上移25px，树根底与右柱看齐',
    },
    detectedBoxes: {
      yellow_grid: detected.yellow,
      blue_frame: detected.blue,
    },
    playableEdges: edges,
    corridor: {
      BEARD_BOTTOM_FIELD_Y,
      BOTTOM_ROOT_TOP_FIELD_Y,
      innerH: BOTTOM_ROOT_TOP_FIELD_Y - BEARD_BOTTOM_FIELD_Y,
    },
    lineLegend: {
      green: '绿线 field Y=87 — 胡须底，走廊顶',
      orange: '橙线 field Y=645 — 树根顶，走廊底',
      cyan: '青框 — 从用户图提取的标定外框(黄格线或蓝外框)',
      magenta: '紫线 — 左右台子内缘',
      yellow: '黄线 — 12×5 战斗单元格',
      lightBlue: '浅蓝竖线 — 5+2+5 列分界',
    },
    variants: outputs,
    nextStep: '请对比两张预览，选定后写入 BattleConfig.js 并同步 style.css left-frame top:-25px',
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(calibration, null, 2));

  console.log(JSON.stringify(calibration, null, 2));
  console.log('\n输出:');
  for (const o of outputs) {
    console.log(`  ${o.outputPng}`);
  }
  console.log(`  ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});