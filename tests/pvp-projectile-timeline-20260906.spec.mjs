import { test, expect } from '@playwright/test';

test('authority projectile timeline is continuous and never rewinds', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const timeline = await import('/src/ui/PvpServerTimeline20260819.js');
    const projectile = {
      trajectory: 'straight',
      x: 0,
      y: 1,
      progress: 0,
      arcOffset: 0,
      flightT: 0,
      flightStartCol: 0,
      flightStartLane: 1,
      flightEndCol: 10,
      flightEndLane: 1,
    };
    const clock = { synced: true, offsetMs: 0 };
    const configured = timeline.configureProjectileServerTimeline(
      projectile,
      { launchServerTimeMs: 1000, endServerTimeMs: 2000, serverTimeMs: 1000 },
      clock,
      1000,
    );
    const view = { __pvpServerClock: clock };
    timeline.applyProjectileServerTimeline(view, projectile, 1500);
    const half = { x: projectile.x, progress: projectile.progress };

    // Simulate an old snapshot trying to pull the bullet back between render frames.
    projectile.x = 1;
    projectile.progress = 0.1;
    const guarded = { x: projectile.x, progress: projectile.progress };

    timeline.applyProjectileServerTimeline(view, projectile, 1400);
    const stale = { x: projectile.x, progress: projectile.progress };
    timeline.applyProjectileServerTimeline(view, projectile, 1800);
    const later = { x: projectile.x, progress: projectile.progress };
    timeline.applyProjectileServerTimeline(view, projectile, 2000);
    const end = { x: projectile.x, progress: projectile.progress };
    return { configured, half, guarded, stale, later, end };
  });

  expect(result.configured).toBe(true);
  expect(result.half).toEqual({ x: 5, progress: 0.5 });
  expect(result.guarded).toEqual(result.half);
  expect(result.stale).toEqual(result.half);
  expect(result.later.x).toBe(8);
  expect(result.later.progress).toBe(0.8);
  expect(result.end).toEqual({ x: 10, progress: 1 });
});
