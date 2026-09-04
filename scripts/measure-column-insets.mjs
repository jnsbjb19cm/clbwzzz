/**
 * 测量左右柱图在 1248×832 运行时下视觉内缘(台子贴格锚点)
 * 用法: node scripts/measure-column-insets.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const RES = path.join(ROOT, 'resources/background');
const OUT_JSON = path.join(ROOT, 'scripts/output/column-insets.json');

const GAME_W = 1248;
const GAME_H = 832;
const COLUMN_OVERHANG = 25;
const FIELD_TOP = 105;
const FIELD_BOTTOM = 25;

const BEARD_FIELD_Y = 87;
const ROOT_FIELD_Y = 645;

const SAMPLE_YS = [150, 250, 350, 450, 550];

async function renderColumnLayer(which) {
  const canvasH = GAME_H + COLUMN_OVERHANG;
  const file = which === 'left' ? 'leftcolumn1.png' : 'rightcolumn1.png';
  const col = await sharp(path.join(RES, file))
    .resize(which === 'left' ? { width: GAME_W, height: canvasH, fit: 'fill' } : { height: GAME_H })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = col;
  const { width: w, height: h, channels: ch } = info;

  const rgba = Buffer.alloc(GAME_W * GAME_H * 4);
  const alphaThreshold = 24;

  const colLeft = which === 'right' ? GAME_W - w : 0;
  const colTop = which === 'left' ? COLUMN_OVERHANG : COLUMN_OVERHANG;

  for (let gy = 0; gy < GAME_H; gy++) {
    for (let gx = 0; gx < GAME_W; gx++) {
      const di = (gy * GAME_W + gx) * 4;
      let a = 0;
      const sy = gy + colTop - COLUMN_OVERHANG;
      const sx = gx - colLeft;
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const si = (sy * w + sx) * ch;
        a = ch === 4 ? data[si + 3] : 255;
      }
      rgba[di + 3] = a >= alphaThreshold ? a : 0;
      rgba[di] = rgba[di + 1] = rgba[di + 2] = a >= alphaThreshold ? 200 : 0;
    }
  }

  return { rgba, width: GAME_W, height: GAME_H, meta: { w, h, colLeft, colTop } };
}

function scanInnerEdge(rgba, w, h, side) {
  const samples = [];
  for (const fieldY of SAMPLE_YS) {
    const gy = FIELD_TOP + fieldY;
    if (gy < 0 || gy >= h) continue;

    if (side === 'left') {
      let edge = 0;
      for (let gx = 0; gx < w; gx++) {
        const a = rgba[(gy * w + gx) * 4 + 3];
        if (a > 24) edge = gx;
      }
      samples.push(edge);
    } else {
      let edge = w - 1;
      for (let gx = w - 1; gx >= 0; gx--) {
        const a = rgba[(gy * w + gx) * 4 + 3];
        if (a > 24) {
          edge = gx;
          break;
        }
      }
      samples.push(edge);
    }
  }

  if (side === 'left') {
    const gameX = Math.max(...samples);
    return { gameX, fieldX: gameX - 135, samples };
  }
  const gameX = Math.min(...samples);
  return { gameX, fieldX: gameX - 135, samples };
}

/** 与 runtime 一致：width:auto + 高度 contain */
async function measureRuntimeStyle() {
  const canvasH = GAME_H + COLUMN_OVERHANG;
  const leftMeta = await sharp(path.join(RES, 'leftcolumn1.png')).metadata();
  const rightMeta = await sharp(path.join(RES, 'rightcolumn1.png')).metadata();

  const leftW = Math.round((leftMeta.width / leftMeta.height) * canvasH);
  const rightW = Math.round((rightMeta.width / rightMeta.height) * GAME_H);

  const leftBuf = await sharp(path.join(RES, 'leftcolumn1.png'))
    .resize(leftW, canvasH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rightBuf = await sharp(path.join(RES, 'rightcolumn1.png'))
    .resize(rightW, GAME_H, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const leftSamples = [];
  const rightSamples = [];

  for (const fieldY of SAMPLE_YS) {
    const gy = FIELD_TOP + fieldY;

    let lEdge = 0;
    for (let x = 0; x < leftW; x++) {
      const si = (gy * leftW + x) * 4 + 3;
      if (leftBuf.data[si] > 24) lEdge = x;
    }
    leftSamples.push(lEdge);

    const rightGameLeft = GAME_W - rightW;
    let rEdge = GAME_W - 1;
    for (let x = rightW - 1; x >= 0; x--) {
      const si = ((gy - COLUMN_OVERHANG) * rightW + x) * 4 + 3;
      if (si >= 0 && rightBuf.data[si] > 24) {
        rEdge = rightGameLeft + x;
        break;
      }
    }
    rightSamples.push(rEdge);
  }

  const leftGameX = Math.max(...leftSamples);
  const rightGameX = Math.min(...rightSamples);

  return {
    mode: 'runtime_width_auto',
    leftColumnWidth: leftW,
    rightColumnWidth: rightW,
    leftGameInnerX: leftGameX,
    rightGameInnerX: rightGameX,
    leftFieldInnerX: leftGameX - 135,
    rightFieldInnerX: rightGameX - 135,
    playableFieldW: rightGameX - 135 - (leftGameX - 135),
    leftSamples,
    rightSamples,
  };
}

async function main() {
  const leftLayer = await renderColumnLayer('left');
  const rightLayer = await renderColumnLayer('right');

  const leftEdge = scanInnerEdge(leftLayer.rgba, leftLayer.width, leftLayer.height, 'left');
  const rightEdge = scanInnerEdge(rightLayer.rgba, rightLayer.width, rightLayer.height, 'right');

  const runtime = await measureRuntimeStyle();

  const fieldLeft = runtime.leftGameInnerX;
  const fieldRight = runtime.rightGameInnerX;
  const fieldW = fieldRight - fieldLeft;

  const legacyFieldLeft = 135;
  const legacyFieldW = GAME_W - legacyFieldLeft * 2;

  const result = {
    generatedAt: new Date().toISOString(),
    canvas: { GAME_W, GAME_H, FIELD_TOP, legacyFieldLeft, legacyFieldW },
    compositeFillMode: {
      note: '预览脚本把左柱拉满 GAME_W 的测量(旧)',
      left: leftEdge,
      right: rightEdge,
      fieldLeft: leftEdge.gameX - legacyFieldLeft,
      fieldRight: rightEdge.gameX - legacyFieldLeft,
      fieldW: rightEdge.gameX - leftEdge.gameX,
    },
    runtimeAutoWidth: runtime,
    recommended: {
      FIELD_LEFT: fieldLeft,
      FIELD_RIGHT_INSET: GAME_W - fieldRight,
      FIELD_W: fieldW,
      gridLeftFieldX: 0,
      gridRightFieldX: fieldW,
      note: 'field 原点仍在 battlefield-wrap 左上；grid 从 0 铺到 fieldW，col11 右缘=fieldW',
    },
    corridor: {
      fieldY0: BEARD_FIELD_Y,
      fieldY1: ROOT_FIELD_Y,
      innerH: ROOT_FIELD_Y - BEARD_FIELD_Y,
    },
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n写入: ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});