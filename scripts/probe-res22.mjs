import fs from 'fs';
import path from 'path';

const soldierAtlas = JSON.parse(
  fs.readFileSync('src/data/atlas/dyload_soldier.json', 'utf8'),
);
const res = 22;
const prefix = `soldier${res}-`;
const parts = soldierAtlas.sprites.filter((s) => String(s.name).startsWith(prefix));
console.log('parts', parts.map((p) => ({ name: p.name, w: p.width, h: p.height })));

function soldierPartsQuality(sprites, r) {
  const pfx = `soldier${r}-`;
  const pts = sprites.filter((s) => String(s.name).startsWith(pfx));
  if (!pts.length) return 'none';
  const hasMain = pts.some((s) => /元件 1/.test(s.name) && s.width >= 48 && s.height >= 48);
  if (hasMain) return 'good';
  const maxH = Math.max(...pts.map((s) => s.height));
  const maxW = Math.max(...pts.map((s) => s.width));
  if (maxH >= 80 && maxW >= 50) return 'good';
  return 'fragment';
}

console.log('quality', soldierPartsQuality(soldierAtlas.sprites, res));