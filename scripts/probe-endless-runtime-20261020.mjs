import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5182,strictPort:true,open:false}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.route('**/api/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.text().startsWith('[probe]'))console.log(m.text());});
try{
 await page.goto('http://127.0.0.1:5182',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__clbwzAppInstance);
 const report=await page.evaluate(async()=>{
  const app=globalThis.__clbwzAppInstance,db=app.db;
  const {authStore}=await import('/src/core/AuthStore.js');const {setPlayerStorageUser}=await import('/src/core/PlayerStorage20261010.js');
  authStore.user={id:'isolated-runtime-probe'};setPlayerStorageUser(authStore.user.id);
  const {gameSettings}=await import('/src/core/GameSettingsStore20260910.js');gameSettings.set('lobbyMusicIntroSeen',true);
  app.root.replaceChildren(app.renderShell());
  const R=await import('/src/data/EndlessAdventureRules.js');const {createEndlessBattle}=await import('/src/battle/EndlessBattleAdapter.js');
  const B=await import('/src/battle/BattleBackground.js');const {unitAnimPlayer}=await import('/src/battle/UnitAnimPlayer.js');const {BattleUnit}=await import('/src/battle/BattleUnit.js');
  const run=R.createEndlessRun({mode:'trial',seed:'probe'}),battle=createEndlessBattle(db,run);
  const result={borrowedPool:run.roster.map(c=>c.cardId),catalogCount:db.getCollectibleCards().length,endlessScene:B.resolveBattleBackground(battle.engine.stage),tutorialUrl:B.PROVIDED_GRASS_BACKGROUND_URL};
  app.navigate('endless',{mode:'trial'});let v=app.views.endless;v.commit(run);v.render(v.root);await v.launchBattle();let view=v.child;
  console.log('[probe] battle loaded');
  const measure=async(view,label)=>{
   view.stopLoop();const e=view.engine;
   await unitAnimPlayer.preload(new Set(['1','3','19','22']));
   const samples=[];
   for(const count of [20,100,200]){
    e.units=Array.from({length:count},(_,i)=>{const u=new BattleUnit({card:db.getById(i%3===0?22:i%3===1?19:1),lane:i%5,col:i%2?7:3,team:i%2?'enemy':'player'});u.hp=u.maxHp=u.baseMaxHp=1e7;u.tempAtkBonus=2;u.tempAtkUntil=1e6;return u;});
    e.time=10;e.projectiles=[];view.renderer._summonVisuals=null;
    e.heroHp=e.enemyHeroHp=100000;e.status='playing';
    const calls={};const restored=[];
    for(const name of ['getUnitsAt','getEnemiesInLane','updateBuffs','refreshAuraBuffs','isValidEnemyTarget'])if(typeof e[name]==='function'){
      const original=e[name];e[name]=function(...args){calls[name]=(calls[name]||0)+1;return original.apply(this,args);};restored.push(()=>e[name]=original);
    }
    const t=performance.now();for(let i=0;i<20;i++)e.tick(.155);const tick=(performance.now()-t)/20;
    for(let i=0;i<5;i++)view.renderer.draw(e);
    const phases={},undo=[];for(const key of ['drawUnits','drawUnitSprite','drawUnitName','drawUnitAura','drawUnitHalo','drawFloats','drawSkillFx','ensureSprites','computeUnitLayout'])if(typeof view.renderer[key]==='function'){const f=view.renderer[key];view.renderer[key]=function(...args){const t=performance.now();try{return f.apply(this,args);}finally{phases[key]=(phases[key]||0)+performance.now()-t;}};undo.push(()=>view.renderer[key]=f);}
    const d=performance.now();for(let i=0;i<20;i++)view.renderer.draw(e);const draw=(performance.now()-d)/20;
    undo.forEach(f=>f());restored.forEach(f=>f());samples.push({count,alive:e.units.filter(u=>u.alive).length,tick,draw,calls,phases});
   }
   return {label,samples};
  };
  result.performance=await measure(view,'normal');
  console.log('[probe] performance '+JSON.stringify(result.performance));
  view.destroy();v.child=null;
  const {getTutorialDeckSlots,NEW_PLAYER_TUTORIAL_MARKER}=await import('/src/tutorial/TutorialConfig.js');
  app.navigate('battle',{training:true,tryUsage:NEW_PLAYER_TUTORIAL_MARKER,deckSlots:getTutorialDeckSlots(db)});
  view=app.views.battle;await new Promise((resolve,reject)=>{const deadline=Date.now()+45000;const poll=()=>view.renderer&&view.__newPlayerTutorial?resolve():Date.now()>deadline?reject(new Error('Tutorial init timeout')):setTimeout(poll,50);poll();});view.stopLoop();
  result.tutorialScene=B.resolveBattleBackground(view.engine.stage,{trainingMap:view.trainingMap}).baseUrl;
  const unit=new BattleUnit({card:db.getById(1),lane:2,col:1,team:'player'});view.engine.units=[unit];unitAnimPlayer.resetClock(unit);
  const pack=unitAnimPlayer.ready.get('1');const states=[];
  view.engine.time=10;view.renderer._summonVisuals=null;
  for(let i=0;i<60;i++){view.engine.time=10+i/60;view.renderer.draw(view.engine);states.push([...unitAnimPlayer.clocks.entries()].filter(([k])=>k.startsWith(unit.uid+':')));}
  result.tutorialAnimation={frames:60,endClock:states.at(-1),sampleRate:pack?.meta?.animations?.default?.frameRate};
  const observed=[];const originalDraw=unitAnimPlayer.draw;unitAnimPlayer.draw=function(ctx,u,e,...args){if(u.uid===unit.uid)observed.push(e.animationTime??e.time);return originalDraw.call(this,ctx,u,e,...args);};
  const t0=view.engine.time;view.startLoop();await new Promise(resolve=>setTimeout(resolve,1100));view.stopLoop();unitAnimPlayer.draw=originalDraw;result.tutorialTimeElapsed=view.engine.time-t0;
  result.tutorialAnimation.distinctTimes=new Set(observed).size;result.tutorialAnimation.draws=observed.length;
  view.destroy();return result;
 });
 console.log(JSON.stringify(report,null,2));console.log('PAGE_ERRORS',errors);
 let failures=0;for(const [name,fn]of [
  ['trial roster is valid and non-empty',()=>{assert.ok(report.borrowedPool.length>0);assert.ok(report.borrowedPool.every(id=>Number.isInteger(id)));assert.equal(new Set(report.borrowedPool).size,report.borrowedPool.length);}],
  // 2026-10-21 用户要求：无尽和教程都用 PVE 草地（同一张 grassbg.png），不再要求两者不同。
  ['endless uses the same PVE grass map as tutorial',()=>assert.equal(report.endlessScene.baseUrl,report.tutorialUrl)],
  ['tutorial animation advances at real-time rate',()=>assert.ok(report.tutorialTimeElapsed>.8&&report.tutorialTimeElapsed<1.5)],
  ['tutorial animation is not quantized to six updates per second',()=>assert.ok(report.tutorialAnimation.distinctTimes>=15)],
 ]){try{fn();console.log('PASS',name);}catch(e){failures++;console.log('FAIL',name,e.message);}}
 process.exitCode=failures?1:0;
}finally{await browser.close();await server.close();}
