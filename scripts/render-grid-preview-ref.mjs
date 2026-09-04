/**
 * 阶段 0：胡须(87)→树根(645) 格子预览
 * 用法: node scripts/render-grid-preview-ref.mjs [--only=platforms|all]
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const RES = path.join(ROOT, 'resources/background');
const OUT_DIR = path.join(ROOT, 'scripts/output');
const OUT_JSON = path.join(OUT_DIR, 'grid-preview-calibration.json');

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

const BEARD_BOTTOM_GAME_Y = 192;
const BEARD_BOTTOM_FIELD_Y = BEARD_BOTTOM_GAME_Y - FIELD_TOP;
const BOTTOM_ROOT_TOP_FIELD_Y = 645;

const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? 'platforms';

const VARIANTS = [
  {
    mode: 'square_to_platforms',
    label: '正方形贴台',
    filename: '格子预览-正方形贴台-2026-06-26.png',
    caption: null,
  },
  {
    mode: 'fill_rect',
    label: '铺满略扁',
    filename: '格子预览-铺满略扁-2026-06-26.png',
    caption: '铺满略扁：12列×5行贴满青框，单格约79×109px',
  },
  {
    mode: 'square_crop',
    label: '正方形留白',
    filename: '格子预览-正方形留白-2026-06-26.png',
    caption: '正方形留白：边长约79px，走廊内居中，上下左右留白',
  },
  {
    mode: 'square_max_top',
    label: '正方形顶对齐',
    filename: '格子预览-正方形顶对齐-2026-06-26.png',
    caption: '正方形顶对齐：边长约79px，首行贴绿线，下方留白',
  },
];

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

/** 扫描合成背景，标定左右台子内缘(field 坐标) */
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

