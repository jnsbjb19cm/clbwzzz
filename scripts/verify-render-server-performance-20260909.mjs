import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const failures = [];
async function check(name, run) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(error); console.error(`FAIL ${name}: ${error.message}`); }
}

await check('native renderer draws every frame at 60/144Hz, including heavy and fullscreen scenes', async () => {
  globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} };
  const { BattleRenderer } = await import('../src/battle/BattleRenderer.js');
  let now = 0;
  const originalPerformance = globalThis.performance;
  globalThis.performance = { now: () => now };
  try {
    for (const hz of [60, 144]) for (const fullScreen of [false, true]) {
      const renderer = Object.create(BattleRenderer.prototype);
      let clears = 0;
      renderer.canvas = { width: 1280, height: 720 };
      renderer.ctx = { setTransform() {}, clearRect() { clears++; }, fillRect() {} };
      for (const name of ['ensureSprites', 'drawUnits', 'drawDeployEffects', 'drawLootDrops', 'drawSkillFx', 'drawImpactFx', 'drawBumpFx', 'drawFloats']) renderer[name] = () => {};
      const engine = { units: Array.from({ length: 50 }, () => ({ alive: true })), skillFx: fullScreen ? [{ fullScreen: true }] : [], status: 'playing' };
      for (let frame = 0; frame < 12; frame++) { now = frame * 1000 / hz; renderer.draw(engine); }
      assert.equal(clears, 12, `${hz}Hz fullscreen=${fullScreen}: dropped ${12 - clears} frames`);
    }
  } finally { globalThis.performance = originalPerformance; }
});

await check('one broadcast builds world state once for six players and two spectators, retaining privacy', () => {
  // Exercise the actual socket broadcast helpers without opening a database or timers.
  const source = readFileSync(new URL('../server/socket/registerPvpAuthorityHandlers.js', import.meta.url), 'utf8');
  const helpers = source.slice(source.indexOf('function monotonicNowMs()'), source.indexOf('function broadcastSnapshots(')).replaceAll('export function ', 'function ');
  const context = vm.createContext({ performance: { now: () => 1000 }, Date, Map, Set, unitAnimPlayer: { resolveAnimationDuration: () => 0.5 } });
  vm.runInContext(`${helpers}\nglobalThis.emitWorld = emitPersonalized;`, context);
  let unitCalls = 0;
  let snapshotCalls = 0;
  const units = Array.from({ length: 50 }, (_, i) => ({ uid: i + 1, alive: true, atkTimer: 0.5 }));
  const battle = {
    mode: 'pvp', engine: { time: 1, heroMaxHp: 3000, enemyHeroMaxHp: 3000, units, projectiles: [], impactFx: [] },
    snapshot() { snapshotCalls++; return { units: units.map(u => ({ uid: u.uid, decoration: 'kept' })), resourcesByUser: { secret: 1 }, skillsByUser: { secret: 2 } }; },
    publicUnit(u) { unitCalls++; return { uid: u.uid, state: 'moving' }; },
    teamOf: id => id <= 3 ? 'blue' : 'red',
    publicResources: id => ({ sun: id * 10, food: id }), publicSkillState: id => ({ mp: id }),
    teamBlue: [{ userId: 1 }], teamRed: [{ userId: 4 }], resourcesOf: id => ({ sun: id * 10 }),
  };
  const entry = { battle, seq: 0, spectators: new Map([[7, 's7'], [8, 's8']]) };
  const room = { members: new Map(Array.from({ length: 6 }, (_, i) => [i + 1, { userId: i + 1, socketId: `s${i + 1}` }])) };
  const messages = [];
  const io = { to: id => ({ emit: (event, payload) => messages.push({ id, event, payload }) }) };
  context.emitWorld(io, room, entry, 'pvp:authority:snapshot');
  assert.equal(messages.length, 8);
  assert.equal(snapshotCalls, 1);
  console.log(`world unit projections: ${unitCalls} for 50 units / 8 recipients`);
  assert.equal(unitCalls, 50, 'world units must not be rebuilt for each recipient');
  for (const { payload } of messages) {
    assert.equal(payload.resourcesByUser, undefined);
    assert.equal(payload.skillsByUser, undefined);
    assert.equal(payload.units[0].decoration, 'kept');
    assert.equal(payload.projectiles, undefined);
    if (payload.viewerUserId <= 6) assert.equal(payload.resources.sun, payload.viewerUserId * 10);
    else { assert.equal(payload.resources, null); assert.equal(payload.skill, null); }
  }
  const oldUnits = messages[0].payload.units;
  context.emitWorld(io, room, entry, 'pvp:authority:finished', { includeProjectiles: true, excludeUserId: 1 });
  assert.equal(messages.length, 15);
  assert.notEqual(messages[8].payload.units, oldUnits, 'world cache must not outlive its broadcast');
  assert.ok(Array.isArray(messages[8].payload.projectiles));
});

await check('dark-feature animation packs request matching refreshed metadata and images', async () => {
  const { UnitAnimPlayer } = await import('../src/battle/UnitAnimPlayer.js');
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    const pathname = new URL(url, 'http://test').pathname;
    return { ok: true, json: async () => JSON.parse(readFileSync(new URL('../assets' + pathname, import.meta.url), 'utf8')) };
  };
  globalThis.Image = class { set src(url) { urls.push(url); queueMicrotask(() => this.onload()); } };
  try {
    const player = new UnitAnimPlayer();
    await player.preload(new Set([31, 57]));
    for (const res of [31, 57]) {
      assert.ok(player.hasAnimState(res, 'default'));
      const meta = new URL(urls.find(url => url.includes('/' + res + '.json?')), 'http://test');
      const sheet = new URL(urls.find(url => url.includes('/' + res + '.png?')), 'http://test');
      assert.notEqual(meta.searchParams.get('v'), '20260826a', 'corrected art must not reuse the pre-fix cache URL');
      assert.equal(meta.searchParams.get('v'), sheet.searchParams.get('v'));
    }
  } finally { globalThis.fetch = originalFetch; globalThis.Image = originalImage; }
});

if (failures.length) process.exitCode = 1;
