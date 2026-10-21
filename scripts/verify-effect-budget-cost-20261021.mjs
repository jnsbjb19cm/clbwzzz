import assert from 'node:assert/strict';
await import('../server/battle/PvpBattle.js');
const { BattleEngine } = await import('../src/battle/BattleEngine.js');
const { installBattleRuntimePerformance20260905 } = await import('../src/battle/BattleRuntimePerformance20260905.js');
installBattleRuntimePerformance20260905();
let reads = 0;
const engine = Object.create(BattleEngine.prototype);
Object.assign(engine, { time: 1, floats: [], units: Array.from({length:200},()=>({get alive(){reads++;return true;}})) });
for(let i=0;i<200;i++) engine.spawnFloat(i%5, i/20, 5);
console.log('200 group-effect floats: alive reads =', reads);
assert.ok(reads<=200*24, 'Budget selection should stop at its 24-live-unit threshold, not scan the full army for every effect');
assert.ok(engine.floats.length<=24);
// Deaths must take effect immediately (do not cache a stale live-unit count).
engine.units=Array.from({length:23},()=>({alive:true}));engine.floats=[];
for(let i=0;i<40;i++)engine.spawnFloat(i%5,i,5);
assert.equal(engine.floats.length,40);
console.log('PASS bounded budget work and immediate live-unit threshold changes');
