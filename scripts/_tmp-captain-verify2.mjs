const { BattleEngine } = await import('../src/battle/BattleEngine.js');
const mk = (cardId, lane, col, team = 'player') => ({ cardId, lane, col, team, alive: true, atk: 0 });
const run = (unit, units) => ({ aura: BattleEngine.prototype.getAuraBonus.call({ units }, unit), asm: BattleEngine.prototype.getAtkSpeedMult.call({ units, time: 0 }, unit) });
const sniper = mk(18, 2, 3);
const capAdj = mk(127, 2, 2);        // 相邻（|dc|=1 → 3x3 内）
const shooter = mk(1, 2, 2);
const r1 = run(sniper, [sniper, capAdj]);
const r2 = run(shooter, [shooter, capAdj]);
console.log('  花生神射手 + 相邻队长: 攻击 +' + r1.aura + ' | 攻速 ' + r1.asm.toFixed(2), (r1.aura === 1 && r1.asm === 0.85) ? '✔' : '✗');
console.log('  花生射手   + 相邻队长: 攻击 +' + r2.aura + ' | 攻速 ' + r2.asm.toFixed(2), (r2.aura === 1 && r2.asm === 0.85) ? '✔' : '✗');
