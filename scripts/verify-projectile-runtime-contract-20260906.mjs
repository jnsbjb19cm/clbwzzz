import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calculateClockSample,
  chooseClockEstimate,
  configureProjectileServerTimeline,
  projectileTimelineState,
  applyProjectileServerTimeline,
} from '../src/ui/PvpServerTimeline20260819.js';

const spawnSource = await readFile(new URL('../src/ui/PvpProjectileSpawnEvent20260819.js', import.meta.url), 'utf8');
const continuitySource = await readFile(new URL('../src/ui/PvpProjectileContinuity20260819.js', import.meta.url), 'utf8');

function contains(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

// Spawn/despawn are event driven: bullets must appear immediately rather than wait for a 20/30 Hz snapshot.
contains(spawnSource, "'pvp:authority:projectile-spawn'", 'projectile spawn event listener must exist');
contains(spawnSource, "'pvp:authority:projectile-despawn'", 'projectile despawn event listener must exist');
contains(spawnSource, 'let projectile = (engine.projectiles ?? []).find((entry) => Number(entry?.id) === id);', 'spawn events must dedupe by projectile id');
contains(spawnSource, 'view.__pvpProjectileDespawnedIds.add(id);', 'despawned projectile ids must be remembered');
contains(spawnSource, 'if (!projectile && latestSnapshotAlreadyRemoved(view, payload, id)) return null;', 'stale spawn must not resurrect a projectile already removed by newer authority state');
contains(spawnSource, 'if (!Array.isArray(snapshotProjectiles)) return false;', 'periodic snapshots that omit projectiles must not imply despawn');
contains(spawnSource, 'applyProjectileServerTimeline(view, projectile, localNow);', 'spawn event must immediately sample the immutable server timeline');

// Continuity fallback must no longer freeze at the old 120 ms extrapolation cap.
contains(continuitySource, 'const age = Math.max(0, (now - receivedAt) / 1000);', 'legacy continuity must advance for the full time since authority receipt');
assert.ok(!continuitySource.includes('Math.min(LEGACY_EXTRAPOLATE_SEC, age)'), 'legacy continuity must not stop at 120ms');
contains(continuitySource, 'predictedX = endX;', 'legacy prediction must clamp at the immutable hit endpoint');
contains(continuitySource, 'projectile.__continuityProgress = Math.max(', 'legacy visual progress must be monotonic');
contains(continuitySource, 'applyProjectileServerTimeline(projectile.__serverTimelineView, projectile, now);', 'new protocol must use absolute server timeline in renderer');

// Exercise the actual timeline math rather than only source-shape assertions.
const sample = calculateClockSample({
  clientSendMs: 100,
  serverReceiveMs: 150,
  serverSendMs: 152,
  clientReceiveMs: 122,
});
assert.ok(sample && Number.isFinite(sample.offsetMs) && sample.rttMs >= 0, 'NTP-style clock sample must be valid');
const estimate = chooseClockEstimate([
  { offsetMs: 40, rttMs: 30 },
  { offsetMs: 42, rttMs: 10 },
  { offsetMs: 41, rttMs: 12 },
  { offsetMs: 200, rttMs: 500 },
]);
assert.equal(estimate.offsetMs, 41, 'clock estimate must prefer the low-RTT median instead of a slow outlier');

const projectile = {
  trajectory: 'straight',
  x: 0,
  y: 2,
  progress: 0,
  arcOffset: 0,
  flightT: 0,
  startCol: 0,
  lane: 2,
  hitCol: 10,
  hitLane: 2,
  flightStartCol: 0,
  flightStartLane: 2,
  flightEndCol: 10,
  flightEndLane: 2,
};
const clock = { synced: true, offsetMs: 0 };
assert.equal(configureProjectileServerTimeline(projectile, {
  launchServerTimeMs: 1000,
  endServerTimeMs: 2000,
  serverTimeMs: 1000,
}, clock, 1000), true, 'straight projectile must accept a valid absolute timeline');

let state = projectileTimelineState(projectile, 1500);
assert.equal(state.progress, 0.5);
assert.equal(state.x, 5);
projectile.__serverTimelineLastProgress = state.progress;
state = projectileTimelineState(projectile, 1400);
assert.equal(state.progress, 0.5, 'a stale/late packet must never move timeline progress backward');
assert.equal(state.x, 5, 'a stale/late packet must never pull the visible bullet backward');

const view = { __pvpServerClock: clock };
assert.equal(applyProjectileServerTimeline(view, projectile, 1750), true);
assert.equal(projectile.progress, 0.75);
assert.equal(projectile.x, 7.5);
// Snapshot/legacy writers are intentionally guarded while the server timeline owns visibility.
projectile.x = 1;
projectile.progress = 0.1;
assert.equal(projectile.x, 7.5, 'external snapshot smoothing must not overwrite timeline x');
assert.equal(projectile.progress, 0.75, 'external snapshot smoothing must not rewind timeline progress');
assert.equal(applyProjectileServerTimeline(view, projectile, 1800), true);
assert.equal(projectile.x, 8);
assert.equal(projectile.progress, 0.8);

const parabola = {
  trajectory: 'parabola', x: 0, y: 0, progress: 0, arcOffset: 0, flightT: 0,
  flightStartCol: 0, flightStartLane: 0, flightEndCol: 4, flightEndLane: 0, _arcHeight: 2,
};
assert.equal(configureProjectileServerTimeline(parabola, { launchServerTimeMs: 0, endServerTimeMs: 1000 }, clock, 0), true);
const parabolaMid = projectileTimelineState(parabola, 500);
assert.equal(parabolaMid.progress, 0.5);
assert.equal(parabolaMid.x, 2);
assert.equal(parabolaMid.arcOffset, 2, 'parabola arc must be sampled from the same absolute timeline');

console.log('PASS projectile runtime contract 20260906');
