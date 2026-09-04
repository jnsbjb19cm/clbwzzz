import sharp from 'sharp';

async function scanBackground() {
  const p = 'assets/battle/jungle/background.jpg';
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const midY = Math.floor(height * 0.55);

  let leftGrass = 0;
  for (let x = 0; x < width; x++) {
    const i = (midY * width + x) * channels;
    const g = data[i + 1];
    if (g > 120) {
      leftGrass = x;
      break;
    }
  }
  let rightGrass = width - 1;
  for (let x = width - 1; x >= 0; x--) {
    const i = (midY * width + x) * channels;
    const g = data[i + 1];
    if (g > 120) {
      rightGrass = x;
      break;
    }
  }

  let topGrass = 0;
  for (let y = 0; y < height; y++) {
    const i = (y * width + Math.floor(width / 2)) * channels;
    const g = data[i + 1];
    if (g > 130) {
      topGrass = y;
      break;
    }
  }
  let bottomGrass = height - 1;
  for (let y = height - 1; y >= 0; y--) {
    const i = (y * width + Math.floor(width / 2)) * channels;
    const g = data[i + 1];
    if (g > 130) {
      bottomGrass = y;
      break;
    }
  }

  console.log('background grass bounds', {
    leftGrass,
    rightGrass,
    topGrass,
    bottomGrass,
    grassW: rightGrass - leftGrass + 1,
    grassH: bottomGrass - topGrass + 1,
  });
  console.log('current field inset', {
    left: 135,
    right: 135,
    top: 105,
    bottom: 25,
    w: width - 270,
    h: height - 130,
  });
}

async function scanCardslotFinal() {
  const p = 'assets/battle/jungle/cardslot.jpg';
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const DW = 874;
  const DH = 95;
  const csx = DW / width;
  const csy = DH / height;

  // slot dividers = dark vertical lines ~106,106,106
  const y0 = Math.floor(height * 0.35);
  const y1 = Math.floor(height * 0.85);
  const dividers = [];
  for (let x = 300; x < width - 30; x++) {
    let dark = 0;
    for (let y = y0; y < y1; y += 2) {
      const i = (y * width + x) * channels;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < 140) dark++;
    }
    if (dark > (y1 - y0) * 0.35) dividers.push(x);
  }
  const bounds = [];
  let c = [];
  for (const d of dividers) {
    if (!c.length || d - c[c.length - 1] <= 4) c.push(d);
    else {
      bounds.push(Math.round(c.reduce((a, b) => a + b, 0) / c.length));
      c = [d];
    }
  }
  if (c.length) bounds.push(Math.round(c.reduce((a, b) => a + b, 0) / c.length));

  const first = bounds[0];
  const last = bounds[bounds.length - 1];
  const slotW = (last - first) / (bounds.length - 1);
  const slotLeft = first - slotW / 2;

  console.log('cardslot dividers', bounds.length, bounds.map((b) => Math.round(b * csx)));
  console.log('cardslot hand area (outer frame)', {
    HAND_SLOTS_LEFT: Math.round(slotLeft * csx),
    HAND_SLOTS_WIDTH: Math.round((last + slotW / 2 - slotLeft) * csx),
    HAND_SLOT_W: Math.round(slotW * csx),
    HAND_SLOTS_TOP: 6,
    HAND_SLOTS_HEIGHT: 85,
  });
}

await scanBackground();
await scanCardslotFinal();