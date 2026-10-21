import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5186,strictPort:true,open:false,hmr:false}});
await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage();
const errors=[],writes=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',route=>{if(route.request().method()!=='GET')writes.push(route.request().url());return route.fulfill({status:401,contentType:'application/json',body:'{"error":"isolated-test"}'});});
try{
  await page.goto('http://127.0.0.1:5186',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__clbwzAppInstance,{timeout:60000});
  await page.evaluate(async()=>{
    const {authStore}=await import('/src/core/AuthStore.js');
    const {setPlayerStorageUser}=await import('/src/core/PlayerStorage20261010.js');
    const {gameSettings}=await import('/src/core/GameSettingsStore20260910.js');
    gameSettings.set('lobbyMusicIntroSeen',true);
    authStore.user={id:'endless-test-A',nickname:'单人玩法测试'};
    setPlayerStorageUser('endless-test-A');
    const app=globalThis.__clbwzAppInstance;app.root.replaceChildren(app.renderShell());
    globalThis.__clbwzAppInstance.navigate('endless',{mode:'trial'});
  });
  // 大厅音乐介绍弹窗属于一次性引导，会挡住后面从港口进无尽模式的点击；先关掉。
  await page.evaluate(()=>document.querySelector('.lobby-music-intro')?.remove());
  await page.locator('[data-start="balanced"]').click();
  await page.evaluate(()=>{
    const inventory=globalThis.__clbwzAppInstance.cardInventory;
    const bag=Array.from({length:65},()=>({cardId:1,craftQuality:2,star:0}));
    bag[64]={cardId:70,craftQuality:5,strengthLv:2,star:0};
    inventory.getSlots=()=>bag; // isolated fixture; never touch a real account
  });
  const permanentBefore=await page.evaluate(()=>JSON.stringify(globalThis.__clbwzAppInstance.cardInventory.getSlots()));
  await page.locator('[data-prepare]').click();
  await page.locator('[data-slot-button="3"]').click();
  await page.locator('[data-camp-search]').fill('70');
  await page.locator('[data-camp-filter]').click();
  assert.equal(await page.locator('[data-camp-card]').count(),1);
  await page.locator('[data-camp-card="bag:64"]').click();
  await page.locator('[data-swap]').click();
  const copied=await page.evaluate(()=>{const v=globalThis.__clbwzAppInstance.views.endless;return v.card(v.run.deck[3]);});
  assert.equal(copied.cardId,70);assert.equal(copied.craftQuality,5);assert.equal(copied.strengthLv,2);
  assert.equal(await page.evaluate(()=>JSON.stringify(globalThis.__clbwzAppInstance.cardInventory.getSlots())),permanentBefore);
  await page.screenshot({path:'scripts/output/endless-camp-20261021.png'});
  await page.locator('[data-leave-camp]').click();
  console.log('PASS setup swap from full own bag beyond slot 60: perfect +2 preserved, inventory unchanged');
  await page.locator('[data-battle]').waitFor();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.deck.length),6);
  await page.screenshot({path:'scripts/output/endless-trial-20261020.png',fullPage:true});
  console.log('PASS trial setup',await page.locator('.endless-panel h2').textContent());
  await page.locator('[data-battle]').click();
  await page.waitForFunction(()=>document.querySelector('.endless-battle-return')||document.querySelector('.endless-error'),{timeout:120000});
  console.log('BATTLE',await page.evaluate(()=>({error:document.querySelector('.endless-error')?.textContent,child:!!globalThis.__clbwzAppInstance.views.endless?.child,canvas:!!document.querySelector('#battle-canvas'),body:document.body.className})));
  assert.equal(await page.locator('.endless-error').count(),0);
  // 2026-10-21 用户：双无尽模式必须用 PVE 的草地地图，不许退回新手教程/训练营的黄沙图。
  const endlessMap=await page.evaluate(()=>{
    const wrap=document.querySelector('.battle-game-wrap');const style=wrap?.style;
    return {back:style?.getPropertyValue('--ice-back-url')||'',left:style?.getPropertyValue('--ice-left-url')||'',
      bgGrass:style?.getPropertyValue('--bg-grass')||''};
  });
  assert.match(endlessMap.back,/grassbg\.png/,'无尽战斗背景必须是草地(PVE)地图');
  assert.match(endlessMap.left,/mushroomleft/,'无尽战斗左柱必须是草地蘑菇柱');
  assert.doesNotMatch(endlessMap.back,/backrock|grassbg\.jpg/,'无尽战斗不得使用新手教程黄沙图/旧 jpg 草地图');
  console.log('PASS endless battle uses the PVE grass map');
  const deployed=await page.evaluate(async()=>{
    const child=globalThis.__clbwzAppInstance.views.endless.child;
    await child.engine.deploy(2,1,0);
    for(let i=0;i<45;i++)child.engine.tick(.155);
    return {players:child.engine.units.filter(u=>u.team==='player').length,enemies:child.engine.units.filter(u=>u.team==='enemy').length};
  });
  assert.ok(deployed.players>0 && deployed.enemies>0);
  await page.screenshot({path:'scripts/output/endless-battle-20261020.png',fullPage:true});
  await page.evaluate(()=>{const c=globalThis.__clbwzAppInstance.views.endless.child;c.engine.enemyHeroHp=0;c.engine.checkEnd();c.updateResultOverlay(c.viewRoot);});
  await page.locator('#result-exit').click();
  assert.deepEqual(await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.run;return [r.phase,r.floor,r.cleared];}),['ready',2,1]);
  console.log('PASS actual deployment, victory settlement and return');
  // 第二批：可选赏金在真实战斗里结算（本场基地未受伤 → 达成，额外发远征币且不污染后续）。
  await page.locator('[data-bounty="flawless"]').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.bounty),'flawless');
  const goldBeforeBounty=await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.gold);
  await page.locator('[data-battle]').click();
  await page.locator('.endless-battle-return').waitFor({timeout:120000});
  await page.evaluate(()=>{const c=globalThis.__clbwzAppInstance.views.endless.child;c.engine.enemyHeroHp=0;c.engine.checkEnd();c.updateResultOverlay(c.viewRoot);});
  await page.locator('#result-exit').click();
  const afterBounty=await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.run;return {phase:r.phase,floor:r.floor,cleared:r.cleared,gold:r.gold,bounty:r.bounty,journal:r.journal.slice(0,4)};});
  assert.equal(afterBounty.bounty,null);
  assert.ok(afterBounty.gold>goldBeforeBounty+27,`赏金应额外发放金币：${goldBeforeBounty} -> ${afterBounty.gold}`);
  assert.ok(afterBounty.journal.some(line=>line.includes('赏金达成')));
  console.log('PASS optional bounty pays out on a flawless win',JSON.stringify(afterBounty));
  await page.evaluate(async()=>{
    const R=await import('/src/data/EndlessAdventureRules.js'),v=globalThis.__clbwzAppInstance.views.endless;
    let run=v.run;for(let i=0;i<3;i++){run=R.beginRunBattle(run);run=R.settleRunBattle(run,{attempt:run.attempt,won:true,baseHp:500});}
    v.commit(run);v.render(v.root);
  });
  const beforeSwap=await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.deck[0]);
  await page.locator('[data-slot-button="0"]').click();
  await page.locator('[data-camp-search]').fill('1');
  await page.locator('[data-camp-filter]').click();
  await page.locator('[data-camp-card="bag:0"]').click();
  await page.locator('[data-swap]').click();
  assert.notEqual(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.deck[0]),beforeSwap);
  assert.equal(await page.locator('[data-swap]').isDisabled(),true);
  await page.locator('[data-repair]').click();assert.equal(await page.locator('[data-repair]').isDisabled(),true);
  await page.locator('[data-leave-camp]').click();await page.locator('[data-battle]').waitFor();
  console.log('PASS fifth-floor camp: card swap and repair');
  // 第二批：五层侦察 + 可选赏金在开战前可见、可选、可取消。
  assert.equal(await page.locator('.endless-scout').count(),1,'开战前应显示五层侦察');
  assert.equal(await page.locator('.endless-bounty-options [data-bounty]').count(),3,'应有 3 项可选赏金');
  await page.locator('[data-bounty="spread"]').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.bounty),'spread');
  await page.locator('[data-bounty-clear]').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.bounty),null);
  await page.locator('[data-bounty="focused"]').click();
  await page.screenshot({path:'scripts/output/endless-bounty-20261021.png',fullPage:true});
  console.log('PASS five-floor scout + optional bounty selection');
  // 第二批：十层契约（每 10 战必选一项，发远征币并进入营地）。
  await page.evaluate(async()=>{
    const v=globalThis.__clbwzAppInstance.views.endless;
    v.commit({...v.run,phase:'contract',cleared:10,battles:10,floor:11,step:11});v.render(v.root);
  });
  await page.locator('[data-contract="mending"]').waitFor();
  assert.equal(await page.locator('[data-contract]').count(),3,'应有 3 项契约可选');
  await page.screenshot({path:'scripts/output/endless-contract-20261021.png',fullPage:true});
  const goldBeforeContract=await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.gold);
  await page.locator('[data-contract="mending"]').click();
  const contractState=await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.run;return {phase:r.phase,contracts:r.contracts,gold:r.gold,swapsLeft:r.swapsLeft};});
  assert.equal(contractState.phase,'camp');
  assert.deepEqual(contractState.contracts,['mending']);
  assert.equal(contractState.gold,goldBeforeContract+80);
  assert.equal(contractState.swapsLeft,1);
  assert.ok((await page.locator('.endless-contract-list').first().textContent()).includes('复苏之约'));
  console.log('PASS ten-floor contract: mandatory choice, gold reward, camp preserved');
  await page.locator('[data-mode="expedition"]').click();await page.locator('[data-start="balanced"]').click();
  await page.evaluate(async()=>{
    const R=await import('/src/data/EndlessAdventureRules.js'),v=globalThis.__clbwzAppInstance.views.endless;
    for(let i=0;i<100;i++){const run=R.createEndlessRun({mode:'expedition',seed:'shop-'+i});if(R.runRoutes(run).some(r=>r.kind==='shop')){run.gold=150;v.commit(run);break;}}
    v.render(v.root);
  });
  await page.screenshot({path:'scripts/output/endless-expedition-20261020.png',fullPage:true});
  await page.locator('.event-shop').click();await page.locator('[data-choice="fang"]').click();
  assert.equal(await page.locator('[data-choice="fang"]').isDisabled(),true);
  await page.locator('[data-choice="card"]').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.roster.length),7);
  await page.locator('[data-choice="leave"]').click();
  console.log('PASS expedition shop: buffs, reserve card, single-purchase stock');
  await page.locator('.event-battle').click();await page.locator('[data-battle]').click();
  await page.locator('.endless-battle-return').waitFor({timeout:120000});
  const buff=await page.evaluate(async()=>{
    const v=globalThis.__clbwzAppInstance.views.endless,c=v.child;
    await c.engine.deploy(2,1,0);const unit=c.engine.units.find(u=>u.team==='player');
    return {atk:unit.atk,base:v.db.getById(1).atk};
  });
  assert.ok(Math.abs(buff.atk-buff.base*1.1)<.011);
  const firstAttempt=await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.attempt);
  await page.locator('.endless-battle-return').click();await page.locator('[data-battle]').click();
  await page.locator('.endless-battle-return').waitFor({timeout:120000});
  assert.notEqual(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.attempt),firstAttempt);
  await page.evaluate(()=>{const c=globalThis.__clbwzAppInstance.views.endless.child;c.engine.heroHp=0;c.engine.checkEnd();c.updateResultOverlay(c.viewRoot);});
  await page.locator('#result-exit').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run.phase),'ended');
  assert.equal(await page.evaluate(()=>JSON.stringify(globalThis.__clbwzAppInstance.cardInventory.getSlots())),permanentBefore);
  console.log('PASS item affects real deployed unit, retry identity, defeat, unchanged permanent cards');
  await page.locator('[data-home]').click();await page.locator('[data-endless="trial"]').first().click();
  await page.waitForFunction(()=>['camp','ready','contract'].includes(globalThis.__clbwzAppInstance.views.endless?.run?.phase),{timeout:30000});
  const resumed=await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.run;return {floor:r.floor,cleared:r.cleared,phase:r.phase,contracts:r.contracts};});
  assert.equal(resumed.floor,11);
  assert.equal(resumed.cleared,10);
  assert.deepEqual(resumed.contracts,['mending']);
  console.log('PASS port entrance and persistent resume',JSON.stringify(resumed));
  await page.evaluate(async()=>{
    const {authStore}=await import('/src/core/AuthStore.js'),{setPlayerStorageUser}=await import('/src/core/PlayerStorage20261010.js');
    authStore.user={id:'endless-test-B'};setPlayerStorageUser('endless-test-B');
    globalThis.__clbwzAppInstance.navigate('endless',{mode:'trial'});
  });
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.run),null);
  console.log('PASS second account does not inherit the first account run');
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log('ERRORS',errors,'API_WRITES',writes);
}finally{await browser.close();await server.close();}
