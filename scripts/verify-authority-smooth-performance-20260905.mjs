import assert from 'node:assert/strict';

// Headless stubs required by the shared battle modules.
globalThis.Audio = class {
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
  cloneNode() { return this; }
  load() {}
};
globalThis.window = globalThis;
globalThis.navigator = { userAgent: 'node' };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = class {
  addEventListener() {}
  set src(_value) {}
};
globalThis.fetch = async () => ({ ok: false });
globalThis.document = {
  hidden: false,
  createElement: () => ({
    getContext: () => ({}),
    addEventListener() {},
  }),
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
};

let nowMs = 0;
Object.defineProperty(globalThis, 'performance', {
  configurable: true,
  value: { now: () => nowMs },
});

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

await check('authority simulation uses a fixed 30Hz step and preserves remainder', async () => {
  const { PvpBattle } = await import('../server/battle/PvpBattle.js');
  const { installAuthorityPerformance20260905 } = await import('../server/battle/AuthorityPerformance20260905.js');

  const seen = [];
  PvpBattle.prototype.tick = function collectTick(dt) {
    seen.push(dt);
  };

  installAuthorityPerformance20260905();

  const fakeBattle = Object.create(PvpBattle.prototype);
  for (let i = 0; i < 4; i += 1) fakeBattle.tick(0.02);

  const expectedStep = 1 / 30;
  assert.equal(seen.length, 2, `expected 2 fixed steps, got ${seen.length}: ${seen.join(', ')}`);
  for (const dt of seen) {
    assert.ok(Math.abs(dt - expectedStep) < 1e-9, `simulation step must be ${expectedStep}, got ${dt}`);
  }
  const expectedRemainder = 0.08 - expectedStep * 2;
  assert.ok(
    Math.abs(Number(fakeBattle.__authorityPerfAccum20260905) - expectedRemainder) < 1e-9,
    `expected accumulator remainder ${expectedRemainder}, got ${fakeBattle.__authorityPerfAccum20260905}`,
  );
});

await check('heavy battles never throttle the whole renderer below requestAnimationFrame cadence', async () => {
  const { BattleRenderer } = await import('../src/battle/BattleRenderer.js');

  let realDrawCount = 0;
  BattleRenderer.prototype.draw = function countedDraw() {
    realDrawCount += 1;
  };

  const { installBattleRenderLoadShedding20260905 } = await import('../src/ui/BattleRenderLoadShedding20260905.js');
  installBattleRenderLoadShedding20260905();

  const renderer = Object.create(BattleRenderer.prototype);
  const engine = {
    units: Array.from({ length: 50 }, () => ({ alive: true })),
    floats: [],
    impactFx: [],
    bumpFx: [],
    deployEffects: [],
    skillFx: [],
    projectiles: [],
  };

  nowMs = 0;
  renderer.draw(engine);
  nowMs = 16;
  renderer.draw(engine);

  assert.equal(
    realDrawCount,
    2,
    `50-unit battle should render both RAF frames; underlying draw ran ${realDrawCount} time(s)`,
  );
});

await check('authority snapshots stay frequent enough for smooth movement under load', async () => {
  const { AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905 } = await import('../server/socket/AuthoritySnapshotBackpressure20260905.js');
  assert.ok(
    AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905.normalIntervalMs <= 50,
    `normal snapshot interval too slow: ${AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905.normalIntervalMs}ms`,
  );
  assert.ok(
    AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905.heavyIntervalMs <= 66,
    `heavy snapshot interval too slow: ${AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905.heavyIntervalMs}ms`,
  );
  assert.ok(
    AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905.veryHeavyIntervalMs <= 80,
    `very-heavy snapshot interval too slow: ${AUTHORITY_SNAPSHOT_BACKPRESSURE_20260905.veryHeavyIntervalMs}ms`,
  );
});

if (failures.length) {
  console.error('\nAuthority smooth-performance regression failures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nAuthority smooth-performance regression: OK');
