// Mechanical conversion of the existing DragonBones layers, not image retouching.
import fs from 'node:fs';
import {XMLParser} from 'fast-xml-parser';
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:''});
const armatures=parser.parse(fs.readFileSync('assets/assets/dySkeletonXML/soldier_skeleton.xml','utf8')).dragonBones.armature;
const atlas=new Map(JSON.parse(fs.readFileSync('src/data/atlas/dyload_soldier.json')).sprites.map(s=>[s.name,s]));
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const number=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
function transform(t={}){return Object.fromEntries(['x','y','skX','skY','scX','scY','pX','pY'].map(k=>[k,number(t[k],k.startsWith('sc')?1:0)]));}
const output={};
for(const id of [18,21]){
 const arm=armatures.find(a=>a.name===`MC${id}`),skin=arr(arm.skin)[0];
 const bones=new Map(arr(arm.bone).map(b=>[b.name,b]));
 const animations={};
 for(const animation of arr(arm.animation)){
  const count=number(animation.duration),timelines=new Map(arr(animation.timeline).map(t=>[t.name,t]));
  animations[animation.name]=Array.from({length:count},(_,index)=>{
   const layers=[];
   for(const slot of arr(skin.slot)){
    const timeline=timelines.get(slot.name),isBullet=id===18&&slot.name==='bullet';
    if(!timeline&&!isBullet)continue;
    const frames=arr(timeline?.frame);let start=0,fi=0;
    for(;fi<frames.length-1;fi++){if(index<start+number(frames[fi].duration,1))break;start+=number(frames[fi].duration,1);}
    const frame=frames[fi]||{},next=frames[(fi+1)%frames.length]||frame;
    if(frame.hide==='1'||number(frame.displayIndex)<0)continue;
    const display=arr(slot.display)[number(frame.displayIndex)];
    if(!display||/影子|yingzi/i.test(display.name))continue;
    const rect=atlas.get(display.name);if(!rect)throw new Error(`Missing atlas part ${display.name}`);
    const t=transform(frame.transform||bones.get(slot.parent)?.transform),n=transform(next.transform||frame.transform||bones.get(slot.parent)?.transform);
    const f=frame.tweenEasing!=null&&frame.tweenEasing!=='NaN'?(index-start)/number(frame.duration,1):0;
    for(const k of Object.keys(t))t[k]+=(n[k]-t[k])*f;
    const color=frame.colorTransform||{};
    layers.push({name:slot.name,z:number(frame.z,number(slot.z)),t,d:transform(display.transform),rect,alpha:number(color.aM,100)/100,bullet:isBullet});
   }
   return layers.sort((a,b)=>a.z-b.z);
  });
 }
 output[id]=animations;
}
fs.writeFileSync('src/data/unitPresentationLayers.json',JSON.stringify(output));
console.log('Converted original layers',Object.fromEntries(Object.entries(output).map(([id,a])=>[id,Object.keys(a)])));
