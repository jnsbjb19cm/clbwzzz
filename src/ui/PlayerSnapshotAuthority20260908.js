import { authStore } from '../core/AuthStore.js';
import { App } from './App.js';

const PATCH_FLAG = Symbol.for('clbwz.playerSnapshotAuthority20260908');
let activeApp = null;

function applyItemSnapshot(app, items) {
  const inventory = app?.inventory;
  if (!inventory?.state || !Array.isArray(items)) return;
  const slotCount = Math.max(Number(inventory.state.slotCount) || 120, items.length, 120);
  const slots = Array.from({ length: slotCount }, () => null);
  let cursor = 0;
  for (const raw of items) {
    const itemId = Number(raw?.itemId);
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0 || cursor >= slots.length) continue;
    slots[cursor++] = {
      itemId,
      count,
      bound: Boolean(raw?.bound ?? raw?.isBound),
    };
  }
  inventory.state = { ...inventory.state, slotCount, slots };
  inventory.save?.();
}

function applyProfileSnapshot(app, profile) {
  if (!app?.player || !profile || typeof profile !== 'object') return;
  const next = {
    level: Number(profile.level),
    exp: Number(profile.exp),
    hp: Number(profile.hp),
    gold: Number(profile.gold),
    gem: Number(profile.diamond ?? profile.gem),
    honor: Number(profile.honor),
    arena: Number(profile.arena),
  };
  for (const [key, value] of Object.entries(next)) {
    if (Number.isFinite(value)) app.player[key] = value;
  }
  app.updatePlayerDisplay?.();
}

function applyResponse(app, data) {
  if (!app || !data || typeof data !== 'object') return;
  if (data.profile) applyProfileSnapshot(app, data.profile);
  if (data.snapshot?.profile) applyProfileSnapshot(app, data.snapshot.profile);
  if (Array.isArray(data.items)) applyItemSnapshot(app, data.items);
  if (Array.isArray(data.snapshot?.items)) applyItemSnapshot(app, data.snapshot.items);

  const walletGold = Number(data.wallet?.gold ?? data.gold);
  if (Number.isFinite(walletGold) && app.player) {
    app.player.gold = walletGold;
    app.updatePlayerDisplay?.();
  }
}

export function installPlayerSnapshotAuthority20260908() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalBootstrap = App.prototype.bootstrap;
  App.prototype.bootstrap = function bootstrapWithServerSnapshot(...args) {
    activeApp = this;
    applyProfileSnapshot(this, authStore.snapshot?.profile);
    applyItemSnapshot(this, authStore.snapshot?.items);
    return originalBootstrap.apply(this, args);
  };

  const api = authStore.api;
  const originalGet = api.get.bind(api);
  const originalPost = api.post.bind(api);

  api.get = async function getWithAuthority(path, ...args) {
    const data = await originalGet(path, ...args);
    if (path === '/player/snapshot') {
      authStore.snapshot = data;
      applyResponse(activeApp, data);
    }
    return data;
  };

  api.post = async function postWithAuthority(path, body, ...args) {
    const data = await originalPost(path, body, ...args);
    // 所有明确返回 profile/wallet/items 的服务器事务都可以直接刷新本地显示缓存。
    applyResponse(activeApp, data);
    return data;
  };
}
