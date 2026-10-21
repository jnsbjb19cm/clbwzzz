/**
 * 2026-10-21 双无尽模式多分辨率 UI 回归：
 * - 页面在各尺寸下必须是可滚动容器（#view-root 是 overflow:hidden 的固定容器，
 *   页面自己不吃满视口高度时，底部内容会被裁掉且永远滚不到）；
 * - 不允许出现横向滚动/出界的主按钮；
 * - 战斗界面「返回挑战」按钮不得与右下按钮组重叠或出界。
 * 自带 vite 开发服务器，不依赖外部端口。
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const SIZES = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [900, 600], [800, 600], [640, 480], [480, 800], [390, 844]];
mkdirSync('scripts/output/ui-res', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 5184, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
let checks = 0;

async function measurePage() {
  return page.evaluate(() => {
    const pageEl = document.querySelector('.endless-page');
    const viewRoot = document.querySelector('#view-root');
    const vw = innerWidth, vh = innerHeight;
    const reachable = (el) => {
      let node = el;
      while (node) {
        const style = getComputedStyle(node);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return true;
        node = node.parentElement;
      }
      return false;
    };
    const outOfView = [];
    for (const el of document.querySelectorAll('.endless-page h1, .endless-page h2, .endless-page .endless-tabs button, .endless-page .endless-stats span, .endless-page button.primary, .endless-page .endless-panel, .endless-page .endless-card')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > vw + 1.5 || rect.left < -1.5) outOfView.push({ text: (el.textContent || '').trim().slice(0, 16), left: +rect.left.toFixed(1), right: +rect.right.toFixed(1) });
    }
    const lastBottom = pageEl ? pageEl.lastElementChild.getBoundingClientRect().bottom : 0;
    const picker=document.querySelector('.endless-card-picker')?.getBoundingClientRect();
    const footer=document.querySelector('.endless-camp-footer')?.getBoundingClientRect();
    return {
      vw, vh,
      docScrollW: document.documentElement.scrollWidth,
      viewRootOverflow: viewRoot ? getComputedStyle(viewRoot).overflowY : null,
      pageHeight: pageEl?.clientHeight ?? 0,
      pageScrollable: pageEl ? pageEl.scrollHeight > pageEl.clientHeight + 1 : false,
      contentReachable: pageEl ? reachable(pageEl) : false,
      lastBottom: +lastBottom.toFixed(1),
      campFooterOverlaps:Boolean(picker&&footer&&footer.top<picker.bottom-1),
      outOfView: outOfView.slice(0, 6),
    };
  });
}

async function checkScene(label, setup, { sizes = SIZES } = {}) {
  await page.evaluate(async (source) => {
    const app = globalThis.__clbwzAppInstance;
    app.views.endless?.destroy();
    app.views.battle?.destroy?.();
    app.root.replaceChildren(app.renderShell());
    const { authStore } = await import('/src/core/AuthStore.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    authStore.user = { id: 'ui-verify' };
    setPlayerStorageUser('ui-verify');
    // eslint-disable-next-line no-new-func
    await (new Function('app', `return (${source}).call(null, app)`))(app);
  }, setup);
  await page.waitForFunction(() => document.querySelector('.endless-page'), { timeout: 60000 });
  await page.waitForTimeout(250);
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(180);
    const info = await measurePage();
    const tagname = `${label}@${w}x${h}`;
    assert.ok(info.vw === w && info.vh === h, `${tagname}: 视口未生效`);
    assert.ok(info.docScrollW <= w + 1, `${tagname}: 出现横向滚动 ${info.docScrollW}>${w}`);
    assert.equal(info.outOfView.length, 0, `${tagname}: 元素出界 ${JSON.stringify(info.outOfView)}`);
    assert.equal(info.campFooterOverlaps,false,`${tagname}: 换卡操作条遮住卡片`);
    assert.ok(info.pageHeight <= info.vh + 1, `${tagname}: 页面高度未受视口约束 ${info.pageHeight}`);
    if (info.lastBottom > info.vh + 1) {
      assert.ok(info.pageScrollable, `${tagname}: 内容超出视口但页面不可滚动（会被裁掉）`);
      assert.ok(info.contentReachable, `${tagname}: 内容超出视口但滚不到`);
    }
    checks += 1;
    await page.screenshot({ path: `scripts/output/ui-res/${label}-${w}x${h}.png` });
  }
  console.log('PASS page responsive', label);
}

async function checkBattle(label, setup) {
  await page.evaluate(async (source) => {
    const app = globalThis.__clbwzAppInstance;
    app.views.endless?.destroy();
    app.root.replaceChildren(app.renderShell());
    // eslint-disable-next-line no-new-func
    await (new Function('app', `return (${source}).call(null, app)`))(app);
  }, setup);
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.views?.endless?.child?.engine && document.querySelector('#battle-canvas'), { timeout: 120000 });
  await page.waitForTimeout(600);
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(320);
    const info = await page.evaluate(() => {
      const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
      const overlap = (a, b) => Boolean(a && b && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y);
      const back = rect('.endless-battle-return');
      const fab = rect('.battle-fab');
      const canvas = rect('#battle-canvas');
      return {
        vw: innerWidth, vh: innerHeight,
        back, fab, canvas,
        problems: [
          !back ? 'missing-return-button' : null,
          back && (back.x < -1 || back.y < -1 || back.right > innerWidth + 1 || back.bottom > innerHeight + 1) ? 'return-offscreen' : null,
          back && overlap(back, fab) ? 'return-overlaps-fab' : null,
          canvas && (canvas.right > innerWidth + 2 || canvas.bottom > innerHeight + 2) ? 'canvas-offscreen' : null,
        ].filter(Boolean),
      };
    });
    const tagname = `${label}@${w}x${h}`;
    assert.equal(info.problems.length, 0, `${tagname}: ${info.problems.join(',')} back=${JSON.stringify(info.back)} fab=${JSON.stringify(info.fab)}`);
    checks += 1;
    await page.screenshot({ path: `scripts/output/ui-res/endless-battle-${w}x${h}.png` });
  }
  console.log('PASS battle UI responsive', label);
}

try {
  await page.goto('http://127.0.0.1:5184/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, { timeout: 120000 });
  await page.waitForTimeout(600);

  await checkScene('trial-start', `async (app) => { app.navigate('endless', { mode: 'trial' }); }`);
  await checkScene('trial-ready', `async (app) => {
    const R = await import('/src/data/EndlessAdventureRules.js');
    app.navigate('endless', { mode: 'trial' });
    const v = app.views.endless;
    v.commit({ ...R.createEndlessRun({ mode: 'trial', seed: 'ui', starter: 'plants' }), floor: 12, cleared: 11, battles: 11, phase: 'ready', baseHp: 820, contracts: ['swift'] });
    v.render(v.root);
  }`);
  await checkScene('contract', `async (app) => {
    const R = await import('/src/data/EndlessAdventureRules.js');
    app.navigate('endless', { mode: 'trial' });
    const v = app.views.endless;
    v.commit({ ...R.createEndlessRun({ mode: 'trial', seed: 'c', starter: 'plants' }), floor: 11, cleared: 10, battles: 10, phase: 'contract', baseHp: 700, contracts: ['swift'] });
    v.render(v.root);
  }`);
  await checkScene('camp', `async (app) => {
    const R = await import('/src/data/EndlessAdventureRules.js');
    app.navigate('endless', { mode: 'trial' });
    const v = app.views.endless;
    v.commit({ ...R.createEndlessRun({ mode: 'trial', seed: 'camp', starter: 'plants' }), floor: 6, cleared: 5, battles: 5, phase: 'camp', swapsLeft: 1 });
    v.render(v.root);
  }`);
  await checkScene('expedition-route', `async (app) => {
    const R = await import('/src/data/EndlessAdventureRules.js');
    app.navigate('endless', { mode: 'expedition' });
    const v = app.views.endless;
    v.commit({ ...R.createEndlessRun({ mode: 'expedition', seed: 'route', starter: 'plants' }), battles: 3, cleared: 3, step: 4 });
    v.render(v.root);
  }`);
  await checkBattle('endless-battle', `async (app) => {
    const { authStore } = await import('/src/core/AuthStore.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    authStore.user = { id: 'ui-verify-battle' };
    setPlayerStorageUser('ui-verify-battle');
    const R = await import('/src/data/EndlessAdventureRules.js');
    app.navigate('endless', { mode: 'trial' });
    const v = app.views.endless;
    v.commit(R.createEndlessRun({ mode: 'trial', seed: 'battle' }));
    v.render(v.root);
    await v.launchBattle();
  }`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log(JSON.stringify({ checks, passed: true }));
} finally {
  await browser.close();
  await server.close();
}
