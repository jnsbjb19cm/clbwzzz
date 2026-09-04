/** 从参考截图标定格子占比与卡槽尺寸 */
import sharp from 'sharp';

const GRID_REF =
  'C:/Users/佰震/Pictures/Screenshots/屏幕截图 2026-06-24 170721.png';
const SLOT_REF =
  'C:/Users/佰震/Pictures/Screenshots/屏幕截图 2026-06-24 155721.png';

function cluster(values, maxGap = 4) {
  const sorted = [...values].sort((a, b) => a - b);
  const groups = [];
  let cur = [];
  for (const v of sorted) {
    if (!cur.length || v - cur[cur.length - 1] <= maxGap) cur.push(v);
    else {
      groups.push(cur);
      cur = [v];
    }
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => Math.round(g.reduce((a, b) => a + b, 0) / g.length));
}

async function measureGridRef() {
  const { data, info } = await sharp(GRID_REF).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels: ch } = info;
  console.log('\n=== 170721 grid ref ===');
  console.log('image', width, 'x', height);

  const orange = [];
  for (let y = Math.floor(height * 0.18); y < Math.floor(height * 0.72); y++) {
    for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.88); x++) {
      const i = (y * width + x) * ch;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 210 && g > 95 && g < 210 && b < 90) orange.push([x, y]);
    }
  }
  if (!orange.length) {
    console.log('no orange grid lines found');
    return;
  }
  const xs = orange.map((p) => p[0]);
  const ys = orange.map((p) => p[1]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const gw = right - left;
  const gh = bottom - top;
  console.log('grid bbox', { left, right, top, bottom, gw, gh });
  console.log('ratio of screen', {
    w: (gw / width).toFixed(4),
    h: (gh / height).toFixed(4),
  });
  for (const cols of [9, 10, 12]) {
    const cellW = gw / cols;
    const cellH = gh / 5;
    console.log(`if ${cols}x5`, {
      cellW: cellW.toFixed(1),
      cellH: cellH.toFixed(1),
      square: Math.abs(cellW - cellH) < 8,
    });
  }
}

async function measureSlotRef() {
  const { data, info } = await sharp(SLOT_REF).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels: ch } = info;
  console.log('\n=== 155721 slot ref ===');
  console.log('image', width, 'x', height);

  const y0 = Math.floor(height * 0.12);
  const y1 = Math.floor(height * 0.92);
  const dividers = [];
  for (let x = 2; x < width - 2; x++) {
    let dark = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 1) {
      const i = (y * width + x) * ch;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      n++;
      if (lum < 85) dark++;
    }
    if (dark / n > 0.38) dividers.push(x);
  }
  const bounds = cluster(dividers, 3);
  console.log('divider count', bounds.length, bounds.slice(0, 12));

  if (bounds.length >= 2) {
    const pitch = bounds[1] - bounds[0];
    const firstCenter = bounds[0];
    const lastCenter = bounds[bounds.length - 1];
    const slotLeft = firstCenter - pitch / 2;
    const slotRight = lastCenter + pitch / 2;
    const slotW = pitch;
    const slotsW = slotRight - slotLeft;

    let top = y0;
    let bottom = y1;
    const midX = Math.round((bounds[2] ?? bounds[1]) );
    for (let y = 0; y < height; y++) {
      const i = (y * width + midX) * ch;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 70 && lum < 200) {
        top = y;
        break;
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      const i = (y * width + midX) * ch;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 70 && lum < 200) {
        bottom = y;
        break;
      }
    }
    const slotH = bottom - top + 1;

    console.log('measured slots', {
      pitch,
      slotLeft: Math.round(slotLeft),
      slotTop: top,
      slotW: Math.round(slotW),
      slotH,
      slotsW: Math.round(slotsW),
      resourceW: Math.round(slotLeft),
      barH: height,
    });
    console.log('ratios', {
      slotHOverBar: (slotH / height).toFixed(3),
      slotsWOverBar: (slotsW / width).toFixed(3),
      slotWOverH: (slotW / slotH).toFixed(3),
    });

    const TARGET_BAR_W = 874;
    const TARGET_BAR_H = 95;
    const sx = TARGET_BAR_W / width;
    const sy = TARGET_BAR_H / height;
    console.log('scaled to 874x95', {
      HAND_SLOTS_LEFT: Math.round(slotLeft * sx),
      HAND_SLOTS_TOP: Math.round(top * sy),
      HAND_SLOT_W: Math.round(slotW * sx),
      HAND_SLOTS_HEIGHT: Math.round(slotH * sy),
      HAND_SLOTS_WIDTH: Math.round(slotsW * sx),
      HAND_SLOT_GAP: 0,
    });
  }
}

async function measureCardslotAsset() {
  const p = 'assets/battle/jungle/cardslot.jpg';
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels: ch } = info;
  const DW = 874;
  const DH = 95;
  const csx = DW / width;
  const csy = DH / height;
  console.log('\n=== cardslot.jpg asset ===', width, 'x', height);

  const dividerSrc = [469, 733, 997, 1261, 1525, 1789, 2054, 2319, 2584, 2850];
  const pitch = dividerSrc[1] - dividerSrc[0];
  const slotLeft = dividerSrc[0] - pitch / 2;

  const y = Math.floor(height * 0.42);
  let top = 0;
  let bottom = height - 1;
  const xMid = dividerSrc[2];
  for (let yy = 0; yy < height; yy++) {
    const i = (yy * width + xMid) * ch;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum >= 118 && lum <= 172) {
      top = yy;
      break;
    }
  }
  for (let yy = height - 1; yy >= 0; yy--) {
    const i = (yy * width + xMid) * ch;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum >= 118 && lum <= 172) {
      bottom = yy;
      break;
    }
  }

  console.log('cardslot scaled', {
    HAND_SLOTS_LEFT: Math.round(slotLeft * csx),
    HAND_SLOTS_TOP: Math.round(top * csy),
    HAND_SLOT_W: Math.round(pitch * csx),
    HAND_SLOTS_HEIGHT: Math.round((bottom - top + 1) * csy),
    pitchSrc: pitch,
    slotHSrc: bottom - top + 1,
  });
}

await measureGridRef();
await measureSlotRef();
await measureCardslotAsset();