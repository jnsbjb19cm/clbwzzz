/**
 * 2026-10-10：把 assets/sprites 下的动画/立绘资源清点成一份清单，供运行时预加载使用。
 *
 * 为什么要清单：浏览器不能列目录，所以「预加载所有资源」必须先有一份 URL 列表。
 * 这里在构建期/手动跑一次生成 src/data/assetManifest20261010.json（分组 + 字节数），
 * 运行时按分组预加载（登录界面预热轻量组，进房间的加载界面处理动画重资源）。
 *
 * 用法：node scripts/build-asset-manifest-20261010.mjs
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spritesDir = join(here, '..', 'assets', 'sprites');
const outFile = join(here, '..', 'src', 'data', 'assetManifest20261010.json');

/** 目录 → 分组名（URL 前缀都是 /sprites/<dir>/）。 */
const GROUPS = {
  parts: 'parts',
  units: 'units',
  bullets: 'bullets',
  cards: 'cards',
  skill_anim: 'skillAnim',
  unit_anim: 'unitAnim',
};

const manifest = { generatedAt: new Date().toISOString(), groups: {}, bytes: {}, counts: {} };

for (const [dir, group] of Object.entries(GROUPS)) {
  const abs = join(spritesDir, dir);
  let names = [];
  try { names = readdirSync(abs); } catch { continue; }
  const urls = [];
  let bytes = 0;
  for (const name of names) {
    const file = join(abs, name);
    let size = 0;
    try { size = statSync(file).size; } catch { continue; }
    // 只预加载图片（json 是元数据，很小且需要配套图片，图片就位即可）
    if (!/\.(png|webp|jpg|jpeg)$/i.test(name)) continue;
    urls.push(`/sprites/${dir}/${name}`);
    bytes += size;
  }
  urls.sort();
  manifest.groups[group] = urls;
  manifest.bytes[group] = bytes;
  manifest.counts[group] = urls.length;
}

const totalBytes = Object.values(manifest.bytes).reduce((sum, n) => sum + n, 0);
manifest.totalBytes = totalBytes;

writeFileSync(outFile, `${JSON.stringify(manifest)}\n`);
const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;
console.log('已生成', outFile);
for (const [group, count] of Object.entries(manifest.counts)) {
  console.log(`  ${group.padEnd(10)} ${String(count).padStart(4)} 个  ${mb(manifest.bytes[group])}`);
}
console.log(`  合计 ${mb(totalBytes)}`);
