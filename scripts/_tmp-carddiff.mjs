import { execSync } from 'node:child_process';
const cards = JSON.parse((await import('node:fs')).readFileSync('src/data/card.json', 'utf8'));
const list = Array.isArray(cards) ? cards : (cards.cards ?? []);
const byId = new Map(list.map((c) => [Number(c.card_id), c]));
for (const commit of ['32979b1', '957b149', '99587d9']) {
  const diff = execSync(`git show ${commit} -- src/data/card.json`, { encoding: 'utf8', maxBuffer: 1e8 });
  const lines = diff.split('\n');
  let curId = null; const changes = new Map();
  for (const ln of lines) {
    const idm = ln.match(/"card_id":\s*(\d+)/);
    if (idm) curId = Number(idm[1]);
    const m = ln.match(/^([-+])\s+"(card_atk|card_hp|move_speed|atk_style|cost_a|atk_speed|desc)":\s*(.+?),?$/);
    if (m && curId) {
      if (!changes.has(curId)) changes.set(curId, []);
      changes.get(curId).push(`${m[1] === '-' ? '旧' : '新'} ${m[2]}=${m[3].replace(/^"|"$/g, '')}`);
    }
  }
  console.log(`\n▸ ${commit}`);
  for (const [id, ch] of changes) {
    const card = byId.get(id);
    // 只保留成对变化（旧+新），避免重复
    const merged = [];
    for (let i = 0; i < ch.length; i += 2) merged.push(`${ch[i]}  →  ${(ch[i + 1] || '').replace(/^新 /, '')}`);
    console.log(`  #${id} ${card ? card.card_name : '(未知)'}: ${merged.join(' | ')}`);
  }
}
