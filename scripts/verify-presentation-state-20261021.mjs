import assert from 'node:assert/strict';
await import('../server/battle/PvpBattle.js');
const { BattleRenderer } = await import('../src/battle/BattleRenderer.js');
const { installBattlePresentationInterpolation20261021 } = await import('../src/battle/BattlePresentationInterpolation20261021.js');
// Isolate the presentation wrapper at its real draw call boundary, including exceptions.
let shouldThrow = false;
BattleRenderer.prototype.draw = function(engine) {
  assert.ok(engine.units[0].col > 2, 'draw must see interpolated position');
  if (shouldThrow) throw new Error('draw interrupted');
};
installBattlePresentationInterpolation20261021();
const unit = { col: 2, __presentationPrevCol: 1.95 };
const bullet = { launched: true, x: 2, y: 1, arcOffset: 0, progress: .2, flightT: .2,
  _flightDuration: 1, _flightElapsed: .2, flightStartCol: 1, flightStartLane: 1, _flightVx: 5, _flightVy: 0 };
const engine = { status: 'playing', _simulationRemainder: .08, units: [unit], projectiles: [bullet] };
const before = JSON.stringify(engine);
let failed = 0;
for (const throws of [false, true]) {
  shouldThrow = throws;
  try {
    for (let i = 0; i < 165; i++) {
      try { BattleRenderer.prototype.draw.call({}, engine); } catch (error) { if (!throws) throw error; }
    }
    assert.equal(JSON.stringify(engine), before, 'Rendering must never change simulation positions or add projectile fields to units');
    console.log('PASS render state restored, exception =', throws);
  } catch (error) { failed++; console.error('FAIL', error.message); }
  for (const key of Object.keys(unit)) delete unit[key]; Object.assign(unit, JSON.parse(before).units[0]);
  Object.assign(bullet, JSON.parse(before).projectiles[0]);
}
process.exitCode = failed ? 1 : 0;
