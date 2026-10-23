import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { Server } from 'socket.io';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
await import('../server/battle/PvpBattle.js');
const {getPvpCardDb}=await import('../server/battle/PvpCardDb.js');
const {roomManager}=await import('../server/rooms/RoomManager.js');
const {normalizeEndlessRoomRun,updateEndlessRoomDeck}=await import('../server/domain/EndlessRoomRun.js');
const {buildEndlessEncounter}=await import('../src/data/EndlessAdventureRules.js');
const {EndlessRoomBattle}=await import('../server/battle/EndlessRoomBattle.js');
const {registerPvpAuthorityHandlers,stopAllPvpAuthorityBattles,stopAuthorityBattleByRoom}=await import('../server/socket/registerPvpAuthorityHandlers.js');
const {installPvpGameplayFinal}=await import('../server/battle/PvpGameplayInstall.js');
const {installCoopBossOwnerResourceFinal}=await import('../server/battle/CoopBossOwnerResourceFinal.js');
const {installAuthorityRuleConvergence20260830}=await import('../server/battle/AuthorityRuleConvergence20260830.js');
const {installAuthorityPerformance20260905}=await import('../server/battle/AuthorityPerformance20260905.js');
installPvpGameplayFinal();installCoopBossOwnerResourceFinal();installAuthorityRuleConvergence20260830();installAuthorityPerformance20260905();
let battle;const tick=EndlessRoomBattle.prototype.tick;
EndlessRoomBattle.prototype.tick=function(dt){battle=this;return tick.call(this,dt);};
const db=getPvpCardDb(),user={id:987655,nickname:'隔离测试',level:1};
const owned=[{slotIndex:0,cardId:4,craftQuality:5,star:2,strengthLv:2},{slotIndex:1,cardId:11,craftQuality:4,star:3,strengthLv:3}];
const http=httpServer(),io=new Server(http,{cors:{origin:'*'}});
io.use((socket,next)=>{socket.user=user;next();});
io.on('connection',socket=>{
  socket.on('room:create',(payload,ack)=>{
    try{const endless=normalizeEndlessRoomRun(payload.endless,db,owned),encounter=buildEndlessEncounter(endless,db);
      const room=roomManager.createRoom({user:{...user,socketId:socket.id},mode:'pve',endless,
        stageId:endless.mode==='trial'?-20001:-20002,mapId:encounter.mapId,name:encounter.title});
      socket.join(`room:${room.id}`);ack({ok:true,room});
    }catch(error){ack({ok:false,message:error.message});}
  });
  socket.on('room:endless-deck',(payload,ack)=>{try{const room=roomManager.getRoomByUser(user.id);assert.equal(room.status,'waiting');assert.equal(room.endless.attempt,payload.attempt);room.endless=updateEndlessRoomDeck(room.endless,payload.entries,db,owned);ack({ok:true,endless:room.endless});}catch(error){ack({ok:false,message:error.message});}});
  socket.on('room:start',(_,ack)=>{try{const room=roomManager.markStarted(user.id);socket.emit('room:starting',{room});ack({ok:true,room});}catch(error){ack({ok:false,message:error.message});}});
  socket.on('room:leave',(_,ack)=>{const room=roomManager.getRoomByUser(user.id);if(room){stopAuthorityBattleByRoom(room.id);roomManager.leave(user.id);socket.leave(`room:${room.id}`);}ack({ok:true});});
});
registerPvpAuthorityHandlers(io,{cardDb:db});
await new Promise(resolve=>http.listen(5191,'127.0.0.1',resolve));
process.env.VITE_SOCKET_URL='http://127.0.0.1:5191';
const vite=await createServer({server:{host:'127.0.0.1',port:5190,strictPort:true,open:false,hmr:false}});await vite.listen();
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[],writes=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message);});
await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes.push(r.request().url());return r.fulfill({status:401,contentType:'application/json',body:'{}'});});
try{
  await page.goto('http://127.0.0.1:5190',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__clbwzAppInstance?.db,null,{timeout:120000});
  await page.evaluate(async()=>{
    const {authStore}=await import('/src/core/AuthStore.js');authStore.user={id:987655,nickname:'隔离测试'};authStore.isLoggedIn=()=>true;
    const {setPlayerStorageUser}=await import('/src/core/PlayerStorage20261010.js');setPlayerStorageUser('987655');
    const {gameSettings}=await import('/src/core/GameSettingsStore20260910.js');gameSettings.set('lobbyMusicIntroSeen',true);
    const app=globalThis.__clbwzAppInstance;app.root.replaceChildren(app.renderShell());
    window.__beforeBag=JSON.stringify(app.cardInventory.getSlots());
    window.__savedDecks=()=>JSON.stringify(Object.keys(localStorage).filter(k=>/battle_deck|room_deck|selected_deck/.test(k)).sort().map(k=>[k,localStorage.getItem(k)]));
    window.__beforeDecks=window.__savedDecks();
  });
  for(const mode of ['trial','expedition']){
    await page.evaluate(mode=>{const app=globalThis.__clbwzAppInstance;app.navigate('endless',{mode});const v=app.views.endless;v.start('balanced');if(v.run.phase!=='ready')v.commit({...v.run,phase:'ready'});v.render(v.root);},mode);
    await page.evaluate(owned=>{globalThis.__clbwzAppInstance.views.endless.cardInventory={getSlots:()=>owned};},owned);
    await page.screenshot({path:`scripts/output/endless-refresh-${mode}.png`});
    await page.locator('[data-battle]').click();
    await page.waitForFunction(()=>globalThis.__clbwzAppInstance.views.endless.child?.room,null,{timeout:30000});
    assert.equal(await page.locator('#lobby-room-inside .game-room').count(),1,'Use the existing multiplayer preparation UI, not a separate custom waiting page');
    const skip=page.locator('.asset-anim-loading__skip');if(await skip.isVisible())await skip.click();
    await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.child;r.refreshRoom({...r.room,members:r.room.members.map(m=>({...m,selectedDeckNo:3}))});});
    assert.equal(await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.child;return JSON.stringify(r.deckSelect._selected)===JSON.stringify(r.run.deck.map(uid=>r.run.roster.findIndex(c=>c.uid===uid)));}),true,'Room snapshots must not replace the run deck with saved account groups');
    assert.equal(await page.locator('.room-lobby-invite-btn-20260906:visible').count(),0);
    assert.equal(await page.locator('#lobby-room-inside .deck-tab:not([data-tab="default"]):visible').count(),0);
    assert.equal(await page.locator('#lobby-room-inside .team-btn:visible').count(),0);
    assert.equal(await page.locator('#lobby-room-inside .dice-btn:visible').count(),0);
    await page.screenshot({path:`scripts/output/endless-room-${mode}.png`});
    console.log('PASS existing preparation component',mode);
    if(mode==='trial'){
      await page.locator('#deck-slots-row [data-slot-idx="0"]').click();
      await page.locator('#drawer-cards [data-idx="6"]').click();
      await page.locator('[data-v3-action="cancel"]').click();
      assert.equal(await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.child;return r.run.roster.find(c=>c.uid===r.run.deck[0]).cardId;}),1);
      await page.locator('#deck-slots-row [data-slot-idx="0"]').click();
      await page.locator('#drawer-cards [data-idx="6"]').click();
      await page.locator('[data-v3-action="confirm"]').click();
      await page.waitForFunction(()=>{const r=globalThis.__clbwzAppInstance.views.endless.child;return r.run.roster.find(c=>c.uid===r.run.deck[0]).cardId===4;});
      assert.equal(roomManager.getRoomByUser(user.id).endless.roster[0].strengthLv,2);
      console.log('PASS room drawer cancel / confirm / owned instance synchronized to server');
    }
    await page.locator('#room-ready-btn').click();
    await page.waitForFunction(()=>globalThis.__clbwzAppInstance.views.endless.child?.roomBattleView?.__pvpLatestSnapshot?.protocol,null,{timeout:120000});
    const state=await page.evaluate(()=>{const r=globalThis.__clbwzAppInstance.views.endless.child,v=r.roomBattleView;return{roomId:r.room.id,members:r.room.members.length,endless:v.pvp.endless,authority:v.__pvpAuthorityActive,mapId:v.pvp.mapId};});
    assert.ok(state.roomId>0);assert.equal(state.members,1);assert.ok(state.endless&&state.authority);assert.equal(String(state.mapId),'2');
    await page.evaluate(async()=>{const v=globalThis.__clbwzAppInstance.views.endless.child.roomBattleView;await v.tryDeployAt(v.viewRoot,2,0,0);});
    await page.waitForFunction(()=>globalThis.__clbwzAppInstance.views.endless.child.roomBattleView.engine.units.some(u=>u.team==='player'),null,{timeout:15000});
    assert.ok(battle.engine.units.some(u=>u.team==='player'));
    const oldTime=battle.engine.time;await new Promise(r=>setTimeout(r,150));assert.ok(battle.engine.time>oldTime);
    battle.engine.enemyHeroHp=0;
    await page.waitForFunction(()=>globalThis.__clbwzAppInstance.views.endless.load().cleared===1,null,{timeout:20000});
    await page.evaluate(async()=>{await globalThis.__clbwzAppInstance.views.endless.child.exitBattle();});
    assert.equal(roomManager.getRoomByUser(user.id),null);
    console.log('PASS preparation -> real room -> authority deploy/snapshot -> win -> journey settlement -> leave',mode,state);
  }
  // Mid-run camps keep the shared preparation UI and consume only allowed swaps.
  for(const mode of ['trial','expedition']){
    await page.evaluate(({mode,owned})=>{
      const app=globalThis.__clbwzAppInstance;app.navigate('endless',{mode});const v=app.views.endless;
      v.start('balanced');v.cardInventory={getSlots:()=>owned};
      const r={...v.run,phase:'camp',cleared:mode==='trial'?5:0,floor:mode==='trial'?6:1,swapsLeft:1};
      if(mode==='expedition')r.roster.push({uid:'earned-card',cardId:4,craftQuality:2,strengthLv:0});
      v.commit(r);v.render(v.root);
    },{mode,owned});
    await page.locator('[data-battle]').click();
    await page.waitForFunction(()=>globalThis.__clbwzAppInstance.views.endless.child?.room);
    const skip=page.locator('.asset-anim-loading__skip');if(await skip.isVisible())await skip.click();
    await page.locator('#deck-slots-row [data-slot-idx="0"]').click();
    await page.locator('#drawer-cards [data-idx="6"]').click();
    await page.locator('[data-v3-action="confirm"]').click();
    await page.waitForFunction(()=>globalThis.__clbwzAppInstance.views.endless.load().swapsLeft===0);
    if(mode==='expedition'){
      await page.locator('#room-ready-btn').click();
      await page.waitForFunction(()=>!globalThis.__clbwzAppInstance.views.endless.child);
      assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().phase),'route');
      assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().step),2);
    }else{
      await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.child.exitBattle());
      assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().phase),'camp');
      assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().swapsLeft),0);
    }
    console.log('PASS camp preparation / saved swap budget / correct return phase',mode);
  }
  // Route/choice previews cannot spend resources before explicit confirmation.
  await page.evaluate(()=>{const v=globalThis.__clbwzAppInstance.views.endless;v.start('balanced');v.render(v.root);});
  await page.locator('[data-route]').first().click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().phase),'route');
  await page.locator('[data-choice-cancel]').click();
  assert.equal(await page.locator('[data-choice-confirm]').count(),0);
  await page.locator('[data-route]').first().click();await page.locator('[data-choice-confirm]').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().phase),'ready');
  await page.evaluate(()=>{const v=globalThis.__clbwzAppInstance.views.endless;v.commit({...v.run,phase:'event',baseHp:400,event:{kind:'neutral',variant:'caravan',bought:[]}});v.render(v.root);});
  await page.locator('[data-choice="caravan-pack"]').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().gold),60);
  await page.screenshot({path:'scripts/output/endless-refresh-event.png'});
  for(const [width,height] of [[1024,720],[390,844]]){
    await page.setViewportSize({width,height});
    await page.locator('[data-choice-cancel]').click();await page.locator('[data-choice="caravan-pack"]').click();
    const box=await page.locator('[data-choice-confirm]').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height);
    assert.equal(await page.evaluate(()=>{const p=document.querySelector('.endless-page');return p.scrollWidth<=p.clientWidth+1;}),true);
    await page.screenshot({path:`scripts/output/endless-refresh-event-${width}.png`});
  }
  await page.locator('[data-choice-confirm]').click();
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().gold),40);
  assert.equal(await page.evaluate(()=>globalThis.__clbwzAppInstance.views.endless.load().items.at(-1)),'pack');
  console.log('PASS route/event preview, cancel, confirm, 1024px and 390px responsive actions');
  assert.equal(await page.evaluate(()=>JSON.stringify(globalThis.__clbwzAppInstance.cardInventory.getSlots())===window.__beforeBag),true);
  assert.equal(await page.evaluate(()=>window.__savedDecks()===window.__beforeDecks),true,'Permanent saved decks unchanged');
  assert.equal(globalThis.__testDatabaseCalls||0,0,'No database settlement/talent writes');
  assert.deepEqual(writes,[],'No permanent inventory, deck, quest or stage-result writes');assert.deepEqual(errors,[]);
  console.log('PASS permanent data isolation and no browser errors');
}catch(error){console.log('DIAGNOSTIC',await page.evaluate(()=>({text:document.body.innerText.slice(-900),notice:globalThis.__clbwzAppInstance.views.endless?.notice,authority:globalThis.__clbwzAppInstance.views.endless?.child?.roomBattleView?.__pvpAuthorityActive})));throw error;
}finally{await browser.close();await vite.close();stopAllPvpAuthorityBattles();await new Promise(r=>io.close(r));}
