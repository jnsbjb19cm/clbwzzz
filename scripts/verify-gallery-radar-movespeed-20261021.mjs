/**
 * 2026-10-21 图鉴 · 双移速雷达图切换回归：
 * 飞鞋怪(#23)/跳跃大耳怪(#31) 在雷达图上有「首次攻击前 0.65 / 首次攻击后 0.5」两个移速档，
 * 图鉴详情需要出现切换按钮，切换后表格/雷达多边形跟随变化；普通卡不显示切换按钮。
 * 自带 vite 开发服务器，不依赖外部端口。
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5196, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

const snapshot = () => page.evaluate(() => {
  const radar = document.querySelector('.card-radar');
  const moveRow = [...document.querySelectorAll('.card-radar tbody tr')]
    .find(row => row.querySelector('th')?.textContent?.trim() === '移速');
  const switchEl = document.querySelector('.card-radar-move-switch');
  const stats = [...document.querySelectorAll('.gallery-detail-stats div')]
    .map(div => ({ label: div.querySelector('dt')?.textContent?.trim(), value: div.querySelector('dd')?.textContent?.trim() }));
  return {
    radarPresent: Boolean(radar),
    switch: switchEl ? {
      label: switchEl.querySelector('span')?.textContent?.trim(),
      buttons: [...switchEl.querySelectorAll('[data-radar-move]')].map(button => ({
        mode: button.dataset.radarMove,
        text: button.textContent.trim(),
        pressed: button.getAttribute('aria-pressed'),
        active: button.classList.contains('active'),
      })),
    } : null,
    moveCells: moveRow ? [...moveRow.querySelectorAll('td')].map(cell => ({ text: cell.textContent.trim(), title: cell.getAttribute('title') })) : null,
    moveRowLabel: moveRow?.querySelector('th')?.textContent?.trim() ?? null,
    polygons: [...document.querySelectorAll('.card-radar .radar-series')].map(polygon => polygon.getAttribute('points')),
    stats,
    note: document.querySelector('.card-radar-note')?.textContent?.trim() ?? '',
  };
});

async function selectCard(cardId, compareId = null) {
  await page.evaluate(({ cardId, compareId }) => {
    const gallery = globalThis.__clbwzAppInstance.views.gallery;
    gallery.compareCardId = compareId;
    gallery.renderDetail(gallery.root, globalThis.__clbwzAppInstance.db.getById(cardId));
  }, { cardId, compareId });
  await page.waitForTimeout(150);
  return snapshot();
}

try {
  await page.goto('http://127.0.0.1:5196/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const { authStore } = await import('/src/core/AuthStore.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    const { gameSettings } = await import('/src/core/GameSettingsStore20260910.js');
    gameSettings.set('lobbyMusicIntroSeen', true);
    authStore.user = { id: 'gallery-radar-test', nickname: '图鉴测试' };
    setPlayerStorageUser('gallery-radar-test');
    const app = globalThis.__clbwzAppInstance;
    app.root.replaceChildren(app.renderShell());
    app.navigate('gallery');
  });
  await page.waitForFunction(() => document.querySelector('.gallery-page') && globalThis.__clbwzAppInstance?.views?.gallery?.root, { timeout: 60000 });
  // 大厅音乐介绍弹窗是一次性引导，会挡住图鉴点击，测试环境先关掉。
  await page.evaluate(() => document.querySelector('.lobby-music-intro')?.remove());

  const flyer = await selectCard(23);
  assert.ok(flyer.radarPresent, '雷达图未渲染');
  assert.ok(flyer.switch, `飞鞋怪应显示双移速切换栏，实际 ${flyer.switch}`);
  assert.deepEqual(flyer.switch.buttons.map(button => button.mode), ['beforeFirstAttack', 'afterFirstAttack']);
  assert.ok(flyer.switch.buttons[0].text.includes('0.65'), `默认档应显示 0.65：${flyer.switch.buttons[0].text}`);
  assert.equal(flyer.switch.buttons[0].pressed, 'true');
  assert.equal(flyer.switch.buttons[1].pressed, 'false');
  assert.ok(flyer.moveCells?.[0]?.text.includes('0.65'), `表格移速应显示 0.65：${JSON.stringify(flyer.moveCells)}`);
  assert.ok(flyer.moveCells?.[0]?.title?.includes('首次攻击前') && flyer.moveCells[0].title.includes('首次攻击后'), '移速单元格悬停应同时给两档提示');
  const statsRow = flyer.stats.find(row => row.label === '移速');
  assert.ok(statsRow?.value.includes('0.65 → 0.5'), `详情移速应显示两段：${statsRow?.value}`);
  assert.ok(flyer.note.includes('两段移速'), '雷达说明应提示双移速可切换');
  const beforePolygon = flyer.polygons[0];
  await page.screenshot({ path: 'scripts/output/gallery-radar-before-20261021.png' });

  await page.locator('[data-radar-move="afterFirstAttack"]').click();
  await page.waitForTimeout(200);
  const afterClick = await snapshot();
  await page.screenshot({ path: 'scripts/output/gallery-radar-after-20261021.png' });
  assert.equal(afterClick.switch.buttons[1].pressed, 'true', '点击后「首次攻击后」应为选中态');
  assert.ok(afterClick.moveCells?.[0]?.text.includes('0.5'), `切换后表格移速应显示 0.5：${JSON.stringify(afterClick.moveCells)}`);
  assert.ok(afterClick.moveCells[0].text.includes('首次攻击后'));
  assert.notEqual(afterClick.polygons[0], beforePolygon, '切换移速档后雷达多边形应变化');
  console.log('PASS 飞鞋怪双移速切换', JSON.stringify({ before: flyer.moveCells, after: afterClick.moveCells }));

  // 跳跃大耳怪同款；普通移速卡不能出现切换栏。
  const jumper = await selectCard(31);
  assert.ok(jumper.switch, '跳跃大耳怪也应显示双移速切换栏');
  const balloon = await selectCard(7);
  assert.equal(balloon.switch, null, '普通卡不应出现双移速切换栏');
  assert.ok(balloon.moveCells?.[0]?.text.includes('0.5 格/秒'), `普通卡移速仍是单档：${balloon.moveCells?.[0]?.text}`);
  const staticCard = await selectCard(2);
  assert.ok(staticCard.moveCells?.[0]?.text.includes('0 格/秒'), `防御卡移速应为 0：${staticCard.moveCells?.[0]?.text}`);

  // 对比模式：飞鞋怪 vs 跳跃大耳怪，双档切换对两行同时生效。
  const compared = await selectCard(23, 31);
  assert.equal(compared.moveCells.length, 2, '对比模式应有两行移速数值');
  assert.ok(compared.moveCells.every(cell => cell.text.includes('首次攻击后')), `对比两行都应跟随当前档：${JSON.stringify(compared.moveCells)}`);
  console.log('PASS 对比模式与普通卡');

  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log(JSON.stringify({ passed: true }));
} finally {
  await browser.close();
  await server.close();
}
