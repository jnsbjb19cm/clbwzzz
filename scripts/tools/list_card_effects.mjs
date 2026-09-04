import fs from 'fs';
import path from 'path';
const p = path.resolve('src/data/card.json');
const raw = fs.readFileSync(p, 'utf8');
const cards = JSON.parse(raw);
const filtered = cards.filter(c => (c.special_atk_effect && c.special_atk_effect !== 0) || (c.effectSelf != null && c.effectSelf !== -1) || (c.effectScope != null && c.effectScope !== -1));
console.log('CARD_ID,NAME,special_atk_effect,effectSelf,effectScope');
for (const c of filtered) {
  console.log([c.card_id, JSON.stringify(c.card_name), c.special_atk_effect, c.effectSelf, c.effectScope].join(','));
}
console.log('\nTOTAL', filtered.length);
