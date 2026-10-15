const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');
const card = { id: 1, card_name: '花生射手', atk: 6, hp: 18, cooldown: 5.0, atk_style: 2 };
for (const q of [1, 2, 3, 4, 5, 6]) {
  const s = calculateCardStats(card, q, 0);
  const raw = calculateCardStats(card, 1, 0);
  console.log(`  品质 ${q}: 攻击 ${s.atk} (相对普通 ×${(s.atk / raw.atk).toFixed(2)}) · 生命 ${s.hp} (×${(s.hp / raw.hp).toFixed(2)})`);
}
