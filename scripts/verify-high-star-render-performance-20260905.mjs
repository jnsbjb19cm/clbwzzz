import assert from 'node:assert/strict';

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
installBattleRenderLoadShedding20260905();

function makeRenderer() {
  const renderer = Object.create(BattleRenderer.prototype);
  let clearCount = 0;
  let unitPassCount = 0;

  renderer.forceLowQuality = false;
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
    'full-screen skills may lower decorative quality but must not throttle the complete battle frame',
  );
}

console.log('High-star render-performance regression: OK');
