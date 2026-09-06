import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_RESOURCE,
  RESOURCE_REGEN,
  RESOURCE_REGEN_INTERVAL,
  RESOURCE_START,
} from '../src/battle/BattleConfig.js';

// Restore and guard the original battle-resource cadence used before 00828abb:
// start at 10, gain 1 resource every 1.6 seconds, cap at 40.
assert.equal(RESOURCE_START, 10, 'battle resources must still start at 10');
assert.equal(MAX_RESOURCE, 40, 'battle resources must still cap at 40');
assert.equal(RESOURCE_REGEN, 1, 'battle resources must recover one point per regen tick');
assert.equal(RESOURCE_REGEN_INTERVAL, 1.6, 'battle resource regen tick must remain 1.6 seconds');

function simulateResource(seconds) {
  let value = RESOURCE_START;
  let timer = 0;
  const dt = 0.1;
  for (let elapsed = 0; elapsed + 1e-9 < seconds; elapsed += dt) {
    timer += Math.min(dt, seconds - elapsed);
    while (timer + 1e-9 >= RESOURCE_REGEN_INTERVAL) {
      timer -= RESOURCE_REGEN_INTERVAL;
      value = Math.min(MAX_RESOURCE, value + RESOURCE_REGEN);
    }
  }
  return value;
}

assert.equal(simulateResource(1.5), 10, 'resource must not jump before the first 1.6-second tick');
assert.equal(simulateResource(1.6), 11, 'resource must increase by exactly one at 1.6 seconds');
assert.equal(simulateResource(16), 20, 'ten regen ticks must recover ten total resource, not one large burst');
assert.equal(simulateResource(64), 40, 'resource regeneration must respect the 40-point cap');

// PVE, authoritative PVP and co-op BOSS must all consume the same shared cadence.
for (const relativePath of [
  '../src/battle/BattleEngine.js',
  '../server/battle/PvpBattle.js',
  '../server/battle/CoopBossBattle.js',
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(source, /RESOURCE_REGEN/,
    `${relativePath} must use the shared resource regeneration amount`);
  assert.match(source, /RESOURCE_REGEN_INTERVAL/,
    `${relativePath} must use the shared resource regeneration interval`);
}

console.log('Battle resource regeneration regression: OK');
