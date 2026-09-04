import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, 'bake-soldier-animations.mjs');
const generatedPath = path.join(__dirname, '.bake-wide-bullet-effects.generated.mjs');
const BULLET_FRAME_SIZE = 320;
const EXTRA_WIDE_BULLET_FRAME_SIZE = 512;
const EXTRA_WIDE_BULLET_RES = new Set([54]);

const source = fs.readFileSync(sourcePath, 'utf8');
const patched = source.replace(
  'const canvasSize = 160;',
  `const canvasSize = EXTRA_WIDE_BULLET_RES.has(Number(num))\n      ? ${EXTRA_WIDE_BULLET_FRAME_SIZE}\n      : ${BULLET_FRAME_SIZE};`,
).replace(
  "import fs from 'fs';",
  "import fs from 'fs';\nconst EXTRA_WIDE_BULLET_RES = new Set([54]);",
);
if (patched === source) {
  throw new Error('未找到 bullet canvasSize=160，无法生成宽弹道特效烘焙脚本');
}

fs.writeFileSync(generatedPath, patched, 'utf8');
try {
  // --vertigo-only 会跳过所有单位重烘焙，只刷新全局状态特效与 Bullet*。
  const result = spawnSync(process.execPath, [generatedPath, '--vertigo-only'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  try { fs.unlinkSync(generatedPath); } catch {}
}
