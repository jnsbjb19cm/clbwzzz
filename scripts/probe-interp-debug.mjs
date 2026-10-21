import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
try {
  await page.goto('http://127.0.0.1:5186/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const app = globalThis.__clbwzAppInstance;
    app.root.replaceChildren(app.renderShell());
    app.navigate('battle', { training: true, trainingFreeRes: true, trainingMap: 'grass' });
  });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.views?.battle?.engine && document.querySelector('#battle-canvas'), { timeout: 120000 });
  await page.waitForTimeout(800);
  const out = await page.evaluate(async () => {
    const view = globalThis.__clbwzAppInstance.views.battle;
    const engine = view.engine;
    const renderer = view.renderer;
    const I = await import('/src/battle/BattlePresentationInterpolation20261021.js');
    const { Projectile } = await import('/src/battle/Projectile.js');
    engine.projectiles.push(new Projectile({ owner: 'player', lane: 1, startCol: 1, hitLane: 1, hitCol: 11, damage: 0 }));
    const p = engine.projectiles.at(-1);
    const samples = [];
    const orig = I.interpolatedProjectileVisual;
    // 直接采样渲染前一刻的插值结果
    const id = setInterval(() => {}, 1000); clearInterval(id);
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => requestAnimationFrame(r));
      const alpha = I.presentationAlpha(engine);
      const visual = I.interpolatedProjectileVisual(p, engine, alpha);
      samples.push({
        alpha: alpha == null ? null : +alpha.toFixed(3),
        rem: Number(engine._simulationRemainder)?.toFixed(4),
        px: +p.x.toFixed(4),
        vx: visual ? +visual.x.toFixed(4) : null,
        done: p.done,
        launched: p.launched,
        el: Number(p._flightElapsed)?.toFixed(3),
        dur: Number(p._flightDuration)?.toFixed(3),
      });
    }
    return { wrapper: Boolean(renderer.draw.__presentationInterpolation20261021), tickWrapper: Boolean(engine.tick.__presentationSnapshot20261021), samples };
  });
  console.log('WRAP', out.wrapper, out.tickWrapper);
  console.log('SAMPLES', JSON.stringify(out.samples.filter((s) => s.vx != null).slice(0, 20)));
  console.log('DISTINCT-X', new Set(out.samples.map((s) => s.vx)).size, 'nulls', out.samples.filter((s) => s.vx == null).length);
  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
} finally { await browser.close(); await server.close(); }
