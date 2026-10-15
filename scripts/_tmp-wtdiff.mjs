import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const cards = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const list = Array.isArray(cards) ? cards : (cards.cards ?? []);
const byId = new Map(list.map((c) => [Number(c.card_id), c]));
const diff = execSync('git diff -- src/data/card.json', { encoding: 'utf8', maxBuffer: 1e8 });
let curId = null; const changes = new Map();
for (const ln of diff.split('\n')) {
  const idm = ln.match(/"card_id":\s*(\d+)/);
  if (idm) curId = Number(idm[1]);
  const m = ln.match(/^([-+])\s+"(card_atk|card_hp|move_speed|atk_style|cost_a|atk_speed|card_cd|desc|card_quality)":\s*(.+?),?$/);
  if (m && curId) { if (!changes.has(curId)) changes.set(curId, []); changes.get(curId).push(`${m[1]}${m[2]}=${m[3].replace(/^"|"$/g, '')}`); }
}
for (const [id, ch] of changes) {
  const name = byId.get(id)?.card_name ?? '(未知)';
  const pairs = [];
  for (let i = 0; i < ch.length; i += 2) pairs.push(`${ch[i].slice(1)}  →  ${(ch[i + 1] || '').slice(1)}`);
  console.log(`  #${id} ${name}: ${pairs.join('  |  ')}`);
}
