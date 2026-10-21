// Mechanical import: copy supplied PNG bytes unchanged and describe their cells.
// No repainting, resampling, alpha thresholding, or changes to card gameplay data.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'resources/img/oldsprite');
const output=path.join(root,'assets/sprites');
const TILE=320,COLS=10;
async function framesFor(file){
 const {data,info}=await sharp(path.join(source,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,COLS*TILE);assert.equal(info.height%TILE,0);
 const frames=[];let tail=false;
 for(let y=0;y<info.height;y+=TILE)for(let x=0;x<info.width;x+=TILE){
  const bounds={left:TILE,top:TILE,right:-1,bottom:-1};let opaque=0;
  for(let v=0;v<TILE;v++)for(let u=0;u<TILE;u++)if(data[((y+v)*info.width+x+u)*4+3]>20){
   opaque++;bounds.left=Math.min(bounds.left,u);bounds.top=Math.min(bounds.top,v);
   bounds.right=Math.max(bounds.right,u);bounds.bottom=Math.max(bounds.bottom,v);
  }
  if(!opaque){tail=true;continue;}
  assert.ok(!tail,`${file}: unexpected blank frame inside the sequence`);
  frames.push({x,y,w:TILE,h:TILE,bounds:{...bounds,opaque}});
 }
 return frames;
}
const idle=await framesFor('玉米炮手网页版待机.png');
const attack=await framesFor('玉米炮手攻击.png');
assert.equal(idle.length,117);assert.equal(attack.length,61);
const uniformBounds=[...idle,...attack].reduce((b,{bounds:f})=>({
 left:Math.min(b.left,f.left),top:Math.min(b.top,f.top),right:Math.max(b.right,f.right),bottom:Math.max(b.bottom,f.bottom),
}),{left:TILE,top:TILE,right:0,bottom:0});
// Retain old 70's total attack length (30/24s) and release time (15/24s).
const attackSeconds=30/24,releaseSeconds=15/24;
const attackFps=attack.length/attackSeconds;
const meta={res:70,source:'oldsprite-20261016',frameW:TILE,frameH:TILE,uniformBounds,
 drawFootY:{default:313/TILE,attacking:313/TILE},footOpaqueInset:0,scaleBoost:1.12,
 usePerFrameBounds:false,flying:false,hasSkeletonShadow:false,hpAnims:[],attackHpAnims:[],
 stateSheets:{default:'70.png',attacking:'70.attacking.png'},
 animations:{
  default:{frameRate:idle.length/(30/8.4),frames:idle,loop:true},
  attacking:{frameRate:attackFps,frames:attack,loop:false,releaseFrame:releaseSeconds*attackFps,
   releaseSource:'original-sheet-retimed-to-existing-70-release'},
 },parabolaReleaseFrame:releaseSeconds*attackFps};
for(const [name,destination] of [
 ['玉米炮手静态图.png','cards/70.png'],['玉米炮手静态图.png','units/70.png'],
 ['玉米炮手网页版待机.png','unit_anim/70.png'],['玉米炮手攻击.png','unit_anim/70.attacking.png'],
])fs.copyFileSync(path.join(source,name),path.join(output,destination));
fs.writeFileSync(path.join(output,'unit_anim/70.json'),JSON.stringify(meta,null,2)+'\n');
console.log({idleFrames:idle.length,attackFrames:attack.length,uniformBounds,attackSeconds,releaseSeconds,sourcePixels:'unchanged'});
