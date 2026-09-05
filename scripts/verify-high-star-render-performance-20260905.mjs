import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal browser stubs for importing the battle renderer in Node.
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

const { BattleRenderer } = await import('../src/battle/BattleRenderer.js');
const { installBattleRenderLoadShedding20260905 } = await import('../src/ui/BattleRenderLoadShedding20260905.js');
const { installBattleImpactSafetyFinal } = await import('../src/ui/BattleImpactSafetyFinal.js');
installBattleRenderLoadShedding20260905();
installBattleImpactSafetyFinal();

function makeRenderer({ forceLowQuality = false } = {}) {
  const renderer = Object.create(BattleRenderer.prototype);
  let clearCount = 0;
  let unitPassCount = 0;

  renderer.forceLowQuality = forceLowQuality;
  renderer.fieldScale = 1;
  renderer.fieldOffsetX = 0;
  renderer.fieldOffsetY = 0;
  renderer.canvas = { width: 1280, height: 720 };
  renderer.ctx = {
    setTransform() {},
    clearRect() { clearCount += 1; },
    fillRect() {},
  };
  renderer.ensureSprites = () => {};
  renderer.drawUnits = () => { unitPassCount += 1; };
  renderer.drawDeployEffects = () => {};
  renderer.drawLootDrops = () => {};
  renderer.drawSkillFx = () => {};
  renderer.drawImpactFx = () => {};
  renderer.drawBumpFx = () => {};
  renderer.drawFloats = () => {};

  return {
    renderer,
    counts: () => ({ clearCount, unitPassCount }),
  };
}

function makeEngine(unitCount) {
  return {
    units: Array.from({ length: unitCount }, (_, index) => ({ uid: index + 1, alive: true })),
    floats: [],
    impactFx: [],
    bumpFx: [],
    deployEffects: [],
    skillFx: [],
    projectiles: [],
    status: 'playing',
    time: 0,
    battleTick: 0,
  };
}

{
  const { renderer, counts } = makeRenderer();
  const engine = makeEngine(50);

  nowMs = 0;
  renderer.draw(engine);
  nowMs = 16;
  renderer.draw(engine);

  assert.deepEqual(
    counts(),
    { clearCount: 2, unitPassCount: 2 },
    '50-unit battle must draw every RAF frame; installed performance policy must neutralize internal ~30 FPS throttling',
  );
  assert.equal(
    renderer._lowQuality,
    false,
    'large unit count must not automatically switch the battlefield into low-quality mode',
  );
  assert.equal(
    renderer.__perfSkipHalos20260905,
    false,
    'large unit count must not automatically hide craft-quality halos',
  );
}

{
  const { renderer, counts } = makeRenderer();
  const engine = makeEngine(50);
  engine.skillFx.push({ fullScreen: true, kind: 'damage_all_enemies', skillId: 1 });

  nowMs = 100;
  renderer.draw(engine);
  nowMs = 116;
  renderer.draw(engine);

  assert.deepEqual(
    counts(),
    { clearCount: 2, unitPassCount: 2 },
    'full-screen skills must not throttle the complete battle frame',
  );
}

{
  const { renderer } = makeRenderer();
  const engine = makeEngine(8);
  for (const unit of engine.units) {
    unit.strengthLv = 12;
    unit.craftQuality = 4;
  }

  nowMs = 200;
  renderer.draw(engine);

  assert.equal(renderer.__perfHighTierUnits20260905, 8, 'expected all eight high-star/high-quality cards to be counted for diagnostics');
  assert.equal(
    renderer.__perfSkipHalos20260905,
    false,
    'high-star/high-quality density must not hide quality halos in normal quality mode',
  );
  assert.equal(
    renderer._lowQuality,
    false,
    'high-star/high-quality density must not force low-quality rendering',
  );
}

{
  const { renderer } = makeRenderer({ forceLowQuality: true });
  const engine = makeEngine(50);
  nowMs = 250;
  renderer.draw(engine);
  assert.equal(
    renderer._lowQuality,
    true,
    'explicit low-quality mode must remain available even though automatic load-based degradation is removed',
  );
}

