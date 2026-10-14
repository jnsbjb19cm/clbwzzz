// 只改 card.json 里 70/82 两行的 atk_style（逐行定位，保留原有格式与换行符）
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] ?? 'src/data/card.json';
const text = readFileSync(path, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text.split(/\r?\n/);

let current = null;
let changed = 0;
for (let i = 0; i < lines.length; i += 1) {
  const idMatch = lines[i].match(/"card_id"\s*:\s*(\d+)/);
  if (idMatch) current = Number(idMatch[1]);
  if (current !== null && (current === 70 || current === 82)
      && /"atk_style"\s*:\s*\d+/.test(lines[i])) {
    const before = lines[i].trim();
    lines[i] = lines[i].replace(/"atk_style"\s*:\s*\d+/, '"atk_style": 5');
    console.log(`  ✔ #${current}  ${before}  →  ${lines[i].trim()}`);
    changed += 1;
    if (changed >= 2) break;
  }
}

writeFileSync(path, lines.join(eol));
console.log(`改动行数: ${changed} | 换行符: ${JSON.stringify(eol)} | 文件行数: ${lines.length}`);
