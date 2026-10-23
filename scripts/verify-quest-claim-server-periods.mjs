import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Execute the real route with an in-memory transaction seam; never touch player databases.
const RealDate=Date;let now=Date.parse('2026-10-04T12:00:00Z'),gold=0,handler;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
const claims=new Map();const key=params=>params.slice(0,3).join('|');
const conn={async get(sql,params=[]){
 if(sql.includes('FROM player_quest_reward_claims'))return claims.get(key(params))||null;
 if(sql.includes('FROM player_profiles'))return {level:50,exp:0,gold};
 return null;
},async run(sql,params=[]){
 if(sql.includes('INSERT INTO player_quest_reward_claims'))claims.set(key(params),{claimed:1,claimedAt:new Date().toISOString(),claimed_at:new Date().toISOString()});
 if(sql.includes('SET gold=gold+'))gold+=params[0];
 return {changes:1};
}};
globalThis.__questRouteTest={Router:()=>({use(){},post(path,fn){handler=fn;}}),db:conn,withTransaction:fn=>fn(conn),requireAuth(){},findQuestReward:()=>({id:'daily-one',goal:1,gold:10}),grantPlayerExp(){},readPlayerItems20260908:async()=>[],readCardInventory:async()=>({slots:[]})};
try{
 let source=readFileSync('server/routes/questRewardAuthority20260908.js','utf8');
 source=source.replace(/^import .*;\r?\n/gm,'');
 // Keep optional shared period functions available when the production route imports them.
 const periodPath=new URL('../src/data/QuestPeriods.js',import.meta.url);
 let periods={};try{periods=await import(periodPath);}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
 Object.assign(globalThis.__questRouteTest,periods);
 source=`const {${Object.keys(globalThis.__questRouteTest).join(',')}}=globalThis.__questRouteTest;\n`+source;
 await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const call=async category=>{let status=200,body;await handler({user:{id:1},body:{category,questId:'daily-one'}},{status(code){status=code;return this;},json(value){body=value;return this;}});return {status,body};};
 assert.equal((await call('daily')).status,200);assert.equal(gold,10);
 assert.equal((await call('daily')).status,409);assert.equal(gold,10,'same-period retry cannot duplicate reward');
 now+=86400000;
 const next=await call('daily');console.log({nextDayStatus:next.status,message:next.body.message});
 assert.equal(next.status,200,'a completed daily quest must be claimable on the next day');assert.equal(gold,20);
 assert.equal((await call('weekly')).status,200);
 now+=7*86400000;assert.equal((await call('weekly')).status,200,'weekly rewards reset too');
 assert.equal((await call('main')).status,200);now+=86400000;assert.equal((await call('main')).status,409,'main quests never reset');
 const legacyKey='1|daily|daily-one';claims.set(legacyKey,{claimedAt:new Date().toISOString()});
 assert.equal((await call('daily')).status,409,'old-format same-day claim must not award twice after upgrade');
 now+=86400000;assert.equal((await call('daily')).status,200,'old-format claim must not block future days');
 console.log('PASS real reward handler: daily/weekly period renewal, same-period idempotency, permanent main claims');
}finally{globalThis.Date=RealDate;delete globalThis.__questRouteTest;}
