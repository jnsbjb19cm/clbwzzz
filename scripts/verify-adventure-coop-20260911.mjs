import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import jwt from 'jsonwebtoken';
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'adventure-coop-'));
process.env.DB_CLIENT='sqlite'; process.env.DATABASE_PATH=path.join(dir,'db.sqlite'); process.env.JWT_SECRET='adventure-test';
const { db } = await import('../server/database.js');
const { CoopBossBattle } = await import('../server/battle/CoopBossBattle.js');
const { getPvpCardDb } = await import('../server/battle/PvpCardDb.js');
const { roomManager } = await import('../server/rooms/RoomManager.js');
const { registerSocketHandlers } = await import('../server/socket/registerSocketHandlers.js');
const { registerPvpAuthorityHandlers,stopAllPvpAuthorityBattles } = await import('../server/socket/registerPvpAuthorityHandlers.js');
const { settleAdventureBattle } = await import('../server/domain/adventureSettlement20260911.js');
for (const [file,fn] of [
  ['battle/PvpGameplayInstall.js','installPvpGameplayFinal'],
  ['battle/CoopBossOwnerResourceFinal.js','installCoopBossOwnerResourceFinal'],
  ['battle/AuthorityRuleConvergence20260830.js','installAuthorityRuleConvergence20260830'],
  ['rooms/RoomBossRound2Fix.js','installRoomBossRound2Fix'],
]) (await import(`../server/${file}`))[fn]();
for(let id=1;id<=4;id++) {
  await db.run('INSERT INTO users(id,username,password_hash) VALUES(?,?,?)',[id,`p${id}`,'x']);
  await db.run('INSERT INTO player_profiles(user_id,nickname,gold) VALUES(?,?,100)',[id,`队友${id}`]);
  await db.run('INSERT INTO player_card_bags(user_id,slot_count) VALUES(?,200)',[id]);
}
const battles = new Map(); const tick=CoopBossBattle.prototype.tick;
CoopBossBattle.prototype.tick=function(dt){battles.set(this.roomId,this);return tick.call(this,dt);};
const server=http.createServer(); const io=new Server(server);
registerSocketHandlers(io);registerPvpAuthorityHandlers(io,{cardDb:getPvpCardDb()});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const clients=[];
const once=(socket,event,predicate=()=>true)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{socket.off(event,handler);reject(Error(`timeout ${event}`));},5000);
 const handler=data=>{if(predicate(data)){clearTimeout(timer);socket.off(event,handler);resolve(data);}};socket.on(event,handler);
});
const ack=(socket,event,payload={})=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,payload,(err,data)=>err?reject(err):resolve(data)));
const ok=async(...args)=>{const data=await ack(...args);assert.equal(data.ok,true,JSON.stringify(data));return data;};
async function client(id){const c=connect(`http://127.0.0.1:${server.address().port}`,{auth:{token:jwt.sign({id},process.env.JWT_SECRET)},transports:['websocket'],forceNew:true});clients.push(c);await once(c,'connect');return c;}
try {
 const a=await client(1),b=await client(2),c=await client(3),d=await client(4);
 assert.equal((await ack(a,'room:create',{mode:'pve',stageId:999999})).ok,false);
 const {room}=await ok(a,'room:create',{mode:'pve',stageId:1,mapId:999,name:'forged',enemyRandomMode:true});
 assert.equal(room.mapId,'1');assert.notEqual(room.name,'forged');assert.equal(room.enemyRandomMode,true);
 await ok(b,'room:join',{roomId:room.id,preferredTeam:'red'});await ok(c,'room:join',{roomId:room.id});
 assert.equal((await ack(d,'room:join',{roomId:room.id})).ok,false);
 assert.equal((await ack(a,'room:start')).ok,false,'all teammates must ready');
 await ok(b,'room:ready',{ready:true});await ok(c,'room:ready',{ready:true});await ok(a,'room:start');
 const first=once(a,'pvp:authority:snapshot');await ok(a,'pvp:authority:join');const initial=await first;
 assert.equal(initial.mode,'pve');assert.equal(initial.stageId,1);assert.equal(initial.viewerTeam,'blue');
 await ok(b,'pvp:authority:join');await ok(c,'pvp:authority:join');
 const placed=await ok(a,'pvp:authority:deploy',{cardId:5,lane:0,col:0});
 const allyState=once(b,'pvp:authority:snapshot',s=>s.units.some(u=>u.ownerUserId===1));
 const seen=await allyState;assert.equal(seen.units.find(u=>u.ownerUserId===1).uid,placed.result.unit.uid);
 assert.ok(seen.resources.food>placed.snapshot.resources.food,'individual food balances');
 assert.equal((await ack(d,'pvp:authority:deploy',{cardId:5,lane:0,col:0})).ok,false);
 b.disconnect();const b2=await client(2);const resumed=once(b2,'pvp:authority:snapshot');await ok(b2,'pvp:authority:join');assert.equal((await resumed).stageId,1);
 await once(a,'pvp:authority:snapshot',s=>s.t>0);
 const battle=battles.get(room.id);assert.ok(battle);
 assert.ok(battle.engine.wave.queue.length,'actual adventure waves retained');
 const finishA=once(a,'pvp:authority:finished'),finishB=once(b2,'pvp:authority:finished'),finishC=once(c,'pvp:authority:finished');
 battle.engine.enemyHeroHp=0;
 const results=await Promise.all([finishA,finishB,finishC]);
 assert.ok(results.every(r=>r.winner==='blue' && r.adventureResult?.firstClear));
 assert.equal(roomManager.getRoom(room.id).status,'finished');
 for(const id of [1,2,3]) assert.equal(Number((await db.get('SELECT clear_count FROM player_stage_progress WHERE user_id=? AND stage_id=?',[id,'1'])).clear_count),1);
 assert.equal(await db.get('SELECT * FROM player_stage_progress WHERE user_id=4'),undefined,'nonparticipant gets no reward');
 const goldBefore=(await db.get('SELECT gold FROM player_profiles WHERE user_id=1')).gold;
 await ok(a,'pvp:authority:join'); assert.equal((await db.get('SELECT gold FROM player_profiles WHERE user_id=1')).gold,goldBefore,'rejoin does not settle twice');
 const solo=new CoopBossBattle({roomId:999,members:[{userId:4}],db:getPvpCardDb(),stageId:2});
 for(let i=0;i<600;i++)solo.tick(1/30);
 assert.ok(solo.engine.units.some(u=>u.team==='enemy'),'server spawns stage enemies');
 solo.engine.heroHp=0;solo.tick(1/30);assert.equal(solo.winner,'red');
 const loss=await settleAdventureBattle('loss',solo,solo.members);assert.equal(loss[4].firstClear,false);assert.equal(loss[4].persistedDrops.length,0);
 const balance=(await db.get('SELECT gold FROM player_profiles WHERE user_id=4')).gold;
 await settleAdventureBattle('loss',solo,solo.members);assert.equal((await db.get('SELECT gold FROM player_profiles WHERE user_id=4')).gold,balance,'durable settlement idempotency');
 const boss=new CoopBossBattle({roomId:998,members:[{userId:1}],db:getPvpCardDb(),bossId:'boss_dot',difficulty:'简单'});boss.tick(1/30);assert.equal(boss.snapshot().mode,'boss');assert.ok(boss.snapshot().boss);
 console.log('PASS adventure: real 3-client sockets, room metadata, readiness/capacity, shared deploys, independent resources, reconnect, waves, victory/loss, personal rewards, nonparticipant exclusion, idempotency, BOSS regression');
} finally {
 stopAllPvpAuthorityBattles();for(const socket of clients)socket.disconnect();
 await new Promise(resolve=>io.close(resolve));
 for(const room of roomManager.rooms.values())for(const member of room.members.values())clearTimeout(member.disconnectTimer);
 await db.close?.();fs.rmSync(dir,{recursive:true,force:true});
}
