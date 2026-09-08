import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// The real DOM patch/client run together. Only App, auth and the socket transport
// are replaced; fake time is used solely for announcement expiry, never for RAF.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent('<div id="screen"></div><div data-classic-chat-log></div>');
  await page.addStyleTag({ content: fs.readFileSync(new URL('../src/ui/ClassicCityChrome.css', import.meta.url), 'utf8') });
  await page.evaluate(() => {
    window.announcementTimers = new Map();
    let nextTimer = 1;
    const nativeTimeout = window.setTimeout.bind(window);
    const nativeClear = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => {
      if (ms >= 4000 && ms <= 15000) { const id = --nextTimer; announcementTimers.set(id, fn); return id; }
      return nativeTimeout(fn, ms, ...args);
    };
    window.clearTimeout = (id) => { announcementTimers.delete(id); nativeClear(id); };
    window.expireAnnouncement = () => {
      const [id, fn] = [...announcementTimers][0];
      announcementTimers.delete(id); fn();
    };
    window.installAnnouncementPlainText20260905 = () => {};
    window.installSmithyCharmAndChatPolish20260908 = () => {};
    window.installBatchInventoryDatabaseFix20260908 = () => {};
    window.authStore = { token: 'fixture', user: { id: 1 }, isLoggedIn: () => Boolean(authStore.token) };
    window.App = class { bootstrap() {} mount() {} navigate() {} };
    window.SocketClient = class {
      on(event, fn) { window.deliverAnnouncement = fn; return () => {}; }
      disconnect() {}
    };
    const NativeObserver = window.MutationObserver;
    window.observerCallbacks = 0;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback) { super((...args) => {
        window.observerCallbacks++;
        if (window.observerCallbacks > 100) { this.disconnect(); throw new Error('MutationObserver did not settle'); }
        callback(...args);
      }); }
    };
  });
  const load = async (file, install) => {
    const source = fs.readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8')
      .replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export function ', 'function ');
    await page.addScriptTag({ content: `(() => { const NEW_PLAYER_TUTORIAL_PROMPT_KEY = 'fixture';\n${source}\n${install}(); })();` });
  };
  await load('SystemAnnouncementClient.js', 'installSystemAnnouncementClient');
  await load('AnnouncementPlainText20260905.js', 'installAnnouncementPlainText20260905');
  await page.evaluate(() => { window.app = new App(); app.bootstrap(); });
  const fallback = page.locator('#clbwz-system-announcement-fallback-20260908');
  assert.match(await fallback.textContent(), /欢迎/);
  await page.evaluate(() => {
    deliverAnnouncement({ id: 'craft', kind: 'craft-ascend', title: '造卡升变', text: '甲制作卡牌时触发升变！' });
    deliverAnnouncement({ id: 'streak', kind: 'win-streak', text: '乙已取得2连胜！' });
    deliverAnnouncement({ id: 'ended', kind: 'streak-ended', text: '甲终结了乙的2连胜！' });
    deliverAnnouncement({ id: 'streak', kind: 'win-streak', text: '乙已取得2连胜！' });
    window.dispatchEvent(new CustomEvent('clbwz:queue-system-announcement', { detail: { id: 'drop', kind: 'battle-drop', text: '获得宝石' } }));
  });
  assert.match(await fallback.textContent(), /触发升变/);
  assert.equal(await page.evaluate(() => announcementTimers.size), 1);
  await page.evaluate(() => expireAnnouncement());
  assert.match(await fallback.textContent(), /取得2连胜/);
  await page.evaluate(() => {
    document.querySelector('#screen').innerHTML = '<div class="classic-system-broadcast hidden" hidden><span class="classic-broadcast-label"></span><div class="classic-broadcast-window"><span class="classic-broadcast-track"></span></div></div>';
    app.navigate('main');
  });
  await page.waitForFunction(() => !document.getElementById('clbwz-system-announcement-fallback-20260908'));
  assert.equal(await page.locator('.classic-system-broadcast').isVisible(), true);
  assert.match(await page.locator('.classic-broadcast-track').textContent(), /取得2连胜/);
  const startsVisible = await page.evaluate(() => {
    const text = document.querySelector('.classic-broadcast-item').getBoundingClientRect();
    const windowRect = document.querySelector('.classic-broadcast-window').getBoundingClientRect();
    return text.left < windowRect.right && text.right > windowRect.left;
  });
  assert.equal(startsVisible, true, 'live text must be on-screen before its expiry');
  await page.evaluate(() => expireAnnouncement());
  assert.match(await page.locator('.classic-broadcast-track').textContent(), /终结/);
  await page.evaluate(() => { document.querySelector('#screen').style.display = 'none'; });
  await page.waitForFunction(() => document.getElementById('clbwz-system-announcement-fallback-20260908'));
  assert.match(await fallback.textContent(), /终结/);
  await page.evaluate(() => expireAnnouncement());
  assert.match(await fallback.textContent(), /获得宝石/);
  await page.evaluate(() => expireAnnouncement());
  assert.equal(await fallback.count(), 0);
  assert.equal(await page.evaluate(() => __clbwzLastSystemAnnouncement), null);
  assert.equal(await page.evaluate(() => announcementTimers.size), 0);
  await page.evaluate(() => {
    deliverAnnouncement({ id: 'logout-current', text: '当前播报' });
    deliverAnnouncement({ id: 'logout-queued', text: '排队播报' });
    authStore.token = ''; app.mount();
  });
  assert.equal(await fallback.count(), 0);
  assert.equal(await page.evaluate(() => announcementTimers.size), 0);
  const frameCount = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const frame = () => { if (++frames === 5) resolve(frames); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }));
  assert.equal(frameCount, 5);
  assert.deepEqual(errors, []);
  assert.ok(await page.evaluate(() => observerCallbacks < 50), 'DOM observer must settle instead of looping');
  console.log('PASS browser: welcome, queued ascension/streak/end/drop, duplicate event, live text visibility, route changes, hidden ancestor fallback, expiry, logout, responsive RAF');
} finally { await browser.close(); }
