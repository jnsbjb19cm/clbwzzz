import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_XML = path.join(ROOT, 'assets/assets/dataXML');
const LANG_XML = path.join(ROOT, 'assets/assets/language');
const ATLAS_XML = path.join(ROOT, 'assets/assets/atlasXML');
const OUT_DIR = path.join(ROOT, 'src/data');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  trimValues: true,
});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeNumbers(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function extractRecords(parsed, tagNames) {
  for (const tag of tagNames) {
    const node = parsed.Data?.[tag] ?? parsed.data?.[tag] ?? parsed[tag];
    if (node) return toArray(node).map(normalizeNumbers);
  }
  const root = parsed.Data ?? parsed.data ?? parsed;
  for (const [key, value] of Object.entries(root)) {
    if (key === '?xml' || key === 'language' || key === 'TextureAtlas') continue;
    if (typeof value === 'object') return toArray(value).map(normalizeNumbers);
  }
  return [];
}

function convertDataXml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parsed = parser.parse(xml);
  const baseName = path.basename(filePath, '.xml');
  const records = extractRecords(parsed, [baseName, 'card', 'stage', 'item']);
  return { name: baseName, records };
}

function convertLanguage(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parsed = parser.parse(xml);
  const entries = toArray(parsed.language?.language ?? []);
  const dict = {};
  for (const entry of entries) {
    if (entry.key) dict[entry.key] = entry.value ?? '';
  }
  return { name: path.basename(filePath, '.xml'), entries: dict };
}

function convertAtlas(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parsed = parser.parse(xml);
  const atlas = parsed.TextureAtlas;
  if (!atlas) return null;
  const sprites = toArray(atlas.SubTexture).map((s) => normalizeNumbers(s));
  const rel = path.relative(ATLAS_XML, filePath).replace(/\\/g, '/');
  return {
    image: atlas.imagePath,
    path: rel,
    sprites,
  };
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function walkXml(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkXml(full));
    else if (entry.name.endsWith('.xml')) results.push(full);
  }
  return results;
}

function main() {
  ensureDir(OUT_DIR);
  ensureDir(path.join(OUT_DIR, 'language'));
  ensureDir(path.join(OUT_DIR, 'atlas'));

  const gameData = {};
  for (const file of fs.readdirSync(DATA_XML)) {
    if (!file.endsWith('.xml')) continue;
    const { name, records } = convertDataXml(path.join(DATA_XML, file));
    gameData[name] = records;
    // card.json 已改为手工维护的唯一数据源(battle-values.txt 数值 + cd 砍半)，
    // 不得被原始 card.xml 重新生成覆盖。
    if (name === 'card') {
      console.log(`  dataXML/${file} -> ${records.length} records (skip: card.json 手工维护)`);
      continue;
    }
    writeJson(path.join(OUT_DIR, `${name}.json`), records);
    console.log(`  dataXML/${file} -> ${records.length} records`);
  }

  const languages = {};
  for (const file of fs.readdirSync(LANG_XML)) {
    if (!file.endsWith('.xml')) continue;
    const lang = convertLanguage(path.join(LANG_XML, file));
    languages[lang.name] = lang.entries;
    writeJson(path.join(OUT_DIR, 'language', `${lang.name}.json`), lang.entries);
  }
  console.log(`  language/ -> ${Object.keys(languages).length} files`);

  const atlases = {};
  for (const file of walkXml(ATLAS_XML)) {
    const atlas = convertAtlas(file);
    if (!atlas) continue;
    const key = atlas.path.replace('.xml', '');
    atlases[key] = atlas;
    writeJson(path.join(OUT_DIR, 'atlas', `${key.replace(/\//g, '_')}.json`), atlas);
  }
  console.log(`  atlasXML/ -> ${Object.keys(atlases).length} atlases`);

  writeJson(path.join(OUT_DIR, 'index.json'), {
    version: '1.1.1',
    generatedAt: new Date().toISOString(),
    tables: Object.keys(gameData),
    cardCount: gameData.card?.length ?? 0,
    stageCount: gameData.stageInfo?.length ?? 0,
  });

  console.log('\nData build complete -> src/data/');
}

main();