/** 同步 resources/background → assets/battle/background(Vite publicDir) */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'resources/background');
const OUT = path.join(ROOT, 'assets/battle/background');

fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
for (const name of files) {
  fs.copyFileSync(path.join(SRC, name), path.join(OUT, name));
  console.log('sync', name);
}
console.log(`Background sync complete: ${files.length} files → assets/battle/background/`);