/**
 * 贴台子格子预览：横向强制贴紫线台子内缘，纵向黄格区/走廊两套 × 铺满/近似正方。
 * 用法: node scripts/calibrate-from-ck-red.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CK_PATH = path.join(ROOT, 'resources/ck/ck.png');
const RES = path.join(ROOT, 'resources/background');
const OUT_DIR = path.join(ROOT, 'scripts/output');
const OUT_JSON = path.join(OUT_DIR, 'grid-calibration-ck-red.json');

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

const FALLBACK_YELLOW = {
  originY: 163,
  innerH: 406,
  boxBottom: 569,
  source: 'fallback',
};

const FALLBACK_RED = {
  originX: 0,
  originY: 78,
  innerW: 977,
  innerH: 582,
  boxBottom: 660,
  source: 'fallback',
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

function isYellowGridPixel(r, g, b) {
  return r > 220 && g > 200 && b < 80 && r - b > 140;
}

function isRedFramePixel(r, g, b) {
  return r > 200 && g < 80 && b < 80 && r > g + 120;
}

function bboxFromPointsLoop(points) {
  if (!points.length) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

async function detectYellowGridInCk() {
  const { data, info } = await sharp(CK_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const pts = [];
  const y0 = FIELD_TOP + BEARD_BOTTOM_FIELD_Y;
  const y1 = FIELD_TOP + BOTTOM_ROOT_TOP_FIELD_Y;

  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = FIELD_LEFT; gx < FIELD_LEFT + FIELD_W; gx++) {
      const [r, g, b] = px(data, w, ch, gx, gy);
      if (isYellowGridPixel(r, g, b)) {
        pts.push([gx - FIELD_LEFT, gy - FIELD_TOP]);
      }
    }
  }

  const bb = bboxFromPointsLoop(pts);
  if (!bb || pts.length < 500) {
    return { ...FALLBACK_YELLOW, pointCount: pts.length };
  }

  return {
    originY: bb.y0,
    innerH: bb.y1 - bb.y0,
    boxBottom: bb.y1,
    source: 'detected',
    pointCount: pts.length,
  };
}

function refineRedBoxFromPoints(points) {
  const yhist = {};
  for (const [, y] of points) yhist[y] = (yhist[y] || 0) + 1;

  const rows = Object.entries(yhist)
    .map(([y, c]) => ({ y: +y, c }))
    .filter((r) => r.c > 150)
    .sort((a, b) => a.y - b.y);

  if (rows.length < 2) return null;

  const clusters = [];
  let cur = null;
  for (const r of rows) {
    if (!cur || r.y - cur.lastY > 10) {
      cur = { y0: r.y, y1: r.y, lastY: r.y };
      clusters.push(cur);
    } else {
      cur.y1 = r.y;
      cur.lastY = r.y;
    }
  }

  const top = clusters[0];
  const bottom = clusters[clusters.length - 1];
  const borderYs = new Set();
  for (let y = top.y0; y <= top.y1; y++) borderYs.add(y);
  for (let y = bottom.y0; y <= bottom.y1; y++) borderYs.add(y);

  let x0 = Infinity;
  let x1 = -Infinity;
  for (const [x, y] of points) {
    if (borderYs.has(y)) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }

  if (!Number.isFinite(x0)) return null;

  return {
    originX: x0,
    originY: top.y0,
    innerW: x1 - x0,
    innerH: bottom.y1 - top.y0,
    boxBottom: bottom.y1,
    source: 'detected',
  };
}

/** ck.png 红线仅作对照，不驱动格网 */
async function detectRedFrameReference() {
  const { data, info } = await sharp(CK_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const pts = [];
  for (let gy = FIELD_TOP; gy < h - 20; gy++) {
    for (let gx = FIELD_LEFT; gx < FIELD_LEFT + FIELD_W; gx++) {
      const [r, g, b] = px(data, w, ch, gx, gy);
      if (isRedFramePixel(r, g, b)) {
        pts.push([gx - FIELD_LEFT, gy - FIELD_TOP]);
      }
    }
  }

  const refined = pts.length > 500 ? refineRedBoxFromPoints(pts) : null;
  return { ...(refined ?? FALLBACK_RED), pointCount: pts.length, role: 'reference_only' };
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
  const playableW = gridRightFieldX - gridLeftFieldX;

  return {
    gridLeftFieldX,
    gridRightFieldX,
    playableW,
    leftSamples,
    rightSamples,
    source: 'detected',
  };
}

/** 横向贴紫线，纵向按 preset */
function buildPlatformAnchoredBox(verticalPreset, edges, yellowVertical) {
  const originX = edges.gridLeftFieldX;
  const innerW = edges.playableW;

  let originY;
  let innerH;
  let boxBottom;
  let verticalSource;

  if (verticalPreset === 'yellow_grid') {
    originY = yellowVertical.originY;
    innerH = yellowVertical.innerH;
    boxBottom = yellowVertical.boxBottom;
    verticalSource = yellowVertical.source;
  } else {
    originY = BEARD_BOTTOM_FIELD_Y;
    innerH = BOTTOM_ROOT_TOP_FIELD_Y - BEARD_BOTTOM_FIELD_Y;
    boxBottom = BOTTOM_ROOT_TOP_FIELD_Y;
    verticalSource = 'corridor_landmarks';
  }

  return {
    verticalPreset,
    originX,
    originY,
    innerW,
    innerH,
    boxBottom,
    horizontalSource: 'playable_edges',
    verticalSource,
    source: 'platform_anchored',
  };
}

function squareness(cellW, cellH) {
  const mn = Math.min(cellW, cellH);
  const mx = Math.max(cellW, cellH);
  return { ratio: mn / mx, deviationPct: ((mx - mn) / mx) * 100 };
}

function buildFillBox(scheme, box) {
  const { originX, originY, innerW, innerH } = box;
  const cellW = (innerW - GAP * (COLS - 1)) / COLS;
  const cellH = (innerH - GAP * (LANES - 1)) / LANES;
  const bodyW = COLS * cellW + (COLS - 1) * GAP;
  const bodyH = LANES * cellH + (LANES - 1) * GAP;

  return {
    scheme,
    mode: 'fill_platform_box',
    box,
    originX,
    row0Y: originY,
    GRID_GAP: GAP,
    CELL_W: cellW,
    CELL_H: cellH,
    GRID_BODY_W: bodyW,
    GRID_BODY_H: bodyH,
    GRID_H_PAD: 0,
    GRID_V_PAD: 0,
    GRID_ORIGIN_X: originX,
    GRID_ORIGIN_Y: originY,
    row4Bottom: originY + bodyH,
    GRID_RIGHT_MARGIN: Math.max(0, FIELD_W - originX - bodyW),
    squareness: squareness(cellW, cellH),
    columns: '5+2+5',
    rows: LANES,
  };
}

/** 横向始终贴台；纵向取 min(宽约束,高约束) 并垂直居中 */
function buildNearSquareInBox(scheme, box) {
  const { originX, originY, innerW, innerH } = box;
  const cellW = (innerW - GAP * (COLS - 1)) / COLS;
  const cellByH = (innerH - GAP * (LANES - 1)) / LANES;
  const cellH = Math.min(cellByH, cellW);
  const bodyW = COLS * cellW + (COLS - 1) * GAP;
  const bodyH = LANES * cellH + (LANES - 1) * GAP;
  const hPad = 0;
  const vPad = (innerH - bodyH) / 2;
  const row0Y = originY + vPad;

  return {
    scheme,
    mode: 'near_square_in_box',
    box,
    originX,
    row0Y,
    GRID_GAP: GAP,
    CELL_W: cellW,
    CELL_H: cellH,
    GRID_BODY_W: bodyW,
    GRID_BODY_H: bodyH,
    GRID_H_PAD: hPad,
    GRID_V_PAD: vPad,
    GRID_ORIGIN_X: originX,
    GRID_ORIGIN_Y: row0Y,
    row4Bottom: row0Y + bodyH,
    GRID_RIGHT_MARGIN: Math.max(0, FIELD_W - originX - bodyW),
    squareness: squareness(cellW, cellH),
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

function createOverlay(w, h, srcData, srcCh, layout, edges, gridBox, redRef) {
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

  const drawRectFieldDashed = (fx, fy, fw, fh, color, thick = 2, dash = 6) => {
    const plot = (x, y) => {
      for (let t = 0; t < thick; t++) {
        const [gx, gy] = fieldToGame(x, y);
        setPx(gx, gy, ...color);
      }
    };
    for (let x = fx; x <= fx + fw; x++) {
      if (((x - fx) / dash) % 2 < 1) {
        plot(x, fy);
        plot(x, fy + fh);
      }
    }
    for (let y = fy; y <= fy + fh; y++) {
      if (((y - fy) / dash) % 2 < 1) {
        plot(fx, y);
        plot(fx + fw, y);
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

  const { originX: gx0, row0Y, CELL_W, CELL_H, GRID_BODY_W, GRID_BODY_H } = layout;
  const lineThick = 2;
  const gridRight = Math.round(gx0 + GRID_BODY_W);
  const gridLeft = Math.round(gx0);

  drawHLineField(BEARD_BOTTOM_FIELD_Y, [0, 255, 120], 0, FIELD_W - 1, 2);
  drawHLineField(BOTTOM_ROOT_TOP_FIELD_Y, [255, 120, 0], 0, FIELD_W - 1, 2);

  drawRectField(
    gridBox.originX,
    gridBox.originY,
    gridBox.innerW,
    gridBox.innerH,
    [34, 211, 238],
    1,
  );

  drawVLineField(redRef.originX, [255, 70, 70], redRef.originY, redRef.boxBottom, 1);
  drawVLineField(redRef.originX + redRef.innerW, [255, 70, 70], redRef.originY, redRef.boxBottom, 1);
  drawRectFieldDashed(
    redRef.originX,
    redRef.originY,
    redRef.innerW,
    redRef.innerH,
    [255, 70, 70],
    1,
    10,
  );

  drawVLineField(gridLeft, [255, 80, 255], row0Y, row0Y + GRID_BODY_H, 3);
  drawVLineField(gridRight, [255, 80, 255], row0Y, row0Y + GRID_BODY_H, 3);

  const zoneColors = [
    { cols: PLAYER_COLS, fill: [34, 120, 55] },
    { cols: BUFFER_COLS, fill: [120, 90, 30] },
    { cols: COLS - PLAYER_COLS - BUFFER_COLS, fill: [160, 70, 25] },
  ];
  let colOff = 0;
  for (const z of zoneColors) {
    const zw = z.cols * CELL_W + (z.cols - 1) * GAP;
    fillRectField(gx0 + colOff * (CELL_W + GAP), row0Y, zw, GRID_BODY_H, z.fill);
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
  drawVLineField(xAfterPlayer, [120, 220, 255], row0Y, row0Y + GRID_BODY_H, 1);
  drawVLineField(xAfterBuffer, [120, 220, 255], row0Y, row0Y + GRID_BODY_H, 1);

  return rgba;
}

function toBattleConfig(layout, edges) {
  return {
    mode: layout.mode,
    scheme: layout.scheme,
    verticalPreset: layout.box.verticalPreset,
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
    squareness: {
      ratio: +layout.squareness.ratio.toFixed(4),
      deviationPct: +layout.squareness.deviationPct.toFixed(2),
    },
    gridBox: {
      originX: layout.box.originX,
      originY: layout.box.originY,
      innerW: layout.box.innerW,
      innerH: layout.box.innerH,
      boxBottom: layout.box.boxBottom,
      horizontalSource: layout.box.horizontalSource,
      verticalSource: layout.box.verticalSource,
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

async function renderPreview(base, data, info, layout, edges, gridBox, redRef, captionLines, outPath) {
  const overlay = createOverlay(
    info.width,
    info.height,
    data,
    info.channels,
    layout,
    edges,
    gridBox,
    redRef,
  );
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

  const [yellowVertical, redRef] = await Promise.all([
    detectYellowGridInCk(),
    detectRedFrameReference(),
  ]);

  const base = await compositeScene();
  const { data, info } = await sharp(base).raw().toBuffer({ resolveWithObject: true });
  const edges = detectPlayableEdges(data, info.width, info.channels);

  const verticalPresets = [
    {
      id: 'yellow_grid',
      label: '黄格区',
      fileTag: '贴台黄格',
      yDesc: () => `Y=${yellowVertical.originY}~${yellowVertical.boxBottom}`,
    },
    {
      id: 'corridor',
      label: '走廊',
      fileTag: '贴台走廊',
      yDesc: () => `Y=${BEARD_BOTTOM_FIELD_Y}~${BOTTOM_ROOT_TOP_FIELD_Y}`,
    },
  ];

  const layoutModes = [
    {
      id: 'fill',
      label: '铺满',
      fileSuffix: '铺满',
      build: (scheme, box) => buildFillBox(scheme, box),
      captionExtra: (layout, vp) => {
        const sq = layout.squareness;
        return `cell=${layout.CELL_W.toFixed(1)}×${layout.CELL_H.toFixed(1)}px  方正度${(sq.ratio * 100).toFixed(0)}%  横向贴紫线 X=${edges.gridLeftFieldX}~${edges.gridRightFieldX}  ${vp.yDesc()}`;
      },
    },
    {
      id: 'near_square',
      label: '近似正方',
      fileSuffix: '近似正方',
      build: (scheme, box) => buildNearSquareInBox(scheme, box),
      captionExtra: (layout, vp) =>
        `cell=${layout.CELL_W.toFixed(1)}×${layout.CELL_H.toFixed(1)}px  vPad=${layout.GRID_V_PAD.toFixed(1)}  row0Y=${layout.row0Y.toFixed(1)}  横向贴紫线  ${vp.yDesc()}`,
    },
  ];

  const outputs = [];
  for (const vp of verticalPresets) {
    const gridBox = buildPlatformAnchoredBox(vp.id, edges, yellowVertical);
    for (const lm of layoutModes) {
      const scheme = `${vp.id}_${lm.id}`;
      const layout = lm.build(scheme, gridBox);
      const filename = `格子预览-${vp.fileTag}-${lm.fileSuffix}-ck.png`;
      const outPath = path.join(OUT_DIR, filename);
      const caption = [
        `${vp.label}+${lm.label}：${lm.captionExtra(layout, vp)}`,
        `青框=格网外框  紫粗线=格左右缘(贴台)  红虚线=ck原稿对照  绿87/橙645/黄格/浅蓝5+2+5`,
      ];
      await renderPreview(base, data, info, layout, edges, gridBox, redRef, caption, outPath);
      outputs.push({
        scheme,
        label: `${vp.label} ${lm.label}`,
        outputPng: outPath,
        gridBox,
        proposedBattleConfig: toBattleConfig(layout, edges),
      });
    }
  }

  const meta = await sharp(CK_PATH).metadata();
  const calibration = {
    generatedAt: new Date().toISOString(),
    model: 'platform-anchored',
    sourceImage: CK_PATH,
    imageSize: { w: meta.width, h: meta.height },
    canvas: { GAME_W, GAME_H, FIELD_LEFT, FIELD_TOP, FIELD_W, FIELD_H },
    columnAlign: {
      leftColumnHeight: GAME_H + COLUMN_OVERHANG,
      leftColumnTop: -COLUMN_OVERHANG,
      rightColumnHeight: GAME_H,
      note: '左柱上移25px，树根底与右柱看齐',
    },
    playableEdges: edges,
    yellowGridVertical: yellowVertical,
    redFrameReference: redRef,
    corridor: {
      BEARD_BOTTOM_FIELD_Y,
      BOTTOM_ROOT_TOP_FIELD_Y,
      innerH: BOTTOM_ROOT_TOP_FIELD_Y - BEARD_BOTTOM_FIELD_Y,
    },
    lineLegend: {
      green: '绿线 field Y=87 — 胡须底',
      orange: '橙线 field Y=645 — 树根顶',
      cyan: '青框 — 格网标定外框(贴台横向)',
      magentaThick: '紫粗线 — 格网左/右缘，与台子内缘重合',
      redDashed: '红虚线 — ck.png 原稿红线(仅对照)',
      yellow: '黄线 — 12×5 战斗单元格',
      lightBlue: '浅蓝竖线 — 5+2+5 列分界',
    },
    variants: outputs,
    nextStep: '请对比 4 张预览，回复选哪张(黄格/走廊 + 铺满/近似正方)',
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