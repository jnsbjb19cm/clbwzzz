/** 从 battle.png 裁切战斗 UI 部件(顶栏槽、血池槽、资源图标) */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ATLAS_JSON = path.join(ROOT, 'src/data/atlas/preload_battle.json');
const SRC = path.join(ROOT, 'assets/atlas/battle.png');
const OUT_PARTS = path.join(ROOT, 'assets/sprites/parts');
const OUT_JUNGLE = path.join(ROOT, 'assets/battle/jungle');

const atlas = JSON.parse(fs.readFileSync(ATLAS_JSON, 'utf8'));
const NAMES = [
  'HeroHP_big_bg',
  'HeroHP_left_bg',
  'HeroHP_right_bg',
  'battle_card_bg',
  'battle_card_mask',
];

fs.mkdirSync(OUT_PARTS, { recursive: true });
fs.mkdirSync(OUT_JUNGLE, { recursive: true });

const spriteMap = new Map(atlas.sprites.map((s) => [s.name, s]));

for (const name of NAMES) {
  const sp = spriteMap.get(name);
  if (!sp) {
    console.warn('skip missing sprite', name);
    continue;
  }
  const outName = `${name}.png`;
  const outPath = path.join(OUT_PARTS, outName);
  await sharp(SRC)
    .extract({ left: sp.x, top: sp.y, width: sp.width, height: sp.height })
    .png()
    .toFile(outPath);
  console.log('wrote', outPath);
}

/** 数字贴图 battle_hero_hp_0~9 */
for (let d = 0; d <= 9; d++) {
  const sp = spriteMap.get(`battle_hero_hp_${d}`);
  if (!sp) continue;
  await sharp(SRC)
    .extract({ left: sp.x, top: sp.y, width: sp.width, height: sp.height })
    .png()
    .toFile(path.join(OUT_PARTS, `battle_hero_hp_${d}.png`));
}

/** 阳光/食物：优先 battle.png，回退 cardslot */
const CARDSLOT = path.join(ROOT, 'assets/battle/jungle/cardslot.jpg');
const RES_CROPS = [
  { name: 'res_sun.png', left: 72, top: 28, width: 118, height: 118 },
  { name: 'res_food.png', left: 72, top: 168, width: 118, height: 118 },
];
if (fs.existsSync(CARDSLOT)) {
  for (const crop of RES_CROPS) {
    await sharp(CARDSLOT)
      .extract(crop)
      .resize(68, 68, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(OUT_JUNGLE, crop.name));
    console.log('wrote', path.join(OUT_JUNGLE, crop.name));
  }
}

console.log('Battle UI parts extract complete');