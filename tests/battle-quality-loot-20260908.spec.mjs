import { test, expect } from '@playwright/test';

test('craft material drops bypass placeholder and quality pedestal stays a transparent energy ring', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const [rendererModule, lootModule, haloModule, constantsModule] = await Promise.all([
      import('/src/battle/BattleRenderer.js'),
      import('/src/ui/BattleLootMaterialIconFix20260908.js'),
      import('/src/ui/BattleQualityHaloFix20260908.js'),
      import('/src/core/constants.js'),
    ]);

    const makeContext = () => {
      const events = [];
      const gradient = () => ({ addColorStop: (offset, color) => events.push({ type: 'stop', offset, color }) });
      const ctx = {
        events,
        save: () => events.push({ type: 'save' }),
        restore: () => events.push({ type: 'restore' }),
        beginPath: () => events.push({ type: 'beginPath' }),
        arc: (...args) => events.push({ type: 'arc', args }),
        ellipse: (...args) => events.push({ type: 'ellipse', args }),
        fill: () => events.push({ type: 'fill' }),
        stroke: () => events.push({ type: 'stroke', lineWidth: ctx.lineWidth, strokeStyle: ctx.strokeStyle }),
        fillRect: (...args) => events.push({ type: 'fillRect', args }),
        translate: (...args) => events.push({ type: 'translate', args }),
        rotate: (...args) => events.push({ type: 'rotate', args }),
        drawImage: (...args) => events.push({ type: 'drawImage', args: args.length }),
        strokeText: (...args) => events.push({ type: 'strokeText', args }),
        fillText: (...args) => events.push({ type: 'fillText', args }),
        createRadialGradient: gradient,
        createLinearGradient: gradient,
        globalAlpha: 1,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: '',
        lineJoin: '',
        shadowColor: '',
        shadowBlur: 0,
        font: '',
        textAlign: '',
      };
      return ctx;
    };

    lootModule.installBattleLootMaterialIconFix20260908();
    const renderer = Object.create(rendererModule.BattleRenderer.prototype);
    const craftCtx = makeContext();
    renderer.drawLootDrops(craftCtx, {
      time: 1,
      lootDrops: [{
        id: 1,
        itemId: 50001,
        kind: 'craft-material',
        lane: 0,
        col: 0,
        createdAt: 0,
      }],
    });

    const ordinaryCtx = makeContext();
    renderer.drawLootDrops(ordinaryCtx, {
      time: 1,
      lootDrops: [{
        id: 2,
        itemId: 999999,
        lane: 0,
        col: 0,
        createdAt: 0,
      }],
    });

    haloModule.installBattleQualityHaloFix20260908();
    const haloCtx = makeContext();
    renderer.drawUnitHalo(
      haloCtx,
      { craftQuality: 4 },
      { cx: 100, footY: 120, isDying: false },
    );

    return {
      craftPlaceholderRects: craftCtx.events.filter((event) => event.type === 'fillRect').length,
      ordinaryPlaceholderRects: ordinaryCtx.events.filter((event) => event.type === 'fillRect').length,
      craftLabel: craftCtx.events.some((event) => event.type === 'fillText' && event.args?.[0] === '掉落'),
      haloFillCount: haloCtx.events.filter((event) => event.type === 'fill').length,
      haloEllipseCount: haloCtx.events.filter((event) => event.type === 'ellipse').length,
      haloMaxStroke: Math.max(0, ...haloCtx.events.filter((event) => event.type === 'stroke').map((event) => Number(event.lineWidth) || 0)),
      quality3: constantsModule.resolveCraftQuality(3),
      quality4: constantsModule.resolveCraftQuality(4),
      quality5: constantsModule.resolveCraftQuality(5),
    };
  });

  // 500xx smithy materials must never go through the old rotated-square fallback.
  expect(result.craftPlaceholderRects).toBe(0);
  expect(result.ordinaryPlaceholderRects).toBeGreaterThan(0);
  expect(result.craftLabel).toBe(true);

  // The reference pedestal has a transparent centre and a thick front rim.
  expect(result.haloFillCount).toBe(0);
  expect(result.haloEllipseCount).toBeGreaterThanOrEqual(5);
  expect(result.haloMaxStroke).toBeGreaterThanOrEqual(7);

  expect(result.quality3.name).toBe('优秀');
  expect(result.quality3.baseLabel).toBe('绿');
  expect(result.quality4.name).toBe('精良');
  expect(result.quality4.baseLabel).toBe('蓝');
  expect(result.quality5.name).toBe('完美');
  expect(result.quality5.baseLabel).toBe('紫');
});
