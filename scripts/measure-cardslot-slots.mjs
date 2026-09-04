import sharp from 'sharp';

const p = 'assets/battle/jungle/cardslot.jpg';
const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const DW = 874;
const DH = 95;
const csx = DW / width;
const csy = DH / height;

function lum(x, y) {
  const i = (y * width + x) * channels;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

function isSlotFill(x, y) {
  const L = lum(x, y);
  return L >= 118 && L <= 172;
}

// dark vertical divider centers (source x)
const dividerSrc = [
  469, 733, 997, 1261, 1525, 1789, 2054, 2319, 2584, 2850,
];
const pitch = dividerSrc[1] - dividerSrc[0];

function measureSlot(cx) {
  const outerL = Math.round(cx - pitch / 2);
  const outerR = Math.round(cx + pitch / 2);

  // scan at 42% height to avoid center divider line
  const y = Math.floor(height * 0.42);
  let innerL = outerL;
  let innerR = outerR;
  for (let x = outerL + 2; x < cx - 6; x++) {
    if (isSlotFill(x, y)) {
      innerL = x;
      break;
    }
  }
  for (let x = outerR - 2; x > cx + 6; x--) {
    if (isSlotFill(x, y)) {
      innerR = x;
      break;
    }
  }

  const xMid = Math.floor((innerL + innerR) / 2);
  let top = 0;
  let bottom = height - 1;
  for (let y = 0; y < height; y++) {
    if (isSlotFill(xMid, y)) {
      top = y;
      break;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    if (isSlotFill(xMid, y)) {
      bottom = y;
      break;
    }
  }

  const toDx = (v) => Math.round(v * csx);
  const toDy = (v) => Math.round(v * csy);
  return {
    outer: { left: toDx(outerL), w: toDx(outerR - outerL), top: toDy(top), h: toDy(bottom - top + 1) },
    inner: {
      left: toDx(innerL),
      w: toDx(innerR - innerL + 1),
      top: toDy(top),
      h: toDy(bottom - top + 1),
    },
    inset: {
      left: toDx(innerL - outerL),
      top: toDy(top - top),
      right: toDx(outerR - innerR),
      bottom: toDy(height - 1 - bottom),
    },
    src: { outerL, outerR, innerL, innerR, top, bottom },
  };
}

const slots = dividerSrc.map(measureSlot);
slots.forEach((s, i) => {
  console.log(i, 'outer', s.outer, 'inner', s.inner, 'inset', s.inset);
});

const s0 = slots[0];
const last = slots[slots.length - 1];

const avgInset = {
  left: Math.round(slots.reduce((a, s) => a + s.inset.left, 0) / slots.length),
  top: Math.round(slots.reduce((a, s) => a + s.inset.top, 0) / slots.length),
  right: Math.round(slots.reduce((a, s) => a + s.inset.right, 0) / slots.length),
  bottom: Math.round(slots.reduce((a, s) => a + s.inset.bottom, 0) / slots.length),
};

console.log('\n=== BattleConfig (copy) ===');
console.log(
  JSON.stringify(
    {
      HAND_SLOTS_LEFT: s0.outer.left,
      HAND_SLOTS_TOP: s0.outer.top,
      HAND_SLOT_W: s0.outer.w,
      HAND_SLOTS_HEIGHT: s0.outer.h,
      HAND_SLOTS_WIDTH: s0.outer.w * slots.length,
      HAND_SLOT_FACE_INSET: avgInset,
    },
    null,
    2,
  ),
);