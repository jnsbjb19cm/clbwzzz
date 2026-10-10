import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Extract real EBLC/EBDT strike pixels; never rasterize the outline tables.
// Format definitions: Microsoft OpenType EBLC index 1/3, EBDT image 7, cmap 4.
const sourcePath = process.argv[2] || 'C:/Windows/Fonts/simsun.ttc';
const bytes = fs.readFileSync(sourcePath);
const face = bytes.toString('ascii', 0, 4) === 'ttcf' ? bytes.readUInt32BE(12) : 0;
const tables = {};
for (let i = 0; i < bytes.readUInt16BE(face + 4); i++) {
  const p = face + 12 + i * 16;
  tables[bytes.toString('ascii', p, p + 4)] = bytes.readUInt32BE(p + 8);
}
if (!tables.EBLC || !tables.EBDT) throw new Error('This font has no embedded bitmap tables');
const embedFlags = bytes.readUInt16BE(tables['OS/2'] + 8);
if (embedFlags & 2 || embedFlags & 0x100) throw new Error('Font restricts embedding or subsetting');
let cmap;
for (let i = 0; i < bytes.readUInt16BE(tables.cmap + 2); i++) {
  const p = tables.cmap + 4 + i * 8;
  const offset = tables.cmap + bytes.readUInt32BE(p + 4);
  if (bytes.readUInt16BE(offset) === 4) cmap = offset;
}
if (!cmap) throw new Error('Unicode cmap 4 missing');
function glyphId(cp) {
  const n = bytes.readUInt16BE(cmap + 6) / 2;
  const end = cmap + 14, start = end + n * 2 + 2, delta = start + n * 2, range = delta + n * 2;
  for (let i = 0; i < n; i++) {
    if (cp > bytes.readUInt16BE(end + i * 2)) continue;
    if (cp < bytes.readUInt16BE(start + i * 2)) return 0;
    const d = bytes.readInt16BE(delta + i * 2), r = bytes.readUInt16BE(range + i * 2);
    if (!r) return (cp + d) & 65535;
    const id = bytes.readUInt16BE(range + i * 2 + r + 2 * (cp - bytes.readUInt16BE(start + i * 2)));
    return id ? (id + d) & 65535 : 0;
  }
  return 0;
}
let strike;
for (let i = 0; i < bytes.readUInt32BE(tables.EBLC + 4); i++) {
  const p = tables.EBLC + 8 + 48 * i;
  if (bytes[p + 44] === 16 && bytes[p + 45] === 16 && bytes[p + 46] === 1) strike = p;
}
if (!strike) throw new Error('16px monochrome strike missing');
function bitmap(cp) {
  const id = glyphId(cp), array = tables.EBLC + bytes.readUInt32BE(strike);
  for (let i = 0; i < bytes.readUInt32BE(strike + 8); i++) {
    const p = array + i * 8, first = bytes.readUInt16BE(p), last = bytes.readUInt16BE(p + 2);
    if (id < first || id > last) continue;
    const sub = array + bytes.readUInt32BE(p + 4);
    const indexFormat = bytes.readUInt16BE(sub), imageFormat = bytes.readUInt16BE(sub + 2);
    if (![1, 3].includes(indexFormat) || imageFormat !== 7) throw new Error('Unsupported bitmap format');
    const size = indexFormat === 1 ? 4 : 2;
    const read = p => size === 4 ? bytes.readUInt32BE(p) : bytes.readUInt16BE(p);
    const offset = read(sub + 8 + (id - first) * size), next = read(sub + 8 + (id - first + 1) * size);
    if (next === offset) return null;
    const data = tables.EBDT + bytes.readUInt32BE(sub + 4) + offset;
    return { height:bytes[data], width:bytes[data+1], bx:bytes.readInt8(data+2), by:bytes.readInt8(data+3),
      advance:bytes[data+4], pixels:bytes.subarray(data+8, data+next-offset) };
  }
  return null;
}
const charset = new Set(Array.from('劣质普通精良优秀完美的级卡攻击生命冷却时间秒特技描述暂无永久有效至绑定体验星[]:.,!?0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'));
for (const file of ['card.json', 'cardLore.json']) {
  for (const ch of fs.readFileSync(new URL(`../src/data/${file}`, import.meta.url), 'utf8')) if (ch >= ' ') charset.add(ch);
}
const entries = [], missing = [];
for (const ch of [...charset].sort()) {
  const cp = ch.codePointAt(0);
  let glyph = bitmap(cp), source = cp;
  // SimSun has no embedded ASCII strike. Reuse its native fullwidth glyph pixels,
  // with halfwidth spacing only (no outline rendering and no resampling).
  if (!glyph && cp >= 33 && cp <= 126) { source = cp + 0xfee0; glyph = bitmap(source); }
  if (!glyph) { if (ch !== ' ') missing.push(ch); continue; }
  entries.push({ cp, source, glyph });
}
const cell = 20, columns = 32, width = columns * cell, height = Math.ceil(entries.length / columns) * cell;
const rgba = Buffer.alloc(width * height * 4), glyphs = {};
entries.forEach(({ cp, source, glyph:g }, i) => {
  const x = i % columns * cell, y = Math.floor(i / columns) * cell;
  if (g.width > cell || g.height > cell) throw new Error('Glyph exceeds atlas cell');
  for (let row = 0; row < g.height; row++) for (let col = 0; col < g.width; col++) {
    const bit = row * g.width + col;
    if (!(g.pixels[bit >> 3] & (0x80 >> (bit & 7)))) continue;
    const p = ((y + row) * width + x + col) * 4; rgba.fill(255, p, p + 4);
  }
  glyphs[cp] = [x, y, g.width, g.height, source === cp ? g.bx : 0, g.by, source === cp ? g.advance : Math.max(8, g.width), source];
});
const output = new URL('../assets/fonts/', import.meta.url);
fs.mkdirSync(output, { recursive:true });
await sharp(rgba, {raw:{width,height,channels:4}}).png().toFile(fileURLToPath(new URL('simsun-16.png', output)));
fs.writeFileSync(new URL('simsun-16.json', output), JSON.stringify({ source:'SimSun EBLC/EBDT', sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'), embedFlags, ppem:16, baseline:14, lineHeight:20, glyphs, missing }));
console.log(JSON.stringify({glyphs:entries.length,width,height,missing,source:'EBLC/EBDT 16px 1bit'},null,2));
