import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PARABOLA_RELEASE_FRAME_BY_RES,
  PARABOLA_RELEASE_SOURCE,
  getParabolaReleaseFrame,
} from '../src/battle/ParabolaReleaseCalibration.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/card.json'), 'utf8'));
const animDir = path.join(ROOT, 'assets/sprites/unit_anim');

const nameOf = (card) => String(card.card_name ?? card.name ?? '');
const idOf = (card) => Number(card.card_id ?? card.id);
const resOf = (card) => Number(card.res ?? card.spriteRes);
const styleOf = (card) => Number(card.atk_style ?? card.atkStyle);
const isParabola = (card) => styleOf(card) === 3 || idOf(card) === 72 || nameOf(card).includes('椰子');
const attackKeys = (meta) => Object.keys(meta.animations ?? {}).filter((key) => (
  key === 'attacking' || key.startsWith('attacking_') || key.startsWith('attack_')
));

const parabolaCards = cards.filter(isParabola);
const discovered = [...new Set(parabolaCards.map(resOf).filter(Number.isFinite))].sort((a, b) => a - b);
const missing = discovered.filter((res) => getParabolaReleaseFrame(res) == null);
if (missing.length) {
  throw new Error(`未标定的抛物线 res: ${missing.join(', ')}`);
}

const unused = Object.keys(PARABOLA_RELEASE_FRAME_BY_RES)
  .map(Number)
  .filter((res) => !discovered.includes(res));
if (unused.length) {
  throw new Error(`存在不再对应抛物线卡牌的出手标定 res: ${unused.join(', ')}`);
}

for (const res of discovered) {
  const desired = getParabolaReleaseFrame(res);
  const jsonPath = path.join(animDir, `${res}.json`);
  if (!fs.existsSync(jsonPath)) throw new Error(`缺少抛物线动画元数据 res=${res}`);
  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const keys = attackKeys(meta);
  if (!keys.length) throw new Error(`res=${res} 没有攻击动画`);
  let changed = false;
  for (const key of keys) {
    const anim = meta.animations[key];
    if (!anim?.frames?.length) continue;
    const value = Math.min(anim.frames.length - 1, desired);
    if (anim.releaseFrame !== value) { anim.releaseFrame = value; changed = true; }
    if (anim.releaseSource !== PARABOLA_RELEASE_SOURCE) {
      anim.releaseSource = PARABOLA_RELEASE_SOURCE;
      changed = true;
    }
  }
  if (meta.parabolaReleaseFrame !== desired) { meta.parabolaReleaseFrame = desired; changed = true; }
  if (changed) fs.writeFileSync(jsonPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`parabola res=${res}: release frame ${desired}${changed ? ' updated' : ''}`);
}
