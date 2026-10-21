import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {XMLParser} from 'fast-xml-parser';
import {SKILL_EFFECTS} from '../src/core/SkillRegistry.js';
import {resolveSkillResourceId,getCraterOverlay} from '../src/battle/SkillAnimationConfig.js';
import {SONG_SEQUENCE} from '../src/battle/OriginalSequenceAnimations.js';
const cards=JSON.parse(fs.readFileSync('src/data/card.json','utf8'));
const xml=new XMLParser({ignoreAttributes:false,attributeNamePrefix:''}).parse(fs.readFileSync('assets/assets/dySkeletonXML/skill1_skeleton.xml','utf8'));
const armatures=xml.dragonBones.armature;
const rows=[];
for(const [key,effect] of Object.entries(SKILL_EFFECTS)){
 const id=Number(key),name=cards.find(c=>Number(c.card_id)===id)?.card_name??'?';
 const resource=getCraterOverlay(id)?.sourceSkillId??resolveSkillResourceId(id);
 const json=`assets/sprites/skill_anim/${resource}.json`,png=`assets/sprites/skill_anim/${resource}.png`;
 const arm=armatures.find(a=>a.name===`Skill${id}`);
 const animations=(Array.isArray(arm?.animation)?arm.animation:arm?.animation?[arm.animation]:[]).map(a=>`${a.name}:${a.duration}`);
 if(id===544){
  const hashes=new Set();
  for(const s of SONG_SEQUENCE){
   const bytes=await sharp('assets/atlas/skill1.png').extract({left:s.x,top:s.y,width:s.width,height:s.height}).raw().toBuffer();
   hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  rows.push({id,name,kind:effect.kind,resource:'skill1 atlas original sequence',status:'animated',frames:14,unique:hashes.size,animations,note:'legacy 544.png is static and bypassed'});
  continue;
 }
 if(!fs.existsSync(json)||!fs.existsSync(png)){rows.push({id,name,kind:effect.kind,resource,status:arm?'source skeleton only':'missing',animations});continue;}
 const meta=JSON.parse(fs.readFileSync(json,'utf8'));
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const hashes=new Set();let badFrames=0,edgeFrames=0;
 for(const frame of meta.frames){
  const {x,y,w,h}=frame;
  if(x<0||y<0||x+w>info.width||y+h>info.height){badFrames++;continue;}
  const hash=createHash('sha256');let edge=false;
  for(let row=0;row<h;row++){
   const start=((y+row)*info.width+x)*4;hash.update(data.subarray(start,start+w*4));
   if(data[start+3]>20||data[start+(w-1)*4+3]>20)edge=true;
   if(row===0||row===h-1)for(let col=0;col<w;col++)if(data[start+col*4+3]>20)edge=true;
  }
  hashes.add(hash.digest('hex'));if(edge)edgeFrames++;
 }
 rows.push({id,name,kind:effect.kind,resource,status:hashes.size>1?'animated':'static',frames:meta.frames.length,unique:hashes.size,badFrames,edgeFrames,animations});
}
console.log(JSON.stringify(rows,null,2));
