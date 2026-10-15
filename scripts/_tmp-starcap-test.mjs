const { maxStarsForCard } = await import('../src/systems/CardStrengthenSystem.js');
for (const q of [1, 2, 3, 4, 5, 6]) {
  const cap = maxStarsForCard({ quality: q });
  const expect = { 1: 4, 2: 7, 3: 10, 4: 13, 5: 15, 6: 15 }[q];
  console.log(`  ${q} 级卡: 上限 ${cap} 星 ${cap === expect ? '✔' : '✗ 期望 ' + expect}`);
}