function buildLayout(mode, edges) {
  const boxTop = BEARD_BOTTOM_FIELD_Y;
  const boxBottom = BOTTOM_ROOT_TOP_FIELD_Y;
  const innerH = boxBottom - boxTop;

  let innerW = FIELD_W;
  let originX = 0;
  let gridRightFieldX = FIELD_W - 1;

  if (mode === 'square_to_platforms' && edges) {
    originX = edges.gridLeftFieldX;
    gridRightFieldX = edges.gridRightFieldX;
    innerW = edges.playableW;
  }

  const cellByW = (innerW - GAP * (COLS - 1)) / COLS;
  const cellByH = (innerH - GAP * (LANES - 1)) / LANES;

  let cellW;
  let cellH;
  let vPad = 0;
  let hPad = 0;

  if (mode === 'fill_rect') {
    innerW = FIELD_W;
    originX = 0;
    cellW = (FIELD_W - GAP * (COLS - 1)) / COLS;
    cellH = cellByH;
  } else if (mode === 'square_to_platforms') {
    const cellSize = Math.min(cellByW, cellByH);
    cellW = cellSize;
    cellH = cellSize;
    vPad = (innerH - (LANES * cellSize + (LANES - 1) * GAP)) / 2;
    hPad = 0;
  } else {
    innerW = FIELD_W;
    originX = 0;
    const cellSize = Math.min(
      (FIELD_W - GAP * (COLS - 1)) / COLS,
      cellByH,
    );
    cellW = cellSize;
    cellH = cellSize;
    vPad = mode === 'square_crop' ? (innerH - (LANES * cellSize + (LANES - 1) * GAP)) / 2 : 0;
    hPad = mode === 'square_crop' ? (innerW - (COLS * cellSize + (COLS - 1) * GAP)) / 2 : 0;
    originX = hPad;
  }

  const bodyW = COLS * cellW + (COLS - 1) * GAP;
  const bodyH = LANES * cellH + (LANES - 1) * GAP;
  const row0Y = boxTop + vPad;
  const gridRightMargin = Math.max(0, FIELD_W - originX - bodyW);

  return {
    mode,
    BOX_TOP: boxTop,
    BOX_BOTTOM: boxBottom,
    originX,
    gridLeftFieldX: mode === 'square_to_platforms' ? edges?.gridLeftFieldX ?? 0 : 0,
    gridRightFieldX: mode === 'square_to_platforms' ? gridRightFieldX : FIELD_W - 1,
    GRID_ORIGIN_X: originX,
    GRID_ORIGIN_Y: boxTop,
    GRID_GAP: GAP,
    CELL_W: cellW,
    CELL_H: cellH,
    GRID_BODY_W: bodyW,
    GRID_BODY_H: bodyH,
    GRID_V_PAD: vPad,
    GRID_H_PAD: hPad,
    GRID_INNER_W: innerW,
    GRID_INNER_H: innerH,
    GRID_RIGHT_MARGIN: gridRightMargin,
    row0Y,
    row4Bottom: row0Y + bodyH,
    BOTTOM_ROOT_TOP_FIELD_Y,
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

function createOverlay(w, h, srcData, srcCh, layout) {
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

  const { BOX_TOP, BOX_BOTTOM, originX: gx0, row0Y, CELL_W, CELL_H } = layout;
  const lineThick = 2;

  const platformLeft = layout.gridLeftFieldX ?? 0;
  const platformRight = layout.gridRightFieldX ?? FIELD_W - 1;
  const corridorW = platformRight - platformLeft;

  drawHLineField(BOX_TOP, [0, 255, 120], 0, FIELD_W - 1, 2);
  drawHLineField(BOX_BOTTOM, [255, 120, 0], 0, FIELD_W - 1, 2);
  drawRectField(platformLeft, BOX_TOP, corridorW, BOX_BOTTOM - BOX_TOP, [34, 211, 238], 2);
  drawVLineField(platformLeft, [255, 80, 255], BOX_TOP, BOX_BOTTOM, 2);
  drawVLineField(platformRight, [255, 80, 255], BOX_TOP, BOX_BOTTOM, 2);

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
    mode: layout.mode,
    gridLeftFieldX: layout.gridLeftFieldX,
    gridRightFieldX: layout.gridRightFieldX,
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
    GRID_BOX_TOP: layout.BOX_TOP,
    GRID_BOX_BOTTOM: layout.BOX_BOTTOM,
    GRID_INNER_W: layout.GRID_INNER_W,
    GRID_INNER_H: +layout.GRID_INNER_H.toFixed(2),
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

async function renderPreview(base, data, info, layout, captionLines, outPath) {
  const overlay = createOverlay(info.width, info.height, data, info.channels, layout);
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

  const base = await compositeScene();
  const { data, info } = await sharp(base).raw().toBuffer({ resolveWithObject: true });
  const edges = detectPlayableEdges(data, info.width, info.channels);

  const toRun =
    ONLY === 'all'
      ? VARIANTS
      : VARIANTS.filter((v) => v.mode === 'square_to_platforms');

  const variants = [];
  for (const v of toRun) {
    const layout = buildLayout(v.mode, edges);
    const cell = layout.CELL_W.toFixed(1);
    const captionLines =
      v.caption != null
        ? [v.caption]
        : [
            `正方形贴台：边长${cell}px，左右贴紫线台子内缘，走廊内垂直居中，左柱根与右柱底对齐`,
            `绿线=胡须87 橙线=树根645 青框=走廊 紫线=台子内缘 黄线=战斗格 浅蓝=5+2+5列界`,
          ];
    const outPath = path.join(OUT_DIR, v.filename);
    await renderPreview(base, data, info, layout, captionLines, outPath);
    variants.push({
      mode: v.mode,
      label: v.label,
      caption: captionLines.join(' '),
      outputPng: outPath,
      proposedBattleConfig: toBattleConfig(layout, edges),
    });
  }

  const calibration = {
    generatedAt: new Date().toISOString(),
    model: 'square-to-platforms',
    canvas: { GAME_W, GAME_H, FIELD_LEFT, FIELD_TOP, FIELD_W, FIELD_H },
    columnAlign: {
      leftColumnHeight: GAME_H + COLUMN_OVERHANG,
      leftColumnTop: -COLUMN_OVERHANG,
      rightColumnHeight: GAME_H,
      note: '左柱上移25px，树根底与右柱看齐',
    },
    playableEdges: edges,
    corridor: {
      BEARD_BOTTOM_FIELD_Y,
      BOTTOM_ROOT_TOP_FIELD_Y,
      innerH: BOTTOM_ROOT_TOP_FIELD_Y - BEARD_BOTTOM_FIELD_Y,
    },
    lineLegend: {
      green: '绿线 field Y=87 — 古树胡须最低垂点，格子上边界参考',
      orange: '橙线 field Y=645 — 草地树根上沿，格子下边界参考',
      cyan: '青框 — 胡须到树根的草地走廊外框(紫线之间)',
      magenta: '紫线 — 左右柱台子内缘，格子横向应贴齐此处',
      yellow: '黄线 — 5×12 战斗单元格(选卡时出现)',
      lightBlue: '浅蓝竖线 — 列区分界：左5列我方 / 中2列缓冲 / 右5列敌方',
      zoneTint: '半透明色块 — 绿=可放我方 / 褐=缓冲 / 橙=敌方区域',
    },
    variants,
    notes: [
      '选定后写入 BattleConfig.js 并同步 style.css left-frame top:-25px',
      '游戏内格子仅选卡时显示',
    ],
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(calibration, null, 2));

  console.log(JSON.stringify(calibration, null, 2));
  console.log('\n输出:');
  for (const v of variants) {
    console.log(`  ${v.outputPng}`);
  }
  console.log(`  ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});