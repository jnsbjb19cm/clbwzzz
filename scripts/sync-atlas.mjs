import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PNG_SRC = path.join(ROOT, 'resources/img');
const OUT = path.join(ROOT, 'assets/atlas');

function main() {
  if (!fs.existsSync(PNG_SRC)) {
    console.error('resources/img/ 目录不存在，请放入 PNG 图集');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    if (/\.(jpg|jpeg)$/i.test(f)) fs.unlinkSync(path.join(OUT, f));
  }
  const files = fs.readdirSync(PNG_SRC).filter((f) => /\.png$/i.test(f));
  for (const f of files) {
    fs.copyFileSync(path.join(PNG_SRC, f), path.join(OUT, f));
  }
  console.log(`  resources/img/ -> assets/atlas/ (${files.length} 张 PNG 图集)`);
}

main();