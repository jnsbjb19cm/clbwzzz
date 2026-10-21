import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const exe='C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile='W:/.gd/_video_work/chrome-profile3';
const outdir='W:/.gd/_video_work/samples';
fs.rmSync(profile,{recursive:true,force:true}); fs.mkdirSync(outdir,{recursive:true});
const url='file:///W:/.gd/_video_work/index.html';
const p=spawn(exe,['--headless=new','--remote-debugging-port=9224','--user-data-dir='+profile,'--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--window-size=1920,1080',url],{stdio:['ignore','pipe','pipe']});
p.stderr.on('data',d=>{const s=d.toString(); if(!s.includes('DevTools')) console.error('CHROMEERR',s.slice(0,200));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let list=null;
for(let i=0;i<80;i++){ await sleep(150); try{ const r=await fetch('http://127.0.0.1:9224/json/list'); list=await r.json(); if(list.some(x=>x.type==='page'&&x.url.includes('index.html'))) break; }catch(e){} }
const pageInfo=list.find(x=>x.type==='page'&&x.url.includes('index.html'));
const ws=new WebSocket(pageInfo.webSocketDebuggerUrl);
let id=0; const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
function send(method,params={}){return new Promise((res,rej)=>{const i=++id;pending.set(i,m=>m.error?rej(new Error(JSON.stringify(m.error))):res(m.result));ws.send(JSON.stringify({id:i,method,params}));});}
await send('Runtime.enable'); await send('Page.enable');
async function ev(expression, awaitPromise=false){const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;}
await sleep(1000);
const info=await ev(`(()=>{const v=document.getElementById('v');return {duration:v.duration,w:v.videoWidth,h:v.videoHeight,ready:v.readyState};})()`);
console.log('INFO',JSON.stringify(info));
const times=[]; for(let t=0;t<info.duration;t+=0.5) times.push(Math.min(t, info.duration-0.02));
for(const t of times){
  const data=await ev(`(async()=>{const v=document.getElementById('v'),c=document.createElement('canvas'); v.currentTime=${t}; await new Promise((r,j)=>{let done=false; const ok=()=>{if(!done){done=true;r();}}; v.addEventListener('seeked',ok,{once:true}); setTimeout(ok,3000);}); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); c.width=v.videoWidth;c.height=v.videoHeight; c.getContext('2d').drawImage(v,0,0); return c.toDataURL('image/png');})()`,true);
  fs.writeFileSync(path.join(outdir,`sample_${t.toFixed(1).replace('.','_')}.png`),Buffer.from(data.split(',')[1],'base64'));
  console.log('saved',t);
}
ws.close(); p.kill();
