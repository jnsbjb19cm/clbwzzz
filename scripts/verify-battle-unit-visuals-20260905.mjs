import assert from 'node:assert/strict';

globalThis.Audio = class {
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
  cloneNode() { return this; }
  load() {}
};
globalThis.window = globalThis;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = class {
  addEventListener() {}
  set src(_value) {}
};
globalThis.fetch = async () => ({ ok: false });
globalThis.document = {
  hidden: false,
  createElement: () => ({ getContext: () => ({}), addEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'node' },
});

const { drawCraftQualityPedestal } = await import('../src/ui/BattleUnitHaloGeometry20260905.js');

function makeCtx() {
  const ellipses = [];
  const fills = [];
  let strokes = 0;
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalCompositeOperation: 'source-over',
    save() {},
    restore() {},
    beginPath() {},
    ellipse(...args) { ellipses.push(args); },
    fill() { fills.push({ style: this.fillStyle, alpha: this.globalAlpha }); },
    stroke() { strokes += 1; },
    translate() {},
    scale() {},
  };
  return { ctx, ellipses, fills, strokeCount: () => strokes };
}

const layout = {
  cx: 100,
  footY: 120,
  circleSize: 72,
  isDying: false,
};

{
  const { ctx, ellipses, fills, strokeCount } = makeCtx();
  let packCalls = 0;
  const renderer = {
    _lowQuality: false,
    _visibleUnitCount: 100,
    drawGlobalFxPack(_ctx, name) {
      assert.equal(name, 'qualityLightCircle');
      packCalls += 1;
      return true;
    },
  };
  drawCraftQualityPedestal.call(renderer, ctx, { uid: 1, craftQuality: 5 }, layout);

  assert.equal(
    packCalls,
    1,
    'normal quality must keep the animated quality halo even with 100 visible units',
  );
  assert.equal(
    strokeCount(),
    0,
    'reference quality halo is a soft filled glow, not a hard stroked ellipse/ring',
  );
  assert.ok(ellipses.length >= 3, 'quality halo should use layered flattened glow ellipses');
  assert.ok(fills.length >= 3, 'quality halo should build a soft glow from filled translucent layers');
  assert.equal(renderer._unitHaloAudit.at(-1)?.quality, 5);
  assert.equal(renderer._unitHaloAudit.at(-1)?.qualityColor, '#9c27b0');
  assert.equal(renderer._unitHaloAudit.at(-1)?.highUnitCountThrottled, false);
}

{
  const { ctx, fills, strokeCount } = makeCtx();
  let packCalls = 0;
  const renderer = {
    _lowQuality: true,
    _visibleUnitCount: 100,
    drawGlobalFxPack() {
      packCalls += 1;
      return true;
    },
  };
  drawCraftQualityPedestal.call(renderer, ctx, { uid: 2, craftQuality: 4 }, layout);

  assert.equal(packCalls, 0, 'manual low-quality mode may skip the animated quality pack');
  assert.equal(strokeCount(), 0, 'low-quality fallback should still be a soft glow without hard outline');
  assert.ok(fills.length >= 2, 'low-quality mode must retain a visible static quality-colored glow');
  assert.equal(renderer._unitHaloAudit.at(-1)?.qualityColor, '#2196f3');
}

console.log('Battle unit visual regression: OK');
