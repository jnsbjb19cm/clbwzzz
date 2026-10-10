import { App } from './App.js';
import { authStore } from '../core/AuthStore.js';
import {
  ANIM_GROUPS,
  LIGHT_GROUPS,
  assetTotalBytes,
  isGroupPreloaded,
  onPreloadProgress,
  preloadAssetGroups,
} from '../core/AssetPreloader20261010.js';

/**
 * 2026-10-10（用户要求）：
 *   ① 「先预加载所有资源，但是在登录界面加载」
 *   ② 「精灵动画在房间开了之后做一个加载界面（专门加载这些动画）」
 *
 * 两者的资源不是同一批：
 *   登录界面 → LIGHT_GROUPS（parts/units/bullets，约 2MB）：右下角一个进度徽标，不挡操作。
 *   进房间   → ANIM_GROUPS（skillAnim/unitAnim，约 189MB）：全屏加载界面 + 进度条 + 可跳过。
 *
 * 为什么不在登录界面全量加载：全量 227.6MB，而动画资源只有开打才用得到；
 * 放登录界面会把首次进入拖得很久（还是局域网/远程都受影响）。具体数字见 AssetPreloader 头部注释。
 * 想改策略只需要改 AssetPreloader 里的三个分组常量。
 */

const PATCH_FLAG = Symbol.for('clbwz.assetPreloadUi20261010');
const BADGE_ID = 'asset-preload-badge';
const OVERLAY_ID = 'asset-anim-loading';

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)}MB`;

/* ---------------------------------- 登录界面预热 ---------------------------------- */

function startLoginPreloadBadge() {
  if (typeof document === 'undefined') return;
  let badge = document.getElementById(BADGE_ID);
  if (!badge) {
    badge = document.createElement('p');
    badge.id = BADGE_ID;
    badge.className = 'asset-preload-badge';
    document.body.append(badge);
  }
  const totalBytes = assetTotalBytes(LIGHT_GROUPS);
  const stop = onPreloadProgress((progress) => {
    if (!badge.isConnected) { stop(); return; }
    if (progress.active === false && progress.percent >= 100) {
      badge.textContent = `资源就绪（${mb(totalBytes)}）`;
      setTimeout(() => badge.remove(), 1500);
      stop();
      return;
    }
    badge.textContent = `正在预加载资源 ${progress.percent}%（${progress.loaded + progress.failed}/${progress.total} · ${mb(totalBytes)}）`;
  });
  preloadAssetGroups(LIGHT_GROUPS, { concurrency: 6 }).then(() => {
    if (badge.isConnected) {
      badge.textContent = `资源就绪（${mb(totalBytes)}）`;
      setTimeout(() => { if (badge.isConnected) badge.remove(); }, 1500);
    }
  });
}

/* ---------------------------------- 房间加载界面 ---------------------------------- */

function ensureRoomAnimLoading() {
  if (typeof document === 'undefined') return;
  if (isGroupPreloaded('unitAnim') && isGroupPreloaded('skillAnim')) return;
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('section');
    overlay.id = OVERLAY_ID;
    overlay.className = 'asset-anim-loading';
    overlay.innerHTML = `
      <div class="asset-anim-loading__card">
        <h3>正在加载精灵动画</h3>
        <p class="asset-anim-loading__hint"></p>
        <div class="asset-anim-loading__bar"><i></i></div>
        <p class="asset-anim-loading__percent">0%</p>
        <button type="button" class="asset-anim-loading__skip">先不等了（后台继续加载）</button>
      </div>`;
    document.body.append(overlay);
  }
  const hint = overlay.querySelector('.asset-anim-loading__hint');
  const bar = overlay.querySelector('.asset-anim-loading__bar i');
  const percent = overlay.querySelector('.asset-anim-loading__percent');
  const close = () => overlay.remove();
  overlay.querySelector('.asset-anim-loading__skip')?.addEventListener('click', close);

  const totalBytes = assetTotalBytes(ANIM_GROUPS);
  const stop = onPreloadProgress((progress) => {
    if (!overlay.isConnected) { stop(); return; }
    percent.textContent = `${progress.percent}%`;
    bar.style.width = `${progress.percent}%`;
    hint.textContent = `精灵动画与技能特效约 ${mb(totalBytes)}，加载一次之后本机就有缓存了。`;
  });

  preloadAssetGroups(ANIM_GROUPS, { concurrency: 8 }).then(() => {
    stop();
    if (overlay.isConnected) {
      overlay.querySelector('.asset-anim-loading__card')?.classList.add('done');
      setTimeout(close, 320);
    }
  });
}

/* ---------------------------------- 安装 ---------------------------------- */

export function installAssetPreloadUi20261010() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 登录界面：开始预热轻量资源（只在未登录、也就是登录页显示时挂进度徽标）
  const previousMount = App.prototype.mount;
  App.prototype.mount = function mountWithAssetWarmup(...args) {
    const result = previousMount.apply(this, args);
    try {
      if (!authStore.isLoggedIn()) startLoginPreloadBadge();
    } catch { /* 预热失败不影响登录 */ }
    return result;
  };

  // 进房间：动画重资源走专门的加载界面（不阻塞进房，界面浮在上面）
  const previousNavigate = App.prototype.navigate;
  App.prototype.navigate = function navigateWithAnimLoading(route, opts) {
    if (route === 'room') {
      try { ensureRoomAnimLoading(); } catch { /* 加载界面出错不影响进房 */ }
    }
    return previousNavigate.call(this, route, opts);
  };

  // 给控制台/排查留个入口
  if (typeof window !== 'undefined') {
    window.__assetPreload20261010 = () => ({
      lightDone: LIGHT_GROUPS.every(isGroupPreloaded),
      animDone: ANIM_GROUPS.every(isGroupPreloaded),
    });
  }
}
