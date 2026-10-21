/**
 * 2026-10-21 战斗「运动平滑度」回归：
 * 用户反馈「只有可移动卡牌本体和子弹的帧率异常」，即位置只在引擎固定步长 tick(0.155s) 时更新，
 * 渲染 60~165FPS 但画面每 0.155s 才动一次（≈6.45 次/秒）。
 * 本脚本在真实渲染路径上统计：1 秒内可移动单位被画在多少个不同位置、子弹被画在多少个不同位置。
 * 修复前应该只有 ~6-8 个不同位置；修复后应接近渲染帧率（>=30）。
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5185, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

try {
  await page.goto('http://127.0.0.1:5185/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const app = globalThis.__clbwzAppInstance;
    app.root.replaceChildren(app.renderShell());
    app.navigate('battle', { training: true, trainingFreeRes: true, trainingMap: 'grass' });
  });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.views?.battle?.engine && document.querySelector('#battle-canvas'), { timeout: 120000 });
  await page.waitForTimeout(800);
  const setup = await page.evaluate(async () => {
    const view = globalThis.__clbwzAppInstance.views.battle;
    const engine = view.engine;
    const { Projectile } = await import('/src/battle/Projectile.js');
    // 可移动单位：跑鞋怪(3)，玩家方会持续向右跑。
    const runner = engine.spawnSummon(3, 2, 1, 'player');
    runner.hp = runner.maxHp = 100000;
    const target = engine.spawnSummon(2, 2, 11, 'enemy');
    target.hp = target.maxHp = 100000;
    target.moveSpeed = 0;
    target.atk = 0;
    target.atkSpeed = 0;
    target.atkTimer = 1e9;
    // 一发真实弹道：从左侧飞向右侧（训练模式无敌军，手动放一颗直线弹观察渲染轨迹）。
    engine.projectiles.push(new Projectile({
      owner: 'player', lane: 1, startCol: 1, hitLane: 1, hitCol: 11,
      damage: 0, trajectory: 'straight', sourceUid: null,
    }));
    globalThis.__motionProbe = { runnerUid: runner.uid, projectileId: engine.projectiles.at(-1).id };
    return { runnerUid: runner.uid, projectileId: engine.projectiles.at(-1).id, deck: engine.deck.length };
  });
  console.log('SETUP', JSON.stringify(setup));
  await page.waitForTimeout(300);

  const measured = await page.evaluate(async () => {
    const view = globalThis.__clbwzAppInstance.views.battle;
    const engine = view.engine;
    const { BattleRenderer } = await import('/src/battle/BattleRenderer.js');
    const probe = globalThis.__motionProbe;
    const samples = { unitX: [], bulletX: [] };
    const unit = engine.units.find((u) => u.uid === probe.runnerUid);
    const bullet = engine.projectiles.find((p) => p.id === probe.projectileId);
    // 单位：记录真实渲染布局算出来的 cx（每帧一次）。
    const originalLayout = BattleRenderer.prototype.computeUnitLayout;
    BattleRenderer.prototype.computeUnitLayout = function patchedLayout(eng, target) {
      const layout = originalLayout.call(this, eng, target);
      if (layout && target?.uid === probe.runnerUid) samples.unitX.push(layout.cx);
      return layout;
    };
    // 子弹：用 getter 记录「渲染阶段真正读到的 x」。不同实现（pure/v3/launch-owned…）都会读 x，
    // 这样不依赖某一个具体 drawProjectiles 实现，避免测到过期实现/过期审计数组。
    let renderPhase = false;
    const bulletRecord = [];
    let bulletStoredX = bullet.x;
    Object.defineProperty(bullet, 'x', {
      configurable: true,
      get() { if (renderPhase) bulletRecord.push(bulletStoredX); return bulletStoredX; },
      set(value) { bulletStoredX = value; },
    });
    const originalDraw = BattleRenderer.prototype.draw;
    BattleRenderer.prototype.draw = function patchedDraw(eng) {
      renderPhase = true;
      const result = originalDraw.call(this, eng);
      renderPhase = false;
      if (eng.projectiles.includes(bullet)) samples.bulletX.push(bulletRecord.length);
      return result;
    };
    await new Promise((resolve) => setTimeout(resolve, 1200));
    BattleRenderer.prototype.computeUnitLayout = originalLayout;
    BattleRenderer.prototype.draw = originalDraw;
    delete bullet.x;
    bullet.x = bulletStoredX;
    const unitDistinct = new Set(samples.unitX.map((value) => Math.round(value * 100) / 100)).size;
    const bulletDistinct = new Set(bulletRecord.map((value) => Math.round(value * 100) / 100)).size;
    return {
      unit: { samples: samples.unitX.length, distinct: unitDistinct },
      bullet: { samples: bulletRecord.length, distinct: bulletDistinct },
      runnerAlive: Boolean(unit?.alive),
    };
  });
  console.log('MEASURED', JSON.stringify(measured));
  assert.ok(measured.unit.samples > 30, `单位应每帧被布局绘制，实际样本 ${measured.unit.samples}`);
  assert.ok(measured.unit.distinct >= 30, `可移动单位 1 秒内只有 ${measured.unit.distinct} 个不同渲染位置（应为 >=30，即不再按 6.45Hz 步进）`);
  assert.ok(measured.bullet.samples > 30, `子弹应每帧被绘制，实际样本 ${measured.bullet.samples}`);
  assert.ok(measured.bullet.distinct >= 30, `子弹 1 秒内只有 ${measured.bullet.distinct} 个不同渲染位置（应为 >=30，即不再按 6.45Hz 步进）`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log('PASS unit/bullet positions render smoothly', JSON.stringify(measured));

  // 插值只加每帧 O(单位+子弹) 的几次属性读写；确认无尽战斗（24 敌军）帧率没有回落。
  const heavy = await page.evaluate(async () => {
    const app = globalThis.__clbwzAppInstance;
    app.views.battle?.destroy?.();
    app.root.replaceChildren(app.renderShell());
    const { authStore } = await import('/src/core/AuthStore.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    authStore.user = { id: 'motion-heavy' };
    setPlayerStorageUser('motion-heavy');
    const R = await import('/src/data/EndlessAdventureRules.js');
    app.navigate('endless', { mode: 'trial' });
    const view = app.views.endless;
    view.commit({ ...R.createEndlessRun({ mode: 'trial', seed: 'motion', starter: 'plants' }), floor: 24 });
    view.render(view.root);
    await view.launchBattle();
    const child = view.child;
    for (let i = 0; i < 400 && child.engine.units.filter((u) => u.alive && u.team === 'enemy').length < 24; i += 1) child.engine.wave.tick(1.1);
    for (let hand = 0; hand < 4; hand += 1) { try { await child.engine.deploy(hand % 5, 1, hand); } catch { /* ignore */ } }
    await new Promise((r) => setTimeout(r, 1200));
    const frames = [];
    let running = true;
    let last = 0;
    const tick = (ts) => { if (!running) return; if (last) frames.push(ts - last); last = ts; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 2000));
    running = false;
    const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
    const alive = child.engine.units.filter((u) => u.alive).length;
    return { avgFps: +(1000 / avg).toFixed(1), frames: frames.length, alive };
  });
  console.log('HEAVY', JSON.stringify(heavy));
  assert.ok(heavy.alive >= 20, `重负载场景单位不足：${heavy.alive}`);
  assert.ok(heavy.avgFps >= 60, `无尽战斗掉帧：平均 ${heavy.avgFps}FPS`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log(JSON.stringify({ passed: true, measured, heavy }));
} finally {
  await browser.close();
  await server.close();
}
