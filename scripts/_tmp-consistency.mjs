import { readFileSync } from 'node:fs';
const { calcCardStats } = await import('../src/core/constants.js');
const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');
const list = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const cards = Array.isArray(list) ? list : list.cards;
let bad = 0;
for (const id of [1, 2, 18, 27, 54, 55, 107]) {
  const card = cards.find((c) => Number(c.card_id) === id);
  for (const q of [4, 7, 10, 13, 15]) {
    for (const p of [2, 5]) {
      const a = calcCardStats({ ...card, id }, p, q);
      const b = calculateCardStats({ ...card, id }, p, q);
      if (Math.abs(a.atk - b.atk) > 0.01 || Math.abs(a.hp - b.hp) > 0.01) { bad += 1; console.log(`  ✗ #${id} ${q}星 品质${p}: 旧 ${a.atk}/${a.hp} vs 新 ${b.atk}/${b.hp}`); }
    }
  }
}
console.log(bad === 0 ? '  ✔ 旧的 calcCardStats 与 calculateCardStats 完全一致（全部样本）' : `  ✗ 有 ${bad} 处不一致`);
