import { spawn } from 'node:child_process';
import fs from 'node:fs';
const exe='C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile='W:/.gd/_video_work/chrome-profile';
fs.rmSync(profile,{recursive:true,force:true});
const url='file:///W:/.gd/_video_work/index.html';
const p=spawn(exe,['--headless=new','--remote-debugging-port=9222','--user-data-dir='+profile,'--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-dev-shm-usage','--window-size=1920,1080',url],{stdio:['ignore','pipe','pipe']});
p.stderr.on('data',d=>console.error('CHROMEERR',d.toString().slice(0,300)));
p.stdout.on('data',d=>console.log('CHROMEOUT',d.toString().slice(0,300)));
p.on('exit',(c,s)=>console.log('CHROME EXIT',c,s));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let list=null;
for(let i=0;i<50;i++){ await sleep(200); try{ const r=await fetch('http://127.0.0.1:9222/json/list'); list=await r.json(); if(list.length) break; }catch(e){} }
console.log('LIST',JSON.stringify(list));
if(!list||!list.length){p.kill();process.exit(1);}
const pageInfo=list.find(x=>x.type==='page')||list[0];
const ws=new WebSocket(pageInfo.webSocketDebuggerUrl);
let id=0; const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);} else if(m.method) console.log('EVENT',m.method);};
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
function send(method,params={}){return new Promise((res,rej)=>{const i=++id;pending.set(i,m=>m.error?rej(new Error(JSON.stringify(m.error))):res(m.result));ws.send(JSON.stringify({id:i,method,params}));});}
await send('Runtime.enable');
await sleep(1500);
let r=await send('Runtime.evaluate',{expression:`(()=>{const v=document.getElementById('v');return {href:location.href,ready:v.readyState,dur:v.duration,w:v.videoWidth,h:v.videoHeight,err:v.error&&v.error.message};})()`,returnByValue:true});
console.log('INFO',JSON.stringify(r.result.value));
await send('Page.enable');
const shot=await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync('W:/.gd/_video_work/cdp_shot.png',Buffer.from(shot.data,'base64'));
console.log('shot done');
ws.close(); p.kill();

