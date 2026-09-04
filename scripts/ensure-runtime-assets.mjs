import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  } catch {
    return null;
  }
}

function unitPackIsCurrent(res) {
  const meta = readJson(`assets/sprites/unit_anim/${res}.json`);
  return Boolean(
    meta
      && Number(meta.frameW) >= 256
      && meta.compactedFrom
      && String(meta.sheetLayout?.mode || '').includes('deduplicated'),
  );
}

function bulletPackIsCurrent(res) {
  const meta = readJson(`assets/sprites/bullets/anim/${res}.json`);
  if (!meta) return false;
  const impact = meta.animations?.baoza;
  if (!impact?.frames?.length) return true;
  // wide bullet bake 的默认画布是 320；特殊超大包会更大。
  return Number(meta.frameW) >= 320 && Number(meta.frameH) >= 320;
}

const stale = [];
for (const res of [23, 58]) {
  if (!unitPackIsCurrent(res)) stale.push(`unit:${res}`);
}
for (const res of [18, 54, 58]) {
  if (!bulletPackIsCurrent(res)) stale.push(`bullet:${res}`);
}

if (!stale.length) {
  console.log('[assets] runtime animation assets are current; skip bake');
  process.exit(0);
}

console.log(`[assets] stale runtime animation assets detected: ${stale.join(', ')}`);
console.log('[assets] running one-time dev:prepare; later dev:all starts will skip this step');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'dev:prepare'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
