// 临时验证（用完即删）：实战冒烟 —— 自动降画质是否生效 + FPS 采样 + 无报错
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3002';
const stamp = Date.now().toString(36);
const reg = await (await fetch(`${BASE}/api/auth/register`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: `perf_${stamp}`, password: 'e2e-pass-123', nickname: `性能${stamp.slice(-4)}` }),
})).json();

const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript((t) => { try { sessionStorage.setItem('clbwz_auth_token_v1', t); } catch { /* ignore */ } }, reg.token);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => Boolean(globalThis.__clbwzAppInstance), null, { timeout: 30000 });
await p.waitForTimeout(1500);

const out = await p.evaluate(async () => {
  const app = globalThis.__clbwzAppInstance;
  app.navigate('battle', { stageId: 1 });
  await new Promise((r) => setTimeout(r, 800));
  const view = app.views.battle;
  if (!view) return { error: 'no battle view' };
  await view.enterBattle([], 1, {});
  await new Promise((r) => setTimeout(r, 1500));
  if (!view.engine || !view.renderer) return { error: 'no engine/renderer' };

  // dist 是打包产物，无法 import 源码模块；等关卡自然出怪后克隆单位来制造“大军团”。
  await new Promise((r) => setTimeout(r, 8000));
  const seed = view.engine.units.find((u) => u.alive) ?? view.engine.units[0];
  if (!seed) return { error: 'no seed unit (wave not spawned)' };
  const proto = Object.getPrototypeOf(seed);
  const alive0 = view.engine.units.filter((u) => u.alive).length;
  for (let i = 0; view.engine.units.length < 60 && i < 200; i += 1) {
    const src = view.engine.units[i % Math.max(1, view.engine.units.length)];
    if (!src) break;
    const u = Object.create(proto);
    Object.assign(u, src);
    u.uid = 90000 + i;
    u.lane = i % 5;
    u.col = 2 + (i % 8);
    u.team = i % 2 ? 'enemy' : 'player';
    u.hp = u.maxHp = 800;
    u.alive = true;
    u._prevRenderX = u.col;
    view.engine.units.push(u);
  }

  const frames = [];
  await new Promise((resolve) => {
    let last = performance.now();
    let n = 0;
    const loop = (t) => {
      frames.push(t - last); last = t; n += 1;
      if (n < 240) requestAnimationFrame(loop); else resolve();
    };
    requestAnimationFrame(loop);
  });
  const sorted = [...frames].sort((a, c) => a - c);
  const avg = frames.reduce((s, v) => s + v, 0) / frames.length;
  return {
    unitsBefore: alive0,
    unitsAfter: view.engine.units.filter((u) => u.alive).length,
    avgFrameMs: +avg.toFixed(2),
    fps: Math.round(1000 / avg),
    p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
    autoLowQuality: view.renderer._lowQuality === true,
    perfUnits: view.renderer.__perfUnits20260905,
    skipHalos: view.renderer.__perfSkipHalos20260905 === true,
  };
});

console.log('SMOKE =', JSON.stringify(out, null, 1));
console.log('errors:', errs.slice(0, 3).join(' | ') || 'none');
await b.close();
