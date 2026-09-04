import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(__dirname, 'rebake-wide-unit-animations.mjs');
const generatedPath = path.join(__dirname, '.rebake-extra-wide.generated.mjs');
const OUT_DIR = path.join(ROOT, 'assets', 'sprites', 'unit_anim');
const FRAME_SIZES = [768, 1024, 1280, 1536];
const MIN_DEBUG_MARGIN = 40;

const source = fs.readFileSync(sourcePath, 'utf8');

function generatedSource(frameSize) {
  const patched = source.replace(
    /const WIDE_FRAME_SIZE = \d+;/,
    `const WIDE_FRAME_SIZE = ${frameSize};`,
  );
  if (patched === source) {
    throw new Error('未找到 WIDE_FRAME_SIZE 常量，无法生成 extra-wide 调试烘焙脚本');
  }
  return patched;
}

function runBake(frameSize, args) {
  fs.writeFileSync(generatedPath, generatedSource(frameSize), 'utf8');
  const result = spawnSync(process.execPath, [generatedPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`extra-wide bake ${frameSize}px 失败，exit=${result.status ?? 1}`);
  }
}

function minFrameMargin(meta) {
  let min = Infinity;
  let worst = null;
  for (const [animationName, animation] of Object.entries(meta.animations ?? {})) {
    for (let frameIndex = 0; frameIndex < (animation.frames ?? []).length; frameIndex += 1) {
      const bounds = animation.frames[frameIndex]?.bounds;
      if (!bounds) continue;
      const margins = {
        left: Number(bounds.left),
        top: Number(bounds.top),
        right: Number(meta.frameW) - 1 - Number(bounds.right),
        bottom: Number(meta.frameH) - 1 - Number(bounds.bottom),
      };
      for (const [side, margin] of Object.entries(margins)) {
        if (Number.isFinite(margin) && margin < min) {
          min = margin;
          worst = { animationName, frameIndex, side, margin };
        }
      }
    }
  }
  return { min, worst };
}

function readAudit(res) {
  const jsonPath = path.join(OUT_DIR, `${res}.json`);
  if (!fs.existsSync(jsonPath)) return null;
  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return { meta, ...minFrameMargin(meta) };
}

function requestedIds(args) {
  const numeric = args.filter((arg) => !String(arg).startsWith('--')).map(Number).filter(Number.isFinite);
  if (numeric.length) return numeric;
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return (manifest.baked ?? []).map(Number).filter(Number.isFinite);
}

try {
  const args = process.argv.slice(2);
  runBake(FRAME_SIZES[0], args);

  let ids = requestedIds(args);
  let unsafe = ids.filter((res) => {
    const audit = readAudit(res);
    return audit && audit.min < MIN_DEBUG_MARGIN;
  });

  for (const frameSize of FRAME_SIZES.slice(1)) {
    if (!unsafe.length) break;
    console.log(
      `  debug bake 自动扩容 ${frameSize}px: ${unsafe.join(', ')} `
      + `(目标安全边距 >= ${MIN_DEBUG_MARGIN}px)`,
    );
    runBake(frameSize, unsafe.map(String));
    unsafe = unsafe.filter((res) => {
      const audit = readAudit(res);
      return audit && audit.min < MIN_DEBUG_MARGIN;
    });
  }

  if (unsafe.length) {
    const details = unsafe.map((res) => {
      const audit = readAudit(res);
      const worst = audit?.worst;
      return `res=${res} ${audit?.meta?.frameW ?? '?'}px min=${audit?.min ?? '?'} `
        + `${worst?.animationName ?? '?'}[${worst?.frameIndex ?? '?'}].${worst?.side ?? '?'}`;
    });
    throw new Error(`调试画布扩到 ${FRAME_SIZES.at(-1)}px 后仍贴边:\n${details.join('\n')}`);
  }

  if (ids.length) {
    console.log(`  extra-wide 自适应边界检查通过: ${ids.length} 个 res`);
  }
} finally {
  try { fs.unlinkSync(generatedPath); } catch {}
}
