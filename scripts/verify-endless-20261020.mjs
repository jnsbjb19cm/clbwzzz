import assert from 'node:assert/strict';
import * as R from '../src/data/EndlessAdventureRules.js';
import { EndlessRunStore } from '../src/core/EndlessRunStore.js';
await import('../server/battle/PvpBattle.js');
const { CardDatabase } = await import('../src/core/CardDatabase.js');
const { createEndlessBattle } = await import('../src/battle/EndlessBattleAdapter.js');
const db = new CardDatabase();
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
const trial = seed => R.createEndlessRun({ mode: 'trial', seed });
const expedition = seed => R.createEndlessRun({ mode: 'expedition', seed });
function win(run, hp = 900) { const b = R.beginRunBattle(run); return R.settleRunBattle(b, { attempt: b.attempt, won: true, baseHp: hp }); }
function event(kind, extra = {}) { return { ...expedition('event'), phase: 'event', event: { kind, bought: [] }, ...extra }; }
test('all starter and reserve cards are collectible', () => {
  for (const team of R.STARTER_TEAMS) for (const id of [...team.cards, ...team.reserve]) assert.ok(db.getById(id)?.isCollectible(), String(id));
});
test('owned cards are independent snapshots', () => {
  const cards = [{cardId:1, craftQuality:5, star:2, strengthLv:2, attributeRoll:{atk:4}}];
  const before = JSON.stringify(cards), r = R.createEndlessRun({mode:'trial',seed:'owned',starter:'owned',ownedDeck:cards});
  r.roster[0].attributeRoll.atk=999; assert.equal(JSON.stringify(cards),before); assert.equal(r.roster[0].star,2);
});
test('1000 floors: mixed valid enemies, bounded counts and deterministic encounters', () => {
  let previous = 0;
  for (let floor=1;floor<=1000;floor++) {
    const r={...trial('scale'),floor}, e=R.buildEndlessEncounter(r,db);
    assert.ok(e.total>=previous && e.total<=100); previous=e.total;
    assert.equal(e.roster.length,e.total); assert.equal(e.aliveCap,24);
    assert.equal(new Set(e.roster.map(x=>db.getById(x.cardId).category)).size,2);
    assert.ok(e.roster.every(x=>db.getById(x.cardId).isCollectible()&&x.lane>=0&&x.lane<5&&x.col>=7&&x.col<=10));
    assert.ok(Number.isFinite(e.atkScale)&&Number.isFinite(e.hpScale));
    assert.deepEqual(R.buildEndlessEncounter(r,db),e);
  }
});
test('camp exactly after five wins, only one valid swap, optional repair once', () => {
  let r=trial('five'); for(let i=1;i<=5;i++){r=win(r,500);assert.equal(r.phase,i===5?'camp':'ready');}
  const uid=r.roster.find(c=>!r.deck.includes(c.uid)).uid;
  const original=r.deck[0]; r=R.swapRunCard(r,0,uid); assert.equal(r.deck[0],uid);
  assert.throws(()=>R.swapRunCard(r,0,original)); r=R.repairTrialCamp(r); assert.equal(r.baseHp,780);
  assert.throws(()=>R.repairTrialCamp(r)); r=R.leaveRunCamp(r); assert.equal(r.floor,6); assert.equal(r.phase,'ready');
});
test('settlement rejects duplicates and stale attempts; defeat ends a run', () => {
  const b=R.beginRunBattle(trial('repeat')), done=R.settleRunBattle(b,{attempt:b.attempt,won:true,baseHp:500});
  assert.throws(()=>R.settleRunBattle(done,{attempt:b.attempt,won:true,baseHp:500}));
  const retry=R.beginRunBattle({...b,phase:'ready',attempt:null}); assert.notEqual(retry.attempt,b.attempt);
  assert.throws(()=>R.settleRunBattle(retry,{attempt:b.attempt,won:true,baseHp:500}));
  assert.equal(R.settleRunBattle(b,{attempt:b.attempt,won:false,baseHp:10}).phase,'ended');
  assert.equal(R.settleRunBattle(b,{attempt:b.attempt,won:true,baseHp:0}).phase,'ended');
});
test('all seven event types and three random outcomes are reachable without refresh rerolls', () => {
  const kinds=new Set(), outcomes=new Set();
  for(let i=0;i<300;i++){
    const r=expedition('routes-'+i), routes=R.runRoutes(r);
    assert.deepEqual(R.runRoutes(JSON.parse(JSON.stringify(r))),routes);
    for(const route of routes){kinds.add(route.kind);if(route.kind==='random'){
      const a=R.chooseRunRoute(r,route.id);outcomes.add(a.event.kind);assert.deepEqual(R.chooseRunRoute(r,route.id),a);
    }}
  }
  assert.equal(kinds.size,7); assert.equal(outcomes.size,3);
  assert.deepEqual(R.runRoutes({...expedition('x'),sinceCombat:2}).map(x=>x.kind),['battle']);
  assert.deepEqual(R.runRoutes({...expedition('x'),step:5}).map(x=>x.kind),['battle']);
});
test('events: affordability, single claim, stock limits, health and reserve cards', () => {
  let r=event('shop');const original=JSON.stringify(r);
  assert.throws(()=>R.resolveRunEvent({...r,gold:0},'fang',[1]));
  r=R.resolveRunEvent(r,'fang',[1]);assert.equal(r.gold,20);assert.deepEqual(r.items,['fang']);
  assert.throws(()=>R.resolveRunEvent(r,'fang',[1]));assert.equal(JSON.stringify(event('shop')),original);
  r=R.resolveRunEvent(r,'leave',[1]);assert.equal(r.phase,'route');
  assert.throws(()=>R.resolveRunEvent(r,'leave',[1]));
  r=R.resolveRunEvent(event('reward'),'card',[17]);assert.equal(r.roster.at(-1).cardId,17);assert.equal(r.deck.length,6);
  r=R.resolveRunEvent(event('neutral',{baseHp:500}),'heal',[1]);assert.equal(r.baseHp,700);assert.equal(r.gold,35);
  assert.equal(R.resolveRunEvent(event('negative',{baseHp:20}),'wound',[1]).baseHp,1);
  assert.deepEqual(R.resolveRunEvent(event('negative'),'thorn',[1]).items,['thorn']);
  assert.throws(()=>R.resolveRunEvent(event('reward',{items:Array(12).fill('fang')}),'flask',[1]));
  const full=event('reward',{roster:Array.from({length:60},(_,i)=>({uid:'x'+i,cardId:1}))});
  assert.throws(()=>R.resolveRunEvent(full,'card',[1]));
});
test('modifiers use additive capped effects, random results persist', () => {
  const mods=R.runModifiers({...trial('m'),items:['fang','ember','pack','thorn']});
  assert.ok(Math.abs(mods.atk-1.23)<1e-8); assert.ok(Math.abs(mods.hp-.82)<1e-8);assert.equal(mods.resource,6);
  const result=R.resolveRunEvent(event('reward'),'flask',[1]);assert.equal(result.items.length,1);assert.notEqual(result.items[0],'flask');
  assert.deepEqual(R.resolveRunEvent(event('reward'),'flask',[1]),result);
});
test('local storage isolates accounts and rejects stale-owner writes/corrupt saves', () => {
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};let active='A';
  const a=new EndlessRunStore('A',{storage,currentOwner:()=>active});a.save(trial('A'));
  active='B';const b=new EndlessRunStore('B',{storage,currentOwner:()=>active});assert.deepEqual(b.read().runs,{});
  b.save(expedition('B'));assert.throws(()=>a.save(trial('wrong')));assert.equal(b.read().runs.expedition.seed,'B');
  data.set(b.key,'null');assert.throws(()=>b.read());data.set(b.key,'{');assert.throws(()=>b.read());
  data.set(b.key,JSON.stringify({version:1,owner:'B'}));assert.throws(()=>b.read());
});
test('real engine uses local copies, run modifiers, zero permanent rewards and full preload roster', () => {
  const base=trial('engine');base.items=['fang','bark','pack'];const before=JSON.stringify(base),originalAtk=db.getById(1).atk;
  const {engine,encounter,inventory}=createEndlessBattle(db,base);
  assert.equal(JSON.stringify(base),before);assert.equal(db.getById(1).atk,originalAtk);assert.equal(engine.lootEnabled,false);
  assert.equal(engine.stage.adventure,undefined);assert.equal(engine.skillLoadout.filter(Boolean).length,0);
  assert.ok(Math.abs(engine.deck[0].card.atk-originalAtk*1.05)<1e-8);
  assert.equal(engine.heroHp,base.baseHp);assert.equal(inventory.getSlots().length,10);
  for(const row of encounter.roster)assert.ok(engine.getBattleSpriteRes().has(String(db.getById(row.cardId).spriteRes)));
  engine.wave.tick(6);assert.equal(engine.units.filter(u=>u.team==='enemy').length,1);
});
test('blocked spawns are retried, alive cap respected, queue clears before victory', () => {
  const {engine,encounter}=createEndlessBattle(db,{...trial('cap'),floor:30});
  const place=engine.placeEnemyUnit;engine.placeEnemyUnit=()=>false;engine.wave.tick(10);assert.equal(engine.wave.queue.length,encounter.total);
  engine.placeEnemyUnit=place;
  for(let i=0;i<100;i++)engine.wave.tick(2);
  assert.ok(engine.units.filter(u=>u.alive&&u.team==='enemy').length<=24);assert.ok(engine.wave.queue.length>0);
  const savedUnits=engine.units, queued=engine.wave.queue.length;
  engine.units=Array.from({length:24},()=>({alive:true,team:'enemy'}));engine.wave.tick(2);
  assert.equal(engine.wave.queue.length,queued);engine.units=savedUnits;
  for(let i=0;i<120;i++){for(const u of engine.units){u.hp=0;u.alive=false;}engine.wave.tick(2);}
  for(const u of engine.units){u.hp=0;u.alive=false;}assert.equal(engine.wave.done,true);engine.checkEnd();assert.equal(engine.status,'win');
});
test('actual engine ticks and times out safely', () => {
  const {engine,encounter}=createEndlessBattle(db,trial('time'));
  for(let i=0;i<420;i++)engine.tick(1/60);assert.ok(engine.units.some(u=>u.team==='enemy'));
  engine.time=encounter.durationLimit;engine.checkEnd();assert.equal(engine.status,'lose');
});
console.log(JSON.stringify({passed}));