{
  let storageReads = 0;
  globalThis.localStorage = {
    getItem(key) {
      assert.equal(key, 'clbwz_show_unit_names');
      storageReads += 1;
      return null;
    },
  };

  const { renderer } = makeRenderer();
  const engine = makeEngine(6);
  nowMs = 300;
  renderer.draw(engine);
  assert.equal(storageReads, 1, 'unit-name setting should be read once per rendered battle frame, not once per unit');

  let measureCalls = 0;
  const nameCtx = {
    font: '',
    textAlign: '',
    fillStyle: '',
    measureText() {
      measureCalls += 1;
      return { width: 30 };
    },
    fillRect() {},
    fillText() {},
  };
  renderer.drawUnitName(nameCtx, 0, 0, 80, '五星花生', 'player');
  renderer.drawUnitName(nameCtx, 0, 0, 80, '五星花生', 'player');
  assert.equal(measureCalls, 1, 'same unit-name label width should be measured once and reused');

  nowMs = 316;
  renderer.draw(engine);
  assert.equal(storageReads, 2, 'unit-name setting should still refresh on the next rendered frame');
  delete globalThis.localStorage;
}

{
  // Missing/unsafe source impact animation used to fall back to a stroked ctx.arc,
  // which is the visible small attack/debug circle reported in gameplay. Runtime
  // may omit that cosmetic impact, but it must never synthesize a debug-style ring.
  const renderer = Object.create(BattleRenderer.prototype);
  renderer.bulletAnims = new Map();
  renderer.requestBulletAnim = () => Promise.resolve(false);
  let arcCalls = 0;
  let strokeCalls = 0;
  const impactCtx = {
    save() {},
    restore() {},
    beginPath() {},
    arc() { arcCalls += 1; },
    stroke() { strokeCalls += 1; },
  };
  renderer.drawImpactFx(impactCtx, {
    impactFx: [{ lane: 1, col: 4, t: 0.1, res: 999999 }],
  });
  assert.equal(
    arcCalls,
    0,
    'missing attack impact animation must not draw the synthetic small hit/debug circle',
  );
  assert.equal(
    strokeCalls,
    0,
    'missing attack impact animation must not stroke a synthetic hit/debug ring',
  );
}

{
  // The old card-feedback patch independently synthesized attack/damage/summon
  // circles with ctx.arc/ctx.ellipse. These are presentation-only debug-looking
  // HIT/deploy rings and must be absent from production source entirely.
  const feedbackSource = readFileSync(
    new URL('../src/ui/BattleCardFeedbackFinal.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    feedbackSource,
    /ctx\.(?:arc|ellipse)\s*\(/,
    'card feedback must not synthesize circular attack/damage/summon/death markers',
  );
  assert.doesNotMatch(
    feedbackSource,
    /createRadialGradient\s*\(/,
    'card feedback must not synthesize circular glow markers around attack/deploy events',
  );
}

{
  // PVP impacts outside the 12x5 unit grid had a second independent fallback
  // ctx.arc ring while the real baoza animation was unavailable. Base hits must
  // not reintroduce the same synthetic HIT circle through the PVP viewport patch.
  const pvpImpactSource = readFileSync(
    new URL('../src/ui/PvpImpactFxFinal.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    pvpImpactSource,
    /ctx\.arc\s*\(/,
    'PVP/base impact fallback must not synthesize a circular HIT marker',
  );
}

{
  // Older viewport/presentation fallbacks also drew round placeholder bullets and
  // round impact markers. They remain on the active renderer chain for some paths,
  // so production implementations must not contain Canvas arc placeholders.
  for (const relativePath of [
    '../src/ui/BattlefieldCombatPresentationFinal.js',
    '../src/ui/ProjectileViewportFinal.js',
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(
      source,
      /ctx\.arc\s*\(/,
      `${relativePath} must not synthesize round projectile/HIT fallback markers`,
    );
  }
}

console.log('High-star render-performance regression: OK');
