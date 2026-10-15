const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');
const card = { id: 1, card_name: '花生射手', atk: 6, hp: 18, cooldown: 5.0, atk_style: 2 };
const expect = { 2: 1.0, 3: 1.08, 4: 1.2, 5: 1.4 };
for (const q of [1, 2, 3, 4, 5, 6]) {
  const s = calculateCardStats(card, q, 0);
  const base = 6;
  const ratio = (s.atk / base).toFixed(2);
  const ok = q >= 2 && q <= 5 ? (Math.abs(Number(ratio) - expect[q]) < 0.005 ? '✔' : '✗') : '（兼容档）';
  console.log(`  品质 ${q}: 攻击 ${s.atk} (×${ratio}) 生命 ${s.hp}  ${ok}`);
}
