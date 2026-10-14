import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.route('**/api/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__clbwzAppInstance && window.__renderPvpWildernessBattleFixture);
  await page.evaluate(()=>window.__renderPvpWildernessBattleFixture({mapId:1}));
  const result=await page.evaluate(async()=>{
    const v=window.__pvpFixtureBattle; v.stopLoop?.();document.body.classList.add('battle-immersive');
    const {BattleUnit}=await import('/src/battle/BattleUnit.js');
    const {unitAnimPlayer}=await import('/src/battle/UnitAnimPlayer.js');
    await Promise.all([1,2,15].map(id=>unitAnimPlayer.awaitReady(String(v.db.getById(id).spriteRes))));
    const e=v.engine,r=v.renderer,results=[];
    e.projectiles=[];e.floats=[];e.__pvpAuthorityFloats=[];e.impactFx=[];e.skillFx=[];
    const methods=['computeUnitLayout','drawUnits','drawUnitSprite','drawStatusEffects','drawUnitUi','ensureSprites','drawSkillFx'];
    const totals={};const originals={};
    for(const name of methods){originals[name]=r[name];r[name]=function(...args){const t=performance.now();try{return originals[name].apply(this,args);}finally{totals[name]=(totals[name]||0)+performance.now()-t;}};}
    let reads=0;const oldRect=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(){reads++;return oldRect.call(this);};
    try {
      for(const [count,status] of [[12,'none'],[72,'none'],[72,'slow'],[72,'poison']]) {
        e.units=Array.from({length:count},(_,i)=>new BattleUnit({card:v.db.getById([1,2,15][i%3]),lane:i%5,col:(i%10)+.02*(i/10),team:i%2?'enemy':'player'}));
        for(const u of e.units){u._spawnFadeDur=0;if(status==='slow')u.slowedUntil=99999;if(status==='poison')u.dots=[{kind:'poison',until:99999,dps:1}];}
        for(let i=0;i<5;i++){e.time+=.016;r.draw(e);await new Promise(requestAnimationFrame);}
        for(const name of methods)totals[name]=0;reads=0;const frames=[];
        for(let i=0;i<35;i++){e.time+=.016;const t=performance.now();r.draw(e);frames.push(performance.now()-t);await new Promise(requestAnimationFrame);}
        frames.sort((a,b)=>a-b);
        results.push({count,status,mean:frames.reduce((a,b)=>a+b,0)/frames.length,p95:frames[Math.floor(frames.length*.95)],rectReadsPerFrame:reads/35,phases:Object.fromEntries(Object.entries(totals).map(([k,n])=>[k,n/35]))});
      }
    }finally{Element.prototype.getBoundingClientRect=oldRect;for(const n of methods)r[n]=originals[n];v.destroy();}
    return results;
  });
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
