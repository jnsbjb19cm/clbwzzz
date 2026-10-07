import { getGameSetting } from '../core/GameSettingsStore20260910.js';
import layersByRes from '../data/unitPresentationLayers.json' with {type:'json'};

const frames=new WeakMap();
let atlas=null,loading=null;
export function setPresentationAtlas(image){atlas=image;}
export function preloadPresentationAtlas(){
  if(atlas||typeof Image==='undefined')return Promise.resolve(atlas);
  return loading??=new Promise(resolve=>{
    const image=new Image();image.onload=()=>{atlas=image;resolve(image);};
    image.onerror=()=>{loading=null;resolve(null);};image.src='/atlas/soldier.png';
  });
}
function apply(ctx,t){
  const x=t.skX*Math.PI/180,y=t.skY*Math.PI/180;
  ctx.transform(Math.cos(y)*t.scX,Math.sin(y)*t.scX,-Math.sin(x)*t.scY,Math.cos(x)*t.scY,t.x,t.y);
}
// Draw original layers with their timeline and z-order. No pixel erasing,
// borrowed mouth patch or interpolated shield texture.
export function presentationFrame(pack,state,index,res,source){
  const id=Number(res),layers=layersByRes[id]?.[state]?.[index];
  if(!layers||!source?.frame||typeof document==='undefined')return source;
  if(id===21&&!['default_100','default_80'].includes(state))return source;
  if(!atlas){void preloadPresentationAtlas();return source;}
  const bullet=getGameSetting('peanutMouthBullet')===true;
  let cache=frames.get(pack);if(!cache)frames.set(pack,cache=new Map());
  const key=`${state}:${index}:${bullet}`;if(cache.has(key))return cache.get(key);
  const canvas=document.createElement('canvas');canvas.width=source.frame.w;canvas.height=source.frame.h;
  const ctx=canvas.getContext('2d');ctx.translate(110,185);
  for(const layer of layers){
    if(layer.bullet&&!bullet)continue;
    ctx.save();ctx.globalAlpha=layer.alpha;apply(ctx,layer.t);apply(ctx,layer.d);
    const r=layer.rect;ctx.drawImage(atlas,r.x,r.y,r.width,r.height,-layer.d.pX,-layer.d.pY,r.width,r.height);ctx.restore();
  }
  const result={...source,sheet:canvas,frame:{...source.frame,x:0,y:0}};
  cache.set(key,result);return result;
}
