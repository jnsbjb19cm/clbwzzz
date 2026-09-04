/** 渲染单帧到 PNG，用于自查槽位叠层 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { parseArmature, renderFrame, toArray } from './lib/dragonbones-bake.mjs';
import { chromaKeyRgbaBuffer } from './lib/chroma-key.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'scripts/_debug_frames');
fs.mkdirSync(OUT, { recursive: true });

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '',
  parseAttributeValue: false, trimValues: true,
});

const skeleton = parser.parse(
  fs.readFileSync(path.join(ROOT, 'assets/assets/dySkeletonXML/soldier_skeleton.xml'), 'utf8'),
);
const armByName = new Map(toArray(skeleton.dragonBones?.armature).map((a) => [a.name, a]));
const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/atlas/dyload_soldier.json'), 'utf8'));

function imagePath(base) {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const p = path.join(ROOT, 'assets/atlas', `${base}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function cropSprite(atlasPath, sprite) {
  if (!sprite?.width || !sprite?.height) return null;
  const fw = sprite.frameWidth ?? sprite.width;
  const fh = sprite.frameHeight ?? sprite.height;
  const crop = await sharp(atlasPath)
    .extract({ left: sprite.x, top: sprite.y, width: sprite.width, height: sprite.height })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  chromaKeyRgbaBuffer(crop.data, crop.info.width, crop.info.height, { threshold: 22 });
  const canvas = createCanvas(fw, fh);
  const ctx = canvas.getContext('2d');
  const tmp = createCanvas(crop.info.width, crop.info.height);
  const tctx = tmp.getContext('2d');
  const imgData = tctx.createImageData(crop.info.width, crop.info.height);
  imgData.data.set(crop.data);
  tctx.putImageData(imgData, 0, 0);
  const fx = sprite.frameX ?? 0;
  const fy = sprite.frameY ?? 0;
  ctx.drawImage(tmp, fx < 0 ? -fx : fx, fy < 0 ? -fy : fy);
  return loadImage(canvas.toBuffer('image/png'));
}

async function renderRes(res, anim, fi) {
  const arm = parseArmature(armByName.get(`MC${res}`), `MC${res}`);
  const names = new Set();
  const collect = (a) => {
    for (const slot of a.slots) {
      for (const d of slot.displays) {
        if (!d.name || d.name === '影子') continue;
        if (d.type === 'armature' && armByName.has(d.name)) {
          collect(parseArmature(armByName.get(d.name), d.name));
        } else names.add(d.name);
      }
    }
  };
  collect(arm);
  const atlasPath = imagePath('soldier');
  const spriteMap = new Map();
  for (const name of names) {
    const sp = atlas.sprites.find((s) => s.name === name);
    if (sp) {
      const img = await cropSprite(atlasPath, sp);
      if (img) spriteMap.set(name, img);
    }
  }
  const size = 220;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size * 0.84);
  renderFrame(ctx, arm, anim, fi, spriteMap, {
    armByName, armName: `MC${res}`, skipShadow: true, skipBullet: true,
  });
  ctx.restore();
  const out = path.join(OUT, `MC${res}_${anim}_f${fi}.png`);
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('wrote', out);
}

const FRAMES = [
  [1, 'default'], [4, 'default'], [18, 'default'], [17, 'default'], [54, 'default'],
  [25, 'default'], [2, 'default_100'], [21, 'default_100'],
  [20, 'default', 0],
  [20, 'attacking', 0],
  [20, 'attacking', 4],
  [20, 'attacking', 8],
  [20, 'attacking', 9],
  [20, 'attacking', 12],
  [58, 'default', 0],
  [58, 'default', 4],
  [58, 'attacking', 0],
  [58, 'attacking', 6],
  [58, 'attacking', 12],
];
for (const [res, anim, frame = 0] of FRAMES) {
  await renderRes(res, anim, frame);
}
