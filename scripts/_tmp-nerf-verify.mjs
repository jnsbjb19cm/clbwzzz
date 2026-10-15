const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');
import { readFileSync } from 'node:fs';
const list = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const cards = Array.isArray(list) ? list : list.cards;
const get = (id) => cards.find((c) => Number(c.card_id) === id);
// [id, 满星, 普通品质 期望攻/血, 完美品质 期望攻/血]
const CASES = [
  [1, 4, 8.4, 25.6, 10.8, 33.6],
  [2, 4, 0, 105.6, 0, 137.6],
  [17, 7, 9.72, 29, 12.12, 37],
  [18, 10, 18, 40, 22, 50],
  [27, 10, 39.6, 128, 48.4, 160],
  [54, 13, 17.28, 49.8, 20.88, 61.8],
  [35, 15, 42, 136, 50.4, 168],
  [107, 15, 28, 357, 33.6, 441],
  [55, 15, 50, 221, 60, 273],
];
let pass = 0; let fail = 0;
for (const [id, stars, nAtk, nHp, pAtk, pHp] of CASES) {
  const card = get(id);
  const normal = calculateCardStats({ ...card, id }, 2, stars);
  const perfect = calculateCardStats({ ...card, id }, 5, stars);
  const okN = Math.abs(normal.atk - nAtk) < 0.02 && Math.abs(normal.hp - nHp) < 0.05;
  const okP = Math.abs(perfect.atk - pAtk) < 0.02 && Math.abs(perfect.hp - pHp) < 0.05;
  if (okN && okP) pass += 1; else fail += 1;
  console.log(`  #${id} ${card.card_name}(${stars}星): 普通 ${normal.atk}/${normal.hp}${okN ? ' ✔' : ` ✗ 期望 ${nAtk}/${nHp}`} · 完美 ${perfect.atk}/${perfect.hp}${okP ? ' ✔' : ` ✗ 期望 ${pAtk}/${pHp}`}`);
}
console.log(`\n  结果: ${pass} 通过 / ${fail} 失败`);
