const { formatBattleAmount } = await import('../src/battle/BattleConfig.js');
const cases = [10, 10.08, 10.05, 5.5, 5.44, 12.96, 0.4, 0.04, 1.5, 100, 3.14159];
for (const v of cases) console.log('  ', String(v).padEnd(9), '→', JSON.stringify(formatBattleAmount(v)));
