import assert from 'node:assert/strict';
import * as R from '../src/data/EndlessAdventureRules.js';
import { normalizeEndlessRoomRun, updateEndlessRoomDeck } from '../server/domain/EndlessRoomRun.js';
import { EndlessRunStore } from '../src/core/EndlessRunStore.js';
const db={getById:id=>({id, isCollectible:()=>Number(id)>0&&Number(id)<100})};
const owned=[{slotIndex:42,cardId:4,craftQuality:5,strengthLv:2},{slotIndex:88,cardId:11,craftQuality:4,strengthLv:3}];
const create=mode=>R.createEndlessRun({mode,seed:'refresh'});
let run=normalizeEndlessRoomRun(R.beginRunBattle(create('trial')),db,owned);
const selected=run.deck.map(uid=>run.roster.find(c=>c.uid===uid));
selected[0]={uid:'new-42',_ownedKey:'bag:42',cardId:99,strengthLv:99};
run=updateEndlessRoomDeck(run,selected,db,owned);
assert.equal(run.roster[0].cardId,4);assert.equal(run.roster[0].strengthLv,2);
assert.equal(run.roster[0].craftQuality,5);
assert.throws(()=>updateEndlessRoomDeck(run,[run.roster[0],run.roster[0]],db,owned));
assert.throws(()=>updateEndlessRoomDeck(run,[{uid:'wrong',_ownedKey:'bag:999'}],db,owned));
run={...run,cleared:5,preparation:{initial:false,swapsLeft:1}};
const swap=run.deck.map(uid=>run.roster.find(c=>c.uid===uid));swap[0]={uid:'new-88',_ownedKey:'bag:88'};
run=updateEndlessRoomDeck(run,swap,db,owned);assert.equal(run.preparation.swapsLeft,0);
assert.throws(()=>updateEndlessRoomDeck(run,selected,db,owned),/换卡机会/);
assert.throws(()=>updateEndlessRoomDeck(run,run.roster.slice(1),db,owned),/增减卡槽/);
assert.equal(updateEndlessRoomDeck(run,[...run.roster].reverse(),db,owned).preparation.swapsLeft,0);
let expedition=create('expedition');expedition.phase='ready';expedition.roster.push({uid:'reserve',cardId:17});
expedition=normalizeEndlessRoomRun({...R.beginRunBattle(expedition),preparation:{swapsLeft:1}},db,owned);
const reserveDeck=expedition.deck.map(uid=>expedition.roster.find(c=>c.uid===uid));reserveDeck[0]=expedition.roster.at(-1);
const changed=updateEndlessRoomDeck(expedition,reserveDeck,db,owned);
assert.equal(changed.deck[0],'reserve');assert.equal(changed.roster.length,7);
assert.throws(()=>updateEndlessRoomDeck(expedition,[{uid:'foreign',_ownedKey:'bag:42'}],db,owned),/储备/);
console.log('PASS owned attributes, off-deck bag slots, duplicate/expired ownership, reserve scope, swap budget');
for(const [variant,definition] of Object.entries(R.RUN_EVENTS)){
  const source={...create('expedition'),phase:'event',baseHp:400,gold:100,items:['thorn','fang'],event:{kind:definition.kind,variant,bought:[]}};
  const before=JSON.stringify(source);
  for(const choice of R.runEventChoices(source).filter(c=>!c.disabled)){
    const next=R.resolveRunEvent(source,choice.id,[1]);
    assert.equal(next.phase,'route');assert.equal(next.step,2);assert.ok(next.baseHp>0&&next.baseHp<=1000);assert.ok(next.gold>=0);
    assert.deepEqual(next,R.resolveRunEvent(source,choice.id,[1]));assert.throws(()=>R.resolveRunEvent(next,choice.id,[1]));
  }
  assert.equal(JSON.stringify(source),before);
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const store=new EndlessRunStore('test',{storage});store.save(source);assert.equal(store.read().runs.expedition.event.variant,variant);
}
const found=new Set();
for(let n=0;n<600;n++){
  const r=R.createEndlessRun({mode:'expedition',seed:`events-${n}`});
  for(const route of R.runRoutes(r)){const next=R.chooseRunRoute(r,route.id);if(next.event?.variant)found.add(next.event.variant);}
}
assert.equal(found.size,6);
console.log('PASS six reachable deterministic events, single claim, bounds, save reload, no mutation');
