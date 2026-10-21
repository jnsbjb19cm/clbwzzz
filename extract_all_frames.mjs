import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const exe='C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile='W:/.gd/_video_work/chrome-profile-extract';
const outdir='W:/.gd/_video_work/frames_full';
fs.rmSync(profile,{recursive:true,force:true}); fs.rmSync(outdir,{recursive:true,force:true}); fs.mkdirSync(outdir,{recursive:true});
const url='file:///W:/.gd/_video_work/index.html';
const port=9226;
const p=spawn(exe,['--headless=new',`--remote-debugging-port=${port}`,'--user-data-dir='+profile,'--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--window-size=1920,1080',url],{stdio:['ignore','pipe','pipe']});
fs.writeFileSync('W:/.gd/_video_work/extract.log',`start ${new Date().toISOString()}\n`);
const log=(...a)=>{const s=a.join(' ')+'\n'; fs.appendFileSync('W:/.gd/_video_work/extract.log',s); console.log(s.trim());};
p.stderr.on('data',d=>{const s=d.toString(); if(!s.includes('DevTools') && !s.includes('gcm') && !s.includes('updater') && !s.includes('TensorFlow')) fs.appendFileSync('W:/.gd/_video_work/extract.log','CHROMEERR '+s.slice(0,500)+'\n');});
p.on('exit',(c,s)=>log('CHROME EXIT',c,s,new Date().toISOString()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let list=null;
for(let i=0;i<100;i++){ await sleep(150); try{ const r=await fetch(`http://127.0.0.1:${port}/json/list`); list=await r.json(); if(list.some(x=>x.type==='page'&&x.url.includes('index.html'))) break; }catch(e){} }
const pageInfo=list.find(x=>x.type==='page'&&x.url.includes('index.html'));
if(!pageInfo) throw new Error('no page');
const ws=new WebSocket(pageInfo.webSocketDebuggerUrl);
let id=0; const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
function send(method,params={}){return new Promise((res,rej)=>{const i=++id;pending.set(i,m=>m.error?rej(new Error(JSON.stringify(m.error))):res(m.result));ws.send(JSON.stringify({id:i,method,params}));});}
await send('Runtime.enable'); await send('Page.enable');
async function ev(expression, awaitPromise=false){const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;}
await sleep(1200);
const info=await ev(`(()=>{const v=document.getElementById('v');return {duration:v.duration,w:v.videoWidth,h:v.videoHeight,ready:v.readyState};})()`);
log('INFO',JSON.stringify(info));
const total=Math.round(info.duration*60);
for(let n=0;n<total;n++){
  const t=Math.min(n/60, info.duration-0.001);
  const res=await ev(`(async()=>{const v=document.getElementById('v'),c=document.createElement('canvas'); v.pause(); v.currentTime=${t}; await new Promise((resolve)=>{let done=false; const finish=()=>{if(done)return;done=true;resolve();}; v.addEventListener('seeked',()=>{ if(v.requestVideoFrameCallback) v.requestVideoFrameCallback(()=>finish()); setTimeout(finish,120); },{once:true}); setTimeout(finish,2500); }); c.width=v.videoWidth;c.height=v.videoHeight; const ctx=c.getContext('2d'); ctx.drawImage(v,0,0); return {url:c.toDataURL('image/png'),ct:v.currentTime};})()`,true);
  fs.writeFileSync(path.join(outdir,`frame_${n.toString().padStart(4,'0')}.png`),Buffer.from(res.url.split(',')[1],'base64'));
  if(n%30===0 || n===total-1) log('progress',n,'/',total,'ct',res.ct,new Date().toISOString());
}
fs.writeFileSync('W:/.gd/_video_work/frames.json',JSON.stringify({width:info.w,height:info.h,fps:60,total},null,2));
log('DONE',total,new Date().toISOString());
ws.close(); p.kill();
