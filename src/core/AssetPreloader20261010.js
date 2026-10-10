import manifest from '../data/assetManifest20261010.json';

/**
 * 2026-10-10（用户要求）：「先预加载所有资源，在登录界面加载」+「精灵动画进房间时做一个加载界面」。
 *
 * 现实情况：assets/sprites 全量 **227.6MB**（unit_anim 155.6MB + cards 36.2MB + skill_anim 33.8MB
 * + parts/units/bullets 约 2MB）。全量塞在登录界面既慢又浪费（玩家可能只在大厅发呆）。
 * 所以按「什么时候真的要用」分成两组：
 *   LIGHT_GROUPS = parts/units/bullets（约 2MB）→ 登录界面预热，代价可忽略
 *   ANIM_GROUPS  = skillAnim/unitAnim（约 189MB）→ 进房间时用专门的加载界面处理
 * cards（36MB）留给登录后空闲时预热。
 *
 * 预加载用的 Image 会**保活**在 cache 里：一方面避免浏览器把刚下好的资源驱逐掉导致二次请求，
 * 另一方面 `getPreloaded(url)` 可以直接给 canvas 用，不会重新解码。
 */

const cache = new Map();          // url -> HTMLImageElement（保活）
const failed = new Set();         // 加载失败的 url（不再重试，避免每次都白等）
const groupPromises = new Map();  // group -> Promise
const groupDone = new Set();

let currentProgress = { active: false, loaded: 0, failed: 0, total: 0, percent: 0, groups: [] };
let progressListeners = new Set();

/** 登录界面预热的轻量组（约 2MB）。 */
export const LIGHT_GROUPS = Object.freeze(['parts', 'units', 'bullets']);
/** 需要专门加载界面的动画重资源（约 189MB）。 */
export const ANIM_GROUPS = Object.freeze(['skillAnim', 'unitAnim']);
/** 登录后空闲时间再补的组。 */
export const IDLE_GROUPS = Object.freeze(['cards']);

export function assetGroupSummary(group) {
  return {
    group,
    count: manifest.counts?.[group] ?? 0,
    bytes: manifest.bytes?.[group] ?? 0,
  };
}

export function assetTotalBytes(groups) {
  return groups.reduce((sum, group) => sum + (manifest.bytes?.[group] ?? 0), 0);
}

export function isGroupPreloaded(group) {
  return groupDone.has(group);
}

export function getPreloaded(url) {
  return cache.get(url) ?? null;
}

export function onPreloadProgress(listener) {
  progressListeners.add(listener);
  listener({ ...currentProgress });
  return () => progressListeners.delete(listener);
}

function emitProgress() {
  for (const listener of progressListeners) {
    try { listener({ ...currentProgress }); } catch { /* 监听方出错不影响预加载 */ }
  }
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (cache.has(url) || failed.has(url)) { resolve(Boolean(cache.has(url))); return; }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      cache.set(url, image);
      resolve(true);
    };
    image.onerror = () => {
      failed.add(url);
      resolve(false);
    };
    image.src = url;
  });
}

/**
 * 按分组预加载。可重复调用（已在跑的组会复用同一个 Promise）。
 * 永不会 reject —— 预加载失败不该影响玩家进游戏。
 */
export function preloadAssetGroups(groups, { concurrency = 6, onProgress = null } = {}) {
  const wanted = [...new Set(groups)].filter((group) => manifest.groups?.[group]);
  if (!wanted.length) return Promise.resolve(currentProgress);

  const pending = wanted.filter((group) => !groupDone.has(group));
  const already = wanted.filter((group) => groupDone.has(group));
  if (!pending.length) {
    if (onProgress) { try { onProgress({ ...currentProgress }); } catch {} }
    return Promise.resolve(currentProgress);
  }

  // 已在加载中的组：直接复用它的 Promise（只等新加入的那部分）
  const running = pending.map((group) => groupPromises.get(group)).filter(Boolean);
  const fresh = pending.filter((group) => !groupPromises.has(group));

  const urls = [];
  for (const group of fresh) {
    for (const url of manifest.groups[group]) {
      if (!cache.has(url) && !failed.has(url)) urls.push(url);
    }
  }

  const baseLoaded = currentProgress.loaded;
  const baseFailed = currentProgress.failed;
  const baseTotal = currentProgress.total;
  currentProgress = {
    active: true,
    loaded: baseLoaded,
    failed: baseFailed,
    total: Math.max(baseTotal, baseLoaded + baseFailed + urls.length + running.length * 0),
    percent: 0,
    groups: wanted,
    bytes: assetTotalBytes(wanted),
  };
  emitProgress();

  let cursor = 0;
  let loaded = 0;
  let errors = 0;
  const tick = () => {
    currentProgress.loaded = baseLoaded + loaded;
    currentProgress.failed = baseFailed + errors;
    const doneCount = currentProgress.loaded + currentProgress.failed;
    currentProgress.total = Math.max(currentProgress.total, doneCount);
    currentProgress.percent = currentProgress.total
      ? Math.round((doneCount / currentProgress.total) * 100)
      : 100;
    if (onProgress) { try { onProgress({ ...currentProgress }); } catch {} }
    emitProgress();
  };

  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      const ok = await loadImage(url);
      if (ok) loaded += 1; else errors += 1;
      tick();
    }
  };

  const jobs = [];
  const lanes = Math.max(1, Math.min(12, Number(concurrency) || 6));
  for (let i = 0; i < lanes; i += 1) jobs.push(worker());

  const own = Promise.all(jobs).then(() => {
    for (const group of fresh) {
      groupDone.add(group);
      groupPromises.delete(group);
    }
    currentProgress.active = groupPromises.size + (pending.length - fresh.length) > 0;
    if (!currentProgress.active) currentProgress.percent = 100;
    tick();
    return currentProgress;
  });

  for (const group of fresh) groupPromises.set(group, own);
  return Promise.all([own, ...running]).then(() => currentProgress);
}

/** 空闲时间补加载（登录后跑 cards 用；不用 requestIdleCallback 时退化成 setTimeout）。 */
export function preloadWhenIdle(groups, options = {}) {
  const run = () => preloadAssetGroups(groups, options);
  if (typeof requestIdleCallback === 'function') {
    return new Promise((resolve) => {
      requestIdleCallback(() => { run().then(resolve); }, { timeout: 4000 });
    });
  }
  return new Promise((resolve) => {
    setTimeout(() => { run().then(resolve); }, 1200);
  });
}

export function resetAssetPreloadStateForTest() {
  cache.clear();
  failed.clear();
  groupPromises.clear();
  groupDone.clear();
  currentProgress = { active: false, loaded: 0, failed: 0, total: 0, percent: 0, groups: [] };
  progressListeners = new Set();
}

export const ASSET_MANIFEST = manifest;
export const ASSET_MANIFEST_TOTAL_BYTES = manifest.totalBytes ?? 0;
