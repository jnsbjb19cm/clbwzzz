/**
 * 将 battle-ui-preview 与参考截图顶栏+全场景区域做像素 diff
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts');
const PREVIEW = path.join(OUT_DIR, 'battle-ui-preview.png');

const REF_CANDIDATES = [
  path.join('C:', 'Users', '佰震', 'Pictures', 'Screenshots', '屏幕截图 2026-06-26 105658.png'),
  path.join(ROOT, 'resources', 'background', '参考图.png'),
];

const THRESHOLD = 0.15;

function findRef() {
  for (const p of REF_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const refPath = findRef();
if (!refPath) {
  console.warn('skip diff: reference image not found');
  process.exit(0);
}

if (!fs.existsSync(PREVIEW)) {
  console.error('missing preview:', PREVIEW);
  process.exit(1);
}

const TARGET_W = 1248;
const TARGET_H = 832;

async function loadRaw(p) {
  return sharp(p)
    .resize(TARGET_W, TARGET_H, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

const [a, b] = await Promise.all([loadRaw(PREVIEW), loadRaw(refPath)]);
const len = Math.min(a.data.length, b.data.length);
let diff = 0;
const total = a.info.width * a.info.height;
for (let i = 0; i < len; i += 4) {
  const dr = Math.abs(a.data[i] - b.data[i]);
  const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
  const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
  if (dr + dg + db > 60) diff++;
}

const ratio = diff / total;
const report = {
  preview: PREVIEW,
  reference: refPath,
  size: { w: TARGET_W, h: TARGET_H },
  diffPixels: diff,
  totalPixels: total,
  diffRatio: Math.round(ratio * 1000) / 1000,
  threshold: THRESHOLD,
  pass: ratio <= THRESHOLD,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'diff-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  console.error(`FAIL: diff ratio ${report.diffRatio} > ${THRESHOLD}`);
  process.exit(1);
}
console.log('PASS: visual diff within threshold');