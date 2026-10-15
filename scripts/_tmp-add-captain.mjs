import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/data/card.json';
const raw = readFileSync(p, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);
if (raw.includes('花生队长')) { console.log('· 已存在，跳过'); process.exit(0); }
const idx = lines.findIndex((l) => /"card_id":\s*19\s*,/.test(l));
if (idx < 0) { console.log('✗ 找不到 #19 模板'); process.exit(1); }
let start = idx; while (start >= 0 && !/^\s*\{\s*$/.test(lines[start])) start -= 1;
let end = idx; while (end < lines.length && !/^\s*\},?\s*$/.test(lines[end])) end += 1;
const block = lines.slice(start, end + 1);
const map = {
  '"card_id": 19': '"card_id": 127',
  '"card_name": "稻草人"': '"card_name": "花生队长"',
  '"res": 19': '"res": 127',
  '"card_atk": 0': '"card_atk": 0',
  '"card_hp": 23': '"card_hp": 40',
  '"cost_a": 7': '"cost_a": 9',
  '"card_cd": 25': '"card_cd": 28',
  '"desc": "为周围3x3格范围内的己方单位增加攻击4点,可叠加,上限为20"': '"desc": "集合火力：周围3x3格内的花生射手/花生神射手 攻击+1、攻击间隔缩短15%（同类不叠加，只加成花生单位）"',
};
const out = block.map((l) => {
  for (const [a, b] of Object.entries(map)) { if (l.includes(a)) return l.replace(a, b); }
  return l;
});
const newBlock = out.join(eol);
const eolAt = (i) => (i < lines.length - 1 ? eol : '');
const insertAt = end + 1;
lines.splice(insertAt, 0, ...(newBlock + ',').split(eol));
writeFileSync(p, lines.join(eol), 'utf8');
const parsed = JSON.parse(readFileSync(p, 'utf8'));
const list = Array.isArray(parsed) ? parsed : (parsed.cards ?? []);
const c = list.find((x) => Number(x.card_id) === 127);
console.log('✔ 已插入 #127:', JSON.stringify({ id: c.card_id, name: c.card_name, res: c.res, atk: c.card_atk, hp: c.card_hp, cost: c.cost_a, cd: c.card_cd, quality: c.card_quality, style: c.atk_style, view: c.card_view_type, type: c.card_type, show: c.show_card }));
console.log('  卡牌总数:', list.length, '| 文件行数:', readFileSync(p, 'utf8').split(/\r?\n/).length);
