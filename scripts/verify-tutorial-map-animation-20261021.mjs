/**
 * 2026-10-21 回归验证：
 * 1) 新手教程地图必须是草地（grassbg.png + 蘑菇柱），不能是训练营的黄沙兜底；
 * 2) 新手教程里的卡牌动画不能是 6 次/秒的量化更新（固定步长累加器带来的低帧率错觉），
 *    这里用「战斗画布每秒实际变了几次」对比"只喂 engine.time"的旧行为来量化。
 * 自带 vite 开发服务器，不依赖外部端口。
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5183, strictPort: true, open: false, hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let checks = 0;
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

try {
  await page.goto('http://127.0.0.1:5183/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const { NEW_PLAYER_TUTORIAL_MARKER, getTutorialDeckSlots } = await import('/src/tutorial/TutorialConfig.js');
    const app = globalThis.__clbwzAppInstance;
    app.root.replaceChildren(app.renderShell());
    app.navigate('battle', {
      training: true, trainingFreeRes: false, trainingMap: 'grass',
      deckSlots: getTutorialDeckSlots(app.db, 6), tryUsage: NEW_PLAYER_TUTORIAL_MARKER,
    });
  });
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.views?.battle?.engine && document.querySelector('.new-player-tutorial-panel'), null, { timeout: 120000 });
  await page.waitForTimeout(900);

  const movement=await page.evaluate(async()=>{
    const view=globalThis.__clbwzAppInstance.views.battle,e=view.engine;
    const {BattleUnit}=await import('/src/battle/BattleUnit.js');
    view.stopLoop();
    const savedUnits=e.units,savedTime=e.time;
    const results=[];
    for(const draws of [0,5,26]){
      const u=new BattleUnit({card:view.db.getById(3),lane:2,col:1,team:'player'});
      u.hp=u.maxHp=1e7;e.units=[u];e.time=20;e.status='playing';e._simulationRemainder=0;
      for(let step=0;step<10;step++){
        e.tick(.155);
        const col=u.col;
        for(let frame=0;frame<draws;frame++){
          e._simulationRemainder=.155*(frame+1)/(draws+1);
          e.animationTime=e.time+e._simulationRemainder;
          view.renderer.draw(e);
          if(u.col!==col)throw new Error('Tutorial render changed logical movement: '+col+' -> '+u.col);
        }
      }
      results.push({draws,col:u.col});
    }
    e.units=savedUnits;e.time=savedTime;e.animationTime=savedTime;e._simulationRemainder=0;
    // Repeated starts must leave one drawing loop, not three.
    const original=view.renderer.draw;
    let renders=0,rafFrames=0,running=true;
    view.renderer.draw=function(...args){renders++;return original.apply(this,args);};
    const count=()=>{if(running){rafFrames++;requestAnimationFrame(count);}};
    requestAnimationFrame(count);view.startLoop();view.startLoop();view.startLoop();
    await new Promise(resolve=>setTimeout(resolve,600));
    running=false;view.stopLoop();view.renderer.draw=original;view.startLoop();
    return {results,renders,rafFrames};
  });
  assert.ok(movement.results[0].col>1,'Tutorial runner must actually move');
  assert.equal(movement.results[0].col,movement.results[1].col);
  assert.equal(movement.results[0].col,movement.results[2].col);
  assert.ok(Math.abs(movement.renders-movement.rafFrames)<=2,'Repeated starts must not multiply rendering work');
  console.log('PASS tutorial speed independent of drawing frequency, one RAF loop',JSON.stringify(movement));

  const scene = await page.evaluate(() => {
    const view = globalThis.__clbwzAppInstance.views.battle;
    const style = document.querySelector('.battle-game-wrap')?.style;
    return {
      trainingMap: view.trainingMap,
      back: style?.getPropertyValue('--ice-back-url') || '',
      left: style?.getPropertyValue('--ice-left-url') || '',
      bgGrass: style?.getPropertyValue('--bg-grass') || '',
    };
  });
  assert.match(scene.back, /resources\/background\/grassbg\.png/, `教程背景必须是草地grassbg.png，实际 ${scene.back}`);
  assert.match(scene.left, /mushroomleft/, `教程左柱必须是草地蘑菇柱，实际 ${scene.left}`);
  assert.doesNotMatch(scene.back, /backrock|grassbg\.jpg/, '教程不能再使用黄沙/旧 jpg 背景');
  assert.equal(scene.trainingMap, 'grass');
  console.log('PASS tutorial uses the grass map', JSON.stringify(scene));

  // 2026-10-21：教程聚光灯改用「四块纯色遮罩」，不再用 9999px 巨型 box-shadow。
  // 这里校验遮罩结构在多分辨率下都能正确围出高亮框、且不再有巨型阴影（低端设备掉帧根因之一）。
  const spotlight = async () => page.evaluate(() => {
    const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const focus = document.querySelector('.new-player-tutorial-focus');
    return {
      display: focus ? getComputedStyle(focus).display : null,
      shadow: focus ? getComputedStyle(focus).boxShadow : null,
      parts: [rect('.tutorial-shade-top'), rect('.tutorial-shade-bottom'), rect('.tutorial-shade-left'), rect('.tutorial-shade-right')],
      focusRect: rect('.new-player-tutorial-focus'),
      vw: innerWidth, vh: innerHeight,
    };
  });
  await page.evaluate(() => {
    const controller = globalThis.__clbwzAppInstance.views.battle.__newPlayerTutorial;
    controller.enterStep(1); // 部署步骤：手牌/场地会亮聚光灯
  });
  await page.waitForTimeout(600);
  for (const [w, h] of [[1440, 900], [1280, 720], [800, 600]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    const info = await spotlight();
    const label = `spotlight@${w}x${h}`;
    assert.doesNotMatch(String(info.shadow), /9999px/, `${label}: 仍在使用巨型阴影 ${info.shadow}`);
    assert.equal(info.display, 'block', `${label}: 聚光灯没有显示`);
    const [top, bottom, left, right] = info.parts;
    assert.ok(top && bottom && left && right, `${label}: 遮罩四块不完整`);
    assert.ok(top.h < 1e4 && bottom.h < 1e4 && left.w < 1e4 && right.w < 1e4, `${label}: 遮罩尺寸异常`);
    assert.ok(Math.abs(bottom.y - (info.focusRect.y + info.focusRect.h)) < 2, `${label}: 底部遮罩没贴住高亮框`);
    assert.ok(Math.abs(right.x - (info.focusRect.x + info.focusRect.w)) < 2, `${label}: 右侧遮罩没贴住高亮框`);
    assert.ok(top.h + info.focusRect.h + bottom.h >= h - 4, `${label}: 竖直方向没有铺满视口`);
    assert.ok(left.w + info.focusRect.w + right.w >= w - 4, `${label}: 水平方向没有铺满视口`);
    checks += 1;
  }
  console.log('PASS tutorial spotlight uses cheap shade panels at multiple resolutions');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  // 教程第 1 步只有同步出现的静态防守单位，画布变化节奏一致、区分度低；
  // 进入最终自由放置步骤并部署 3 张教学卡，动画相位不同，测量更接近真实观感。
  await page.evaluate(async () => {
    const view = globalThis.__clbwzAppInstance.views.battle;
    const controller = view.__newPlayerTutorial;
    controller.enterStep(controller.steps.findIndex((step) => step.mode === 'win'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    view.engine.tutorialPlacementLocked = false;
    view.engine.tutorialPlacementRule = null;
    for (const [lane, col, hand] of [[2, 1, 0], [1, 1, 1], [3, 1, 2]]) {
      try { await view.engine.deploy(lane, col, hand); } catch { /* 资源/冷却不足时忽略 */ }
    }
  });

  const measure = async (simulateHead, ms = 2000) => page.evaluate(async ({ simulateHead, ms }) => {
    const view = globalThis.__clbwzAppInstance.views.battle;
    const engine = view.engine;
    const { unitAnimPlayer } = await import('/src/battle/UnitAnimPlayer.js');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const originalDraw = unitAnimPlayer.draw;
    const targetUid=engine.units.find(u=>u.alive)?.uid;
    const times=new Set();
    let draws=0;
    unitAnimPlayer.draw = function measuredAnimation(ctx, unit, eng, ...args) {
        const saved = eng?.animationTime;
        if (simulateHead && eng) eng.animationTime = undefined;
        if(unit.uid===targetUid){times.add(eng.animationTime??eng.time);draws++;}
        try { return originalDraw.call(this, ctx, unit, eng, ...args); } finally { if (eng) eng.animationTime = saved; }
    };
    // Observe this unit's actual animation clock, not whole-canvas hashes:
    // smooth projectiles/movement also change the canvas even with a broken pose clock.
    await new Promise((resolve) => setTimeout(resolve, ms));
    unitAnimPlayer.draw = originalDraw;
    return { updatesPerSec: +(times.size / (ms / 1000)).toFixed(2), rafPerSec: +(draws / (ms / 1000)).toFixed(1), units: engine.units.length };
  }, { simulateHead, ms });

  const current = await measure(false);
  const legacy = await measure(true);
  assert.ok(current.units >= 4, `教程应有单位在播动画，实际 ${current.units}`);
  assert.ok(current.updatesPerSec >= 25, `教程动画更新过低：${current.updatesPerSec}/s`);
  assert.ok(current.updatesPerSec >= legacy.updatesPerSec * 2.5, `动画应比旧行为流畅 2.5 倍以上：${current.updatesPerSec} vs ${legacy.updatesPerSec}`);
  console.log('PASS tutorial card animations advance smoothly', JSON.stringify({ current, legacy }));

  // 教程固定草地不能误伤训练营自己的背景选择：rock/ice 仍按玩家选择生效。
  const trainingMaps = await page.evaluate(async () => {
    const B = await import('/src/battle/BattleBackground.js');
    return ['grass', 'rock', 'ice'].map((key) => {
      const bg = B.resolveBattleBackground({ stage_type: 1 }, { trainingMode: true, trainingMap: key });
      return { key, scene: bg.sceneKey, base: bg.baseUrl };
    });
  });
  assert.deepEqual(trainingMaps.map((item) => item.scene), ['grass', 'rock', 'ice']);
  assert.match(trainingMaps[1].base, /backrock\.png/);
  assert.match(trainingMaps[2].base, /backice\.png/);
  console.log('PASS training map choices still resolve', JSON.stringify(trainingMaps));
  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`);
  console.log(JSON.stringify({ checks, passed: true }));
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  await browser.close();
  await server.close();
}
