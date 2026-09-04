/**
 * 末列贴柱预览：柱图实测内缘 + 黄格纵向 + 可选裁剪草地
 * 用法: node scripts/render-pillar-snap-preview.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const RES = path.join(ROOT, 'resources/background');
const OUT_DIR = path.join(ROOT, 'scripts/output');
const INSETS_JSON = path.join(OUT_DIR, 'column-insets.json');
const CK_PATH = path.join(ROOT, 'resources/ck/ck.png');

const GAME_W = 1248;
const GAME_H = 832;
const COLUMN_OVERHANG = 25;
const FIELD_TOP = 105;
const FIELD_BOTTOM = 25;

const COLS = 12;
const LANES = 5;
const GAP = 3;
const PLAYER_COLS = 5;
const BUFFER_COLS = 2;

const BEARD_FIELD_Y = 87;
const ROOT_FIELD_Y = 645;

function px(data, w, ch, gx, gy) {
  const i = (gy * w + gx) * ch;
  return [data[i], data[i + 1], data[i + 2]];
}

function isYellowGridPixel(r, g, b) {
  return r > 220 && g > 200 && b < 80 && r - b > 140;
}

async function detectYellowVertical() {
  const { data, info } = await sharp(CK_PATH).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const pts = [];
  const y0 = FIELD_TOP + BEARD_FIELD_Y;
  const y1 = FIELD_TOP + ROOT_FIELD_Y;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = 135; gx < 135 + 978; gx++) {
      const [r, g, b] = px(data, w, ch, gx, gy);
      if (isYellowGridPixel(r, g, b)) pts.push([gx - 135, gy - FIELD_TOP]);
    }
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const [, y] of pts) {
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  if (!pts.length) return { originY: 163, innerH: 394, boxBottom: 557 };
  return { originY: yMin, innerH: yMax - yMin, boxBottom: yMax };
}

function buildGridLayout(fieldW, box) {
  const cellW = (fieldW - GAP * (COLS - 1)) / COLS;
  const cellH = (box.innerH - GAP * (LANES - 1)) / LANES;
  const bodyW = COLS * cellW + (COLS - 1) * GAP;
  const bodyH = LANES * cellH + (LANES - 1) * GAP;
  return {
    GRID_ORIGIN_X: 0,
    GRID_ORIGIN_Y: box.originY,
    row0Y: box.originY,
    CELL_W: cellW,
    CELL_H: cellH,
    GRID_BODY_W: bodyW,
    GRID_BODY_H: bodyH,
    col0Left: 0,
    col11Right: 11 * (cellW + GAP) + cellW,
  };
}

async function compositeRuntimeScene(insets, grassPath) {
  const canvasH = GAME_H + COLUMN_OVERHANG;
  const fieldLeft = insets.recommended.FIELD_LEFT;
  const fieldW = insets.recommended.FIELD_W;

  const corridorH = ROOT_FIELD_Y - BEARD_FIELD_Y;
  const grass = await sharp(grassPath)
    .resize(fieldW, corridorH, { fit: 'fill' })
    .png()
    .toBuffer();

  const leftMeta = await sharp(path.join(RES, 'leftcolumn1.png')).metadata();
  const rightMeta = await sharp(path.join(RES, 'rightcolumn1.png')).metadata();
  const leftW = Math.round((leftMeta.width / leftMeta.height) * canvasH);
  const rightW = Math.round((rightMeta.width / rightMeta.height) * GAME_H);

  let leftCol = await sharp(path.join(RES, 'leftcolumn1.png'))
    .resize(leftW, canvasH, { fit: 'fill' })
    .png()
    .toBuffer();
  if (leftW > GAME_W) {
    leftCol = await sharp(leftCol)
      .extract({ left: 0, top: 0, width: GAME_W, height: canvasH })
      .png()
      .toBuffer();
  }
  const rightCol = await sharp(path.join(RES, 'rightcolumn1.png'))
    .resize(rightW, GAME_H, { fit: 'fill' })
    .png()
    .toBuffer();

  const baseGrass = await sharp({
    create: {
      width: GAME_W,
      height: GAME_H,
      channels: 4,
      background: { r: 40, g: 90, b: 40, alpha: 255 },
    },
  })
    .png()
    .toBuffer();

  const tall = await sharp({
    create: {
      width: GAME_W,
      height: canvasH,
      channels: 4,
      background: { r: 10, g: 15, b: 12, alpha: 255 },
    },
  })
    .composite([
      { input: baseGrass, left: 0, top: COLUMN_OVERHANG },
      { input: grass, left: fieldLeft, top: COLUMN_OVERHANG + FIELD_TOP + BEARD_FIELD_Y },
      { input: leftCol, left: 0, top: 0 },
      { input: rightCol, left: GAME_W - rightW, top: COLUMN_OVERHANG },
    ])
    .png()
    .toBuffer();

  return sharp(tall)
    .extract({ left: 0, top: COLUMN_OVERHANG, width: GAME_W, height: GAME_H })
    .png()
    .toBuffer();
}

async function cropGrassCorridor(insets) {
  const out = path.join(RES, 'grass-corridor.jpg');
  const fieldLeft = insets.recommended.FIELD_LEFT;
  const fieldW = insets.recommended.FIELD_W;
  const cropH = ROOT_FIELD_Y - BEARD_FIELD_Y;

  await sharp(path.join(RES, 'grassbg.jpg'))
    .resize(GAME_W, GAME_H, { fit: 'cover', position: 'centre' })
    .extract({
      left: fieldLeft,
      top: FIELD_TOP + BEARD_FIELD_Y,
      width: fieldW,
      height: cropH,
    })
    .jpeg({ quality: 92 })
    .toFile(out);

  return out;
}

function createOverlay(w, h, srcData, srcCh, layout, insets) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const si = i * srcCh;
    const di = i * 4;
    rgba[di] = srcData[si];
    rgba[di + 1] = srcData[si + 1];
    rgba[di + 2] = srcData[si + 2];
    rgba[di + 3] = 255;
  }

  const fieldLeft = insets.recommended.FIELD_LEFT;
  const fieldW = insets.recommended.FIELD_W;
  const leftInner = insets.runtimeAutoWidth.leftGameInnerX;
  const rightInner = insets.runtimeAutoWidth.rightGameInnerX;

  const setPx = (gx, gy, r, g, b, a = 255) => {
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
    const i = (gy * w + gx) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  const f2g = (fx, fy) => [fieldLeft + fx, FIELD_TOP + fy];

  const drawH = (fy, color, x0, x1, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let x = x0; x <= x1; x++) {
        const [gx, gy] = f2g(x, fy + t);
        setPx(gx, gy, ...color);
      }
    }
  };

  const drawV = (fx, color, y0, y1, thick = 2) => {
    for (let t = 0; t < thick; t++) {
      for (let y = y0; y <= y1; y++) {
        const [gx, gy] = f2g(fx + t, y);
        setPx(gx, gy, ...color);
      }
    }
  };

  const { row0Y, CELL_W, CELL_H, GRID_BODY_W, GRID_BODY_H } = layout;
  const gx0 = layout.GRID_ORIGIN_X;

  drawH(BEARD_FIELD_Y, [0, 255, 120], 0, fieldW - 1);
  drawH(ROOT_FIELD_Y, [255, 120, 0], 0, fieldW - 1);
  drawV(leftInner - fieldLeft, [255, 80, 255], row0Y, row0Y + GRID_BODY_H, 3);
  drawV(rightInner - fieldLeft, [255, 80, 255], row0Y, row0Y + GRID_BODY_H, 3);

  const col0X = Math.round(gx0);
  const col11R = Math.round(layout.col11Right);
  drawV(col0X, [0, 255, 255], row0Y, row0Y + GRID_BODY_H, 3);
  drawV(col11R, [0, 255, 255], row0Y, row0Y + GRID_BODY_H, 3);

  for (let lane = 0; lane < LANES; lane++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = Math.round(gx0 + col * (CELL_W + GAP));
      const y0 = Math.round(row0Y + lane * (CELL_H + GAP));
      const x1 = Math.round(x0 + CELL_W);
      const y1 = Math.round(y0 + CELL_H);
      for (let x = x0; x <= x1; x++) {
        const [gx, gy] = f2g(x, y0);
        setPx(gx, gy, 255, 220, 40);
        const [gx2, gy2] = f2g(x, y1);
        setPx(gx2, gy2, 255, 220, 40);
      }
      for (let y = y0; y <= y1; y++) {
        const [gx, gy] = f2g(x0, y);
        setPx(gx, gy, 255, 220, 40);
        const [gx2, gy2] = f2g(x1, y);
        setPx(gx2, gy2, 255, 220, 40);
      }
    }
  }

  const xP = gx0 + PLAYER_COLS * (CELL_W + GAP) - GAP;
  const xB = xP + BUFFER_COLS * (CELL_W + GAP);
  drawV(xP, [120, 220, 255], row0Y, row0Y + GRID_BODY_H, 1);
  drawV(xB, [120, 220, 255], row0Y, row0Y + GRID_BODY_H, 1);

  return rgba;
}

function caption(lines) {
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
  <rect width="${GAME_W}" height="${h}" fill="rgba(8,12,18,0.9)"/>
  ${text}
</svg>`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const insets = JSON.parse(fs.readFileSync(INSETS_JSON, 'utf8'));
  const yellow = await detectYellowVertical();
  const fieldW = insets.recommended.FIELD_W;
  const layout = buildGridLayout(fieldW, yellow);

  const col11GameX = insets.recommended.FIELD_LEFT + layout.col11Right;
  const col0GameX = insets.recommended.FIELD_LEFT + layout.col0Left;
  const deltaLeft = col0GameX - insets.runtimeAutoWidth.leftGameInnerX;
  const deltaRight = col11GameX - insets.runtimeAutoWidth.rightGameInnerX;

  const grassCorridor = await cropGrassCorridor(insets);
  const base = await compositeRuntimeScene(insets, grassCorridor);
  const { data, info } = await sharp(base).raw().toBuffer({ resolveWithObject: true });
  const overlay = createOverlay(info.width, info.height, data, info.channels, layout, insets);
  const overlayBuf = await sharp(overlay, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const cap = caption([
    `末列贴柱：cell=${layout.CELL_W.toFixed(1)}×${layout.CELL_H.toFixed(1)}  FIELD_LEFT=${insets.recommended.FIELD_LEFT}  FIELD_W=${fieldW}`,
    `col0左缘偏差=${deltaLeft.toFixed(1)}px  col11右缘偏差=${deltaRight.toFixed(1)}px(目标0)  青=col0/11  紫=柱内缘`,
    `黄格Y=${yellow.originY}~${yellow.boxBottom}  裁剪草地=${path.basename(grassCorridor)}`,
  ]);

  const outPng = path.join(OUT_DIR, '格子预览-末列贴柱-ck.png');
  await sharp(base)
    .composite([
      { input: overlayBuf, top: 0, left: 0 },
      { input: cap, top: 0, left: 0 },
    ])
    .png()
    .toFile(outPng);

  const proposal = {
    FIELD_LEFT: insets.recommended.FIELD_LEFT,
    FIELD_RIGHT_INSET: insets.recommended.FIELD_RIGHT_INSET,
    FIELD_W: fieldW,
    GRID_ORIGIN_X: layout.GRID_ORIGIN_X,
    GRID_ORIGIN_Y: layout.GRID_ORIGIN_Y,
    GRID_GAP: GAP,
    CELL_W: +layout.CELL_W.toFixed(4),
    CELL_H: +layout.CELL_H.toFixed(4),
    GRID_BODY_W: +layout.GRID_BODY_W.toFixed(4),
    GRID_BODY_H: +layout.GRID_BODY_H.toFixed(4),
    col11RightFieldX: +layout.col11Right.toFixed(4),
    snapDelta: { col0: deltaLeft, col11: deltaRight },
    yellowVertical: yellow,
  };

  const outJson = path.join(OUT_DIR, 'grid-pillar-snap-proposal.json');
  fs.writeFileSync(outJson, JSON.stringify(proposal, null, 2));

  console.log(JSON.stringify(proposal, null, 2));
  console.log(`\n输出:\n  ${outPng}\n  ${outJson}\n  ${grassCorridor}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});