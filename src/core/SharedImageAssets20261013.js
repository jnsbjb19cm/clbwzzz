// One decoded image per exact asset version, shared by preload and rendering.
const images = new Map();
const pending = new Map();
const failedAt = new Map();
const jsonCache = new Map();
const jsonPending = new Map();
const jsonFailedAt = new Map();

export function spriteAssetUrl(input) {
  const url = String(input);
  if (/[?&]v=/.test(url)) return url;
  let version;
  if (/^\/sprites\/(cards|units)\//.test(url)) version = /^\/sprites\/(cards|units)\/70\.png/.test(url) ? '20261016-corn-original' : '20260625f';
  else if (url.startsWith('/sprites/skill_anim/')) version = '20260801-animation-sync';
  else if (url.startsWith('/sprites/unit_anim/')) {
    const res = url.split('/').at(-1).split('.')[0];
    version = ['freeze','vertigo','bump','qualityLightCircle'].includes(res) ? 'fx-20260802'
      : res === '8' ? '20260909-bigear-mouth'
      : res === '70' ? '20261018-corn-idle'
      : ['31','57'].includes(res) ? '20260909-dark-features' : '20260826a';
  }
  return version ? url + (url.includes('?') ? '&' : '?') + 'v=' + version : url;
}

export function getSharedImage(url) { return images.get(spriteAssetUrl(url)) ?? null; }
export function loadSharedImage(url, { retry = false, timeoutMs = 15000 } = {}) {
  const key = spriteAssetUrl(url);
  if (images.has(key)) return Promise.resolve(images.get(key));
  if (pending.has(key)) return pending.get(key);
  if (!retry && Date.now() - (failedAt.get(key) ?? -Infinity) < 2000) return Promise.resolve(null);
  const promise = new Promise(resolve => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const image = new Image();
    image.decoding = 'async';
    let ended = false;
    const finish = ok => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (ok) { images.set(key,image);failedAt.delete(key); }
      else failedAt.set(key,Date.now());
      resolve(ok ? image : null);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.onload = async () => {
      try { await image.decode?.(); finish(true); }
      catch { finish(false); }
    };
    image.onerror = () => finish(false);
    image.src = key;
  }).finally(() => pending.delete(key));
  pending.set(key,promise);
  return promise;
}

export function loadSharedAssetJson(url, { retry = false } = {}) {
  const key = spriteAssetUrl(url);
  if (jsonCache.has(key)) return Promise.resolve(jsonCache.get(key));
  if (jsonPending.has(key)) return jsonPending.get(key);
  if (!retry && Date.now() - (jsonFailedAt.get(key) ?? -Infinity) < 2000) return Promise.resolve(null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),15000);
  const promise = fetch(key,{signal:controller.signal})
    .then(r=>r.ok ? r.json() : null).catch(()=>null)
    .then(data=>{
      if(data) { jsonCache.set(key,data);jsonFailedAt.delete(key); }
      else jsonFailedAt.set(key,Date.now());
      return data;
    })
    .finally(()=>{clearTimeout(timer);jsonPending.delete(key);});
  jsonPending.set(key,promise);
  return promise;
}
