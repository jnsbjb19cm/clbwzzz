import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const baselineDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const outDir = path.join(root, 'assets/sprites/unit_anim');

async function metrics(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let darkOpaque = 0;
  let transparent = 0;
  for (let p = 0; p < info.width * info.height; p += 1) {
    const i = p * 4;
    const a = data[i + 3];
    if (a >= 32) {
      opaque += 1;
      if (data[i] <= 32 && data[i + 1] <= 32 && data[i + 2] <= 32) darkOpaque += 1;
    } else {
      transparent += 1;
    }
  }
  return { width: info.width, height: info.height, opaque, darkOpaque, transparent };
}

for (const res of [31, 57]) {
  const png = path.join(outDir, `${res}.png`);
  const json = path.join(outDir, `${res}.json`);
  assert.ok(fs.existsSync(png), `missing baked ${res}.png`);
  assert.ok(fs.existsSync(json), `missing baked ${res}.json`);

  const meta = JSON.parse(fs.readFileSync(json, 'utf8'));
  assert.equal(Number(meta.res), res, `wrong metadata res for ${res}`);
  const frameCount = Object.values(meta.animations ?? {})
    .reduce((sum, anim) => sum + (Array.isArray(anim?.frames) ? anim.frames.length : 0), 0);
  assert.ok(frameCount > 0, `${res} has no baked frames`);

  const after = await metrics(png);
  assert.ok(after.opaque > 0, `${res} output is fully transparent`);
  assert.ok(after.transparent > 0, `${res} output lost alpha/transparency`);
  assert.ok(after.darkOpaque > 0, `${res} contains no preserved dark details`);

  if (baselineDir) {
    const beforeFile = path.join(baselineDir, `${res}.png`);
    assert.ok(fs.existsSync(beforeFile), `missing baseline ${res}.png`);
    const before = await metrics(beforeFile);
    console.log(`res=${res} darkOpaque before=${before.darkOpaque} after=${after.darkOpaque} opaque before=${before.opaque} after=${after.opaque}`);
    assert.ok(
      after.darkOpaque > before.darkOpaque,
      `${res} dark detail count did not improve (${before.darkOpaque} -> ${after.darkOpaque})`,
    );
  } else {
    console.log(`res=${res} darkOpaque=${after.darkOpaque} opaque=${after.opaque} transparent=${after.transparent}`);
  }
}

console.log('reaper/big-ear bake regression: PASS');
