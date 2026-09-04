import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from '@napi-rs/canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const cards = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/card.json'), 'utf8'),
);
const OUT = path.join(ROOT, 'assets/sprites/cards');

const QUALITY_COLORS = {
  1: ['#6b7280', '#374151'],
  2: ['#22c55e', '#166534'],
  3: ['#3b82f6', '#1e40af'],
  4: ['#a855f7', '#6b21a8'],
  5: ['#f59e0b', '#b45309'],
  6: ['#ef4444', '#991b1b'],
  999: ['#64748b', '#334155'],
};

const TYPE_ICONS = { 1: '⚔', 2: '🛡', 3: '💥', 4: '✦' };

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function drawCardSprite(card, size = 128) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const [c1, c2] = QUALITY_COLORS[card.card_quality] ?? QUALITY_COLORS[1];

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${size * 0.34}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(TYPE_ICONS[card.card_type] ?? '●', size / 2, size * 0.38);

  const name = card.card_name.slice(0, 4);
  ctx.font = `bold ${size * 0.16}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(name, size / 2, size * 0.62);

  ctx.font = `${size * 0.11}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`#${card.card_id}`, size / 2, size * 0.8);

  return await canvas.encode('png');
}

async function main() {
  ensureDir(OUT);
  const seen = new Set();
  let count = 0;

  for (const card of cards) {
    const key = String(card.res);
    if (seen.has(key)) continue;
    seen.add(key);
    const png = await drawCardSprite(card);
    fs.writeFileSync(path.join(OUT, `${key}.png`), png);
    count++;
  }

  const manifest = [...seen].sort((a, b) => Number(a) - Number(b));
  fs.writeFileSync(
    path.join(ROOT, 'assets/sprites/manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), sprites: manifest }, null, 2),
  );
  console.log(`Generated ${count} card sprites -> assets/sprites/cards/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});