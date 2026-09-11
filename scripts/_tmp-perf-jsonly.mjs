import { chromium } from 'playwright';
const URL='http://127.0.0.1:5174/';
const b=await chromium.launch({channel:'chrome'}).catch(()=>chromium.launch({channel:'msedge'}));
const p=await b.newPage({viewport:{width:1400,height:900}});
await p.goto(URL,{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>Boolean(globalThis.__clbwzAppInstance),null,{timeout:30000});
await p.waitForTimeout(1500);
const out=await p.evaluate(async()=>{
  const pick=(re,fb)=>performance.getEntriesByType('resource').map(e=>e.name).filter(x=>re.test(x)).sort((a,c)=>c.length-a.length)[0]??fb;
  const {BattleEngine}=await import(pick(/\/src\/battle\/BattleEngine\.js(\?|$)/,'/src/battle/BattleEngine.js'));
  const {BattleRenderer}=await import(pick(/\/src\/battle\/BattleRenderer\.js(\?|$)/,'/src/battle/BattleRenderer.js'));
  const {BattleUnit}=await import(pick(/\/src\/battle\/BattleUnit\.js(\?|$)/,'/src/battle/BattleUnit.js'));
  const db=globalThis.__clbwzAppInstance.db;
  const cards=(db.getCollectibleCards?.()??[]).filter(c=>Number(c.type)===1&&!c.isActiveSkill?.());
  const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=900;document.body.append(canvas);
  const real=canvas.getContext('2d');
  // 把绘制调用打桩 → 只测 JS 逻辑开销（与 GPU/光栅无关）
  for(const m of ['drawImage','fill','stroke','save','restore','beginPath','ellipse','rect','fillRect','clearRect','setTransform','translate','scale','arc','fillText','rotate','closePath','moveTo','lineTo','clip','strokeRect'])
    if(typeof real[m]==='function') real[m]=()=>{};
  real.measureText=(s)=>({width:String(s||'').length*6});
  real.createRadialGradient=()=>({addColorStop(){}});
  real.createLinearGradient=()=>({addColorStop(){}});
  const res={};
  for(const n of [30,60,90,120]){
    const engine=new BattleEngine(db,1,[],null,{trainingMode:false,pvp:false,lootEnabled:true});
    engine.units=[];
    for(let i=0;i<n;i++){const u=new BattleUnit({card:cards[i%cards.length],lane:i%5,col:i%11,team:i%3===0?'enemy':'player',instance:{craftQuality:1+(i%5),strengthLv:i%6}});u.uid=10000+i;u.hp=u.maxHp=500;u.alive=true;engine.units.push(u);}
    const rd=new BattleRenderer(canvas);rd.fieldScale=1;
    for(const mode of ['anim','low']){
      if(mode==='anim'){rd.forceLowQuality=false;rd._lowQuality=false;}
      else{rd.forceLowQuality=true;}
      for(let i=0;i<15;i++){rd._lowQuality = mode==='low'?true:false; rd.draw(engine);}
      const t=[];
      for(let i=0;i<60;i++){for(const u of engine.units)u.alive=true; rd._lowQuality = mode==='low'?true:false; const t0=performance.now(); rd.draw(engine); t.push(performance.now()-t0);}
      const avg=t.reduce((s,v)=>s+v,0)/t.length;
      res[`n${n}_${mode}`]=+avg.toFixed(2);
    }
    res[`n${n}_lowFlag`]=rd._lowQuality===true;
  }
  return res;
});
console.log('JS-ONLY =',JSON.stringify(out,null,1));
await b.close();
