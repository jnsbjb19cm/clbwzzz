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
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'node' },
});
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
  writable: true,
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

await check('authority unit presentation extrapolates briefly but stops while movement is locked', async () => {
  const {
    UNIT_EXTRAPOLATE_SEC_20260905,
    predictAuthorityAxis20260905,
  } = await import('../src/ui/PvpAuthorityMotionMath20260905.js');

  const moving = predictAuthorityAxis20260905({
    authoritative: 4,
    velocity: 2,
    age: 0.05,
    current: 4,
    frameDt: 1 / 60,
    min: 0,
    max: 11,
  });
  assert.ok(Math.abs(moving.predicted - 4.1) < 1e-9, `expected 4.1 predicted col, got ${moving.predicted}`);
  assert.ok(moving.value > 4 && moving.value <= moving.predicted, `expected smooth forward correction, got ${moving.value}`);

  const capped = predictAuthorityAxis20260905({
    authoritative: 4,
    velocity: 2,
    age: 1,
    current: 4,
    frameDt: 1 / 60,
    min: 0,
    max: 11,
  });
  assert.ok(
    Math.abs(capped.predicted - (4 + 2 * UNIT_EXTRAPOLATE_SEC_20260905)) < 1e-9,
    `extrapolation must cap at ${UNIT_EXTRAPOLATE_SEC_20260905}s, got ${capped.predicted}`,
  );

  const locked = predictAuthorityAxis20260905({
    authoritative: 4,
    velocity: 2,
    age: 0.05,
    current: 4,
    frameDt: 1 / 60,
    min: 0,
    max: 11,
    locked: true,
  });
  assert.equal(locked.predicted, 4, 'stunned/frozen/attacking units must not extrapolate movement');

  const discontinuity = predictAuthorityAxis20260905({
    authoritative: 7,
    velocity: 0,
    age: 0,
    current: 4,
    frameDt: 1 / 60,
    min: 0,
    max: 11,
    forceSnap: true,
  });
  assert.equal(discontinuity.value, 7, 'large authoritative discontinuities should snap instead of dragging behind');
});

await check('single-pass lane query preserves the previous target-set and distance semantics', async () => {
  const { collectEnemiesInLaneSinglePass20260905 } = await import('../src/battle/BattleQueryPerformance20260905.js');

  const gridCol = (unit) => Math.max(0, Math.min(11, Math.round(Number(unit.col) || 0)));
  const normalize = (entries) => [...entries]
    .map((entry) => [Number(entry.unit.uid), Math.round(Number(entry.dist) * 1000) / 1000])
    .sort((a, b) => a[0] - b[0]);

  const oldReference = (engine, unit, lane) => {
    const dir = engine.getMoveDir(unit);
    const unitGridCol = engine.getUnitGridCol(unit);
    const found = [];
    const add = (target, dist) => {
      if (!found.some((entry) => entry.unit.uid === target.uid)) found.push({ unit: target, dist });
    };
    const getUnitsAt = (queryLane, col) => {
      const queryCol = Math.max(0, Math.min(11, Math.round(col)));
      return engine.units.filter((target) => (
        target.alive !== false
        && target.lane === queryLane
        && engine.getUnitGridCol(target) === queryCol
      ));
    };

    for (const target of getUnitsAt(lane, unitGridCol)) {
      if (engine.isValidEnemyTarget(unit, target)) add(target, 0);
    }

    for (const target of engine.units) {
      if (target.lane !== lane || !engine.isValidEnemyTarget(unit, target)) continue;
      const signedDistance = (Number(target.col) - Number(unit.col)) * dir;
      if (signedDistance < 0 && signedDistance >= -1.1) add(target, Math.abs(signedDistance));
    }

    for (let distance = 1; distance <= unit.range; distance += 1) {
      const col = unitGridCol + dir * distance;
      if (col < 0 || col >= 12) break;
      for (const target of getUnitsAt(lane, col)) {
        if (engine.isValidEnemyTarget(unit, target)) add(target, distance);
      }
    }
    return found;
  };

  const runCase = (dir) => {
    const attacker = { uid: 1, lane: 2, col: dir > 0 ? 5 : 6, range: 3 };
    const forward = dir > 0 ? 1 : -1;
    const units = [
      { uid: 2, lane: 2, col: attacker.col + 0.2 * forward, alive: true, valid: true },
      { uid: 3, lane: 2, col: attacker.col - 0.6 * forward, alive: true, valid: true },
      { uid: 4, lane: 2, col: attacker.col + 1.2 * forward, alive: true, valid: true },
      { uid: 5, lane: 2, col: attacker.col + 2.9 * forward, alive: true, valid: true },
      { uid: 6, lane: 2, col: attacker.col + 4.1 * forward, alive: true, valid: true },
      { uid: 7, lane: 1, col: attacker.col + 1.1 * forward, alive: true, valid: true },
      { uid: 8, lane: 2, col: attacker.col + 2.1 * forward, alive: true, valid: false },
      { uid: 9, lane: 2, col: attacker.col + 1.1 * forward, alive: false, valid: true },
    ];
    const engine = {
      units,
      getMoveDir: () => dir,
      getUnitGridCol: gridCol,
      isValidEnemyTarget: (_attacker, target) => target.alive !== false && target.valid !== false,
    };

    const expected = normalize(oldReference(engine, attacker, attacker.lane));
    const actual = normalize(collectEnemiesInLaneSinglePass20260905(engine, attacker, attacker.lane));
    assert.deepEqual(actual, expected, `lane query changed semantics for dir=${dir}`);
  };

  runCase(1);
  runCase(-1);
});

if (failures.length) {
  console.error('\nAuthority smooth-performance regression failures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nAuthority smooth-performance regression: OK');
