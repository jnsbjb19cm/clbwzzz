import { test, expect } from '@playwright/test';

test('image queue is bounded, deduplicated and survives a failed image', async ({ page }) => {
  await page.route('**/fixture-preload', route => route.fulfill({ contentType: 'text/html', body: '<div></div>' }));
  await page.goto('/fixture-preload');
  const result = await page.evaluate(async () => {
    let active = 0, maximum = 0, count = 0;
    const pending = [];
    window.Image = class {
      set src(url) {
        if (!url) return;
        active++; count++; maximum = Math.max(maximum, active);
        pending.push(() => { active--; url.includes('items.png') ? this.onerror?.() : this.onload?.(); });
      }
    };
    const preload = await import('/src/core/LoginImagePreload.js');
    const first = preload.preloadLoginImages();
    const same = first === preload.preloadLoginImages();
    while (pending.length) { pending.shift()(); await Promise.resolve(); }
    const state = await first;
    return { ...state, maximum, count, same };
  });
  expect(result.maximum).toBe(3);
  expect(result.same).toBe(true);
  expect(result.failed).toBe(1);
  expect(result.count).toBe(result.total);
  expect(result.complete).toBe(true);
});

test('actual entry warms main-city art before login', async ({ page }) => {
  const request = page.waitForRequest(req => req.url().endsWith('/background/hallbackground.png'));
  await page.goto('/');
  await request;
  await expect(page.locator('#login-sub')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('clbwz_auth_token_v1'))).toBeNull();
  await expect.poll(() => page.evaluate(async () => {
    const { loginImagePreloadState } = await import('/src/core/LoginImagePreload.js');
    return loginImagePreloadState.loaded;
  })).toBeGreaterThan(0);
  const status = await page.evaluate(async () => {
    const { preloadLoginImages } = await import('/src/core/LoginImagePreload.js');
    return preloadLoginImages();
  });
  expect(status.failed).toBe(0);
  expect(status.loaded).toBe(status.total);
});
