import manifest from '../data/assetManifest20261010.json' with { type: 'json' };
import { getSharedImage, loadSharedImage, loadSharedAssetJson } from './SharedImageAssets20261013.js';

const completed = new Set();
const running = new Map();
const listeners = new Set();
let currentProgress = {active:false,loaded:0,failed:0,total:0,percent:0,groups:[]};
export const LIGHT_GROUPS = Object.freeze(['parts','units','bullets']);
export const ANIM_GROUPS = Object.freeze(['skillAnim','unitAnim']);
export const IDLE_GROUPS = Object.freeze(['cards']);
export const ASSET_MANIFEST = manifest;
export const ASSET_MANIFEST_TOTAL_BYTES = manifest.totalBytes ?? 0;
export const getPreloaded = getSharedImage;
export const assetGroupSummary = group => ({group,count:manifest.counts?.[group]??0,bytes:manifest.bytes?.[group]??0});
export const assetTotalBytes = groups => groups.reduce((sum,g)=>sum+(manifest.bytes?.[g]??0),0);
export const isGroupPreloaded = group => completed.has(group);
export function onPreloadProgress(listener) {
  listeners.add(listener);listener({...currentProgress});
  return ()=>listeners.delete(listener);
}
function resources(group) {
  const images=manifest.groups?.[group]??[];
  if (!ANIM_GROUPS.includes(group)) return images;
  // Runtime animation needs JSON as well as PNG. Compact state sheets share metadata.
  return [...new Set([...images,...images.map(url=>url
    .replace(/\.\w+\.runtime\.png$/,'.runtime.json').replace(/\.png$/,'.json'))])];
}
function emit(progress) {
  currentProgress=progress;
  for(const listener of listeners) {try{listener({...progress});}catch{}}
}
function loadGroup(group, concurrency) {
  if (running.has(group)) return running.get(group);
  const urls=resources(group), report={group,loaded:0,failed:0,total:urls.length};
  let cursor=0;
  const worker=async()=>{
    while(cursor<urls.length) {
      const url=urls[cursor++];
      const ok=url.endsWith('.json') ? await loadSharedAssetJson(url,{retry:true}) : await loadSharedImage(url,{retry:true});
      if(ok)report.loaded++;else report.failed++;
      // Yield between decoded assets so background warmup cannot monopolize a frame.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  };
  const entry={report,promise:null};
  running.set(group,entry);
  entry.promise=Promise.all(Array.from({length:concurrency},worker)).then(()=>{
    if(!report.failed)completed.add(group);
    running.delete(group);
    return report;
  });
  return entry;
}
export function preloadAssetGroups(groups,{concurrency=4,onProgress=null}={}) {
  const wanted=[...new Set(groups)].filter(g=>manifest.groups?.[g]);
  const lanes=Math.max(1,Math.min(4,Math.floor(Number(concurrency)||4)));
  const entries=wanted.map(group=>completed.has(group)
    ? {report:{group,loaded:resources(group).length,failed:0,total:resources(group).length},promise:Promise.resolve()}
    : loadGroup(group,Math.max(1,Math.floor(lanes/Math.max(1,wanted.length)))));
  const report=active=>{
    const loaded=entries.reduce((n,e)=>n+e.report.loaded,0),failed=entries.reduce((n,e)=>n+e.report.failed,0);
    const total=entries.reduce((n,e)=>n+e.report.total,0);
    const progress={active,loaded,failed,total,percent:total?Math.round((loaded+failed)/total*100):100,groups:wanted,bytes:assetTotalBytes(wanted)};
    emit(progress);try{onProgress?.({...progress});}catch{}
    return progress;
  };
  report(entries.some(e=>running.has(e.report.group)));
  const timer=setInterval(()=>report(true),100);
  return Promise.all(entries.map(e=>e.promise)).then(()=>{clearInterval(timer);return report(false);});
}
export function preloadWhenIdle(groups,options={}) {
  return new Promise(resolve=>{
    const run=()=>preloadAssetGroups(groups,options).then(resolve);
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:4000});
    else setTimeout(run,1200);
  });
}
export function resetAssetPreloadStateForTest() {
  completed.clear();listeners.clear();
  currentProgress={active:false,loaded:0,failed:0,total:0,percent:0,groups:[]};
}
