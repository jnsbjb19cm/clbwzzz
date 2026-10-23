import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5187,strictPort:true,open:false,hmr:false}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
await page.route('**/api/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
try{
 await page.goto('http://127.0.0.1:5187',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__clbwzAppInstance?.db,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
   const {authStore}=await import('/src/core/AuthStore.js');
   const {SmithyView}=await import('/src/ui/SmithyView.js');
   const app=globalThis.__clbwzAppInstance;
   authStore.isLoggedIn=()=>true;authStore.user={id:987654};
   let view;const render=SmithyView.prototype.render;
   SmithyView.prototype.render=function(...args){view=this;return render.apply(this,args);};
   authStore.api.get=async()=>({ok:true});
   let response={ok:true,result:'target',cardId:82,craftQuality:2};
   authStore.api.post=async(path)=>{if(path!=='/player/smithy/craft')throw Error('Unexpected write '+path);return response;};
   app.root.replaceChildren(app.renderShell());app.navigate('smithy');
   await new Promise(r=>setTimeout(r,100));
   const events=[];view.onQuestEvent=(event,data)=>events.push({event,...data});
   for(const value of [response,{ok:true,result:'fail'},{ok:true,result:'wrong',cardId:1,craftQuality:2}]){
     response=value;view.targetCardId=82;
     view.renderBody(app.root);
     const button=app.root.querySelector('#do-craft');if(!button)throw Error('Craft button missing');
     button.disabled=false;button.click();await new Promise(r=>setTimeout(r,80));
   }
   return events;
 });
 console.log(JSON.stringify(result));
 assert.equal(result.filter(e=>e.event==='card_obtain'&&e.cardId===82).length,1,'Successful manufacture of baby corn must count once');
 assert.equal(result.filter(e=>e.event==='card_obtain'&&e.cardId===1).length,1,'Wrong-result crafting must count the actual obtained card');
 assert.equal(result.filter(e=>e.event==='card_obtain').length,2,'Failed craft must not count');
 console.log('PASS actual authority craft button -> obtain events');
}finally{await browser.close();await server.close();}
