import { readFileSync } from 'node:fs';
const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');
const list = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const cards = Array.isArray(list) ? list : list.cards;
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
// 旧公式（削弱前）
const oldG = (q, e, l) => e * Math.min(5, q) + l * Math.max(0, q - 5);
const oldAtk = (a, P, q) => a <= 0 ? 0 : Math.round((a + (q >= 14 ? 6 : q >= 13 ? 5 : q >= 12 ? 4 : q >= 10 ? 3 : q >= 6 ? 1 : 0)) * (P + oldG(q, 0.08, 0.06)) * 100) / 100;
const oldHp = (h, P, q) => Math.round(h * (P + oldG(q, 0.05, 0.04)) * 100) / 100;
const rows = [[1, '花生射手', 20], [18, '花生神射手', 25], [27, '战盔巨头怪', 80], [54, '极·寒冰椰子', 30], [35, '石巨人', 80], [107, '恢复史莱姆', 210]];
for (const [id, , ] of rows) {
  const c = cards.find((x) => Number(x.card_id) === id);
  const a = num(c.card_atk), h = num(c.card_hp);
  console.log(`\n  #${id} ${c.card_name}（基础攻 ${a} / 血 ${h}）—— 普通品质`);
  console.log('   星级 |  攻击 旧→新      |  生命 旧→新');
  for (const q of [1, 4, 7, 10, 13, 15]) {
    const n = calculateCardStats({ ...c, id }, 2, q);
    const oa = oldAtk(a, 1.0, q), oh = oldHp(h, 1.0, q);
    const da = oa > 0 ? ` (${((n.atk / oa - 1) * 100).toFixed(0)}%)` : '';
    console.log(`   ${String(q).padStart(2)}星 | ${String(oa).padStart(6)} → ${String(n.atk).padStart(6)}${da.padEnd(8)}| ${String(oh).padStart(6)} → ${String(n.hp).padStart(6)} (${((n.hp / oh - 1) * 100).toFixed(0)}%)`);
  }
}
