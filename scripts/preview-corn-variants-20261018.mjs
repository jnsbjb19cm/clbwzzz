import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'resources/img/oldsprite');
const specs=[
 ['待机','玉米炮手待机图.png',8,15],
 ['A · 攻击','玉米炮手攻击.png',8,5],
 ['B · 攻击1','玉米炮手攻击1.png',10,7],
 ['C · 攻击2','玉米炮手攻击2.png',7,4],
 ['D · 攻击图3','玉米炮手攻击图3.png',8,5],
];
const variants=[];
for(const [label,file,cols,rows] of specs){
 const bytes=fs.readFileSync(path.join(source,file));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const frames=[];let emptyTail=false;
 // These newer attack sheets have uneven gutters: equal division cuts leaves.
 const xCounts=new Uint32Array(info.width),yCounts=new Uint32Array(info.height);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>20){xCounts[x]++;yCounts[y]++;}
 function divisions(counts,n){
  const bands=[];let start=-1;
  for(let i=0;i<=counts.length;i++){
   if(counts[i]>0&&start<0)start=i;
   if(!(counts[i]>0)&&start>=0){bands.push([start,i-1]);start=-1;}
  }
  assert.equal(bands.length,n,`${file}: verify gutter count before slicing`);
  return [0,...bands.slice(1).map((b,i)=>Math.round((bands[i][1]+b[0]+1)/2)),counts.length];
 }
 const irregular=file!=='玉米炮手待机图.png'&&file!=='玉米炮手攻击1.png';
 const xs=irregular?divisions(xCounts,cols):Array.from({length:cols+1},(_,i)=>Math.round(i*info.width/cols));
 const ys=irregular?divisions(yCounts,rows):Array.from({length:rows+1},(_,i)=>Math.round(i*info.height/rows));
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x=xs[col],y=ys[row],w=xs[col+1]-x,h=ys[row+1]-y;
  const bounds={left:w,top:h,right:-1,bottom:-1};let opaque=0;
  for(let v=0;v<h;v++)for(let u=0;u<w;u++)if(data[((y+v)*info.width+x+u)*4+3]>20){
   opaque++;bounds.left=Math.min(bounds.left,u);bounds.top=Math.min(bounds.top,v);
   bounds.right=Math.max(bounds.right,u);bounds.bottom=Math.max(bounds.bottom,v);
  }
  if(!opaque){emptyTail=true;continue;}
  assert.ok(!emptyTail,`${file}: interior blank frame`);
  frames.push({x,y,w,h,bounds:{...bounds,opaque}});
 }
 variants.push({label,file,frames,width:info.width,height:info.height,image:'data:image/png;base64,'+bytes.toString('base64')});
}

// Only the idle sheet is replaced. The attack sheet and its timing stay untouched
// while the user compares the alternatives. Original source PNG bytes are kept.
const metaPath=path.join(root,'assets/sprites/unit_anim/70.json');
const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));
const oldAttack=JSON.stringify(meta.animations.attacking);
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const attackPath=path.join(root,'assets/sprites/unit_anim/70.attacking.png');
const attackHash=hash(attackPath);
const idle=variants[0];assert.equal(idle.frames.length,120);
assert.ok(idle.frames.every(f=>f.w===314&&f.h===314));
const cycle=meta.animations.default.frames.length/meta.animations.default.frameRate;
meta.source='oldsprite-idle-20261018-attack-pending-selection';
meta.animations.default={frameRate:idle.frames.length/cycle,frames:idle.frames,loop:true};
meta.uniformBounds=[...idle.frames,...meta.animations.attacking.frames].reduce((b,{bounds:f})=>({
 left:Math.min(b.left,f.left),top:Math.min(b.top,f.top),right:Math.max(b.right,f.right),bottom:Math.max(b.bottom,f.bottom),
}),{left:320,top:320,right:0,bottom:0});
meta.drawFootY.default=(Math.max(...idle.frames.map(f=>f.bounds.bottom))+1)/meta.frameH;
fs.copyFileSync(path.join(source,idle.file),path.join(root,'assets/sprites/unit_anim/70.png'));
fs.writeFileSync(metaPath,JSON.stringify(meta,null,2)+'\n');
assert.equal(JSON.stringify(meta.animations.attacking),oldAttack);
assert.equal(hash(attackPath),attackHash);
assert.equal(hash(path.join(root,'assets/sprites/unit_anim/70.png')),hash(path.join(source,idle.file)));

const template=fs.readFileSync(path.join(root,'scripts/corn-variants-preview.html'),'utf8');
const output=process.argv[2];assert.ok(output,'Provide an output HTML path');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,template.replace('/*VARIANT_DATA*/[]',JSON.stringify(variants)));
console.log(JSON.stringify({variants:variants.map(({label,file,frames})=>({label,file,frames:frames.length})),idleCycle:cycle,uniformBounds:meta.uniformBounds,attackUnchanged:true,output},null,2));
