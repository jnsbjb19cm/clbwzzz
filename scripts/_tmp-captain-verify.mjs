const { BattleEngine } = await import('../src/battle/BattleEngine.js');
const mk = (cardId, lane, col, team = 'player') => ({ cardId, lane, col, team, alive: true, atk: 0 });
const run = (unit, units) => ({ aura: BattleEngine.prototype.getAuraBonus.call({ units }, unit), asm: BattleEngine.prototype.getAtkSpeedMult.call({ units, time: 0 }, unit) });
const shooter = mk(1, 2, 2);            // 花生射手
const sniper = mk(18, 2, 3);            // 花生神射手
const other = mk(5, 2, 2);              // 巨头怪（非花生）
const far = mk(1, 2, 8);                // 距离远的花生射手
const captain = (lane, col) => mk(127, lane, col);
const capNear = captain(2, 1);
const capNear2 = captain(2, 3);         // 第二个队长（不应叠加）
const capFar = captain(5, 2);

const t = (label, unit, units) => { const r = run(unit, units); console.log(`  ${label}: 攻击加成 +${r.aura} | 攻速倍率 ${r.asm.toFixed(2)}`); };
t('花生射手 + 1 个队长(3x3内)', shooter, [shooter, capNear]);
t('花生射手 + 2 个队长(不叠加)', shooter, [shooter, capNear, capNear2]);
t('花生射手 + 远处队长(不生效)', shooter, [shooter, capFar]);
t('花生神射手 + 队长', sniper, [sniper, capNear]);
t('非花生单位(巨头怪) + 队长(不加成)', other, [other, capNear]);
t('花生射手 无队长(基准)', shooter, [shooter]);
