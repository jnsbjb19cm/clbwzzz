import { authStore } from '../core/AuthStore.js';
import { App } from './App.js';

const PATCH_FLAG = Symbol.for('clbwz.playerSnapshotAuthority20260908');
let activeApp = null;

function applyItemSnapshot(app, items, itemBag = null) {
  const inventory = app?.inventory;
  if (!inventory?.state || !Array.isArray(items)) return;
  const remoteSlotCount = Number(itemBag?.slotCount);
  const slotCount = Math.max(
    120,
    Number.isFinite(remoteSlotCount) ? Math.floor(remoteSlotCount) : 0,
    items.length,
  );
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
  if (Array.isArray(data.items)) applyItemSnapshot(app, data.items, data.itemBag);
  if (Array.isArray(data.snapshot?.items)) applyItemSnapshot(app, data.snapshot.items, data.snapshot.itemBag);
  if (data.cardInventory && app.cardInventory?.applyServerSnapshot) {
    app.cardInventory.applyServerSnapshot(data.cardInventory);
  }
  if (data.snapshot?.cardInventory && app.cardInventory?.applyServerSnapshot) {
    app.cardInventory.applyServerSnapshot(data.snapshot.cardInventory);
  }
  const stamina = Number(data.extraResources?.stamina ?? data.snapshot?.extraResources?.stamina);
  if (Number.isFinite(stamina) && app.player) app.player.stamina = stamina;

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
    applyItemSnapshot(this, authStore.snapshot?.items, authStore.snapshot?.itemBag);
    if (authStore.snapshot?.cardInventory && this.cardInventory?.applyServerSnapshot) {
      this.cardInventory.applyServerSnapshot(authStore.snapshot.cardInventory);
    }
    return originalBootstrap.apply(this, args);
  };

  const api = authStore.api;
  const originalGet = api.get.bind(api);
  const originalPost = api.post.bind(api);
  const originalPut = api.put.bind(api);

  api.get = async function getWithAuthority(path, ...args) {
    const data = await originalGet(path, ...args);
    if (path === '/player/snapshot') authStore.snapshot = data;
    applyResponse(activeApp, data);
    return data;
  };

  api.post = async function postWithAuthority(path, body, ...args) {
    const data = await originalPost(path, body, ...args);
    applyResponse(activeApp, data);
    return data;
  };

  api.put = async function putWithAuthority(path, body, ...args) {
    const data = await originalPut(path, body, ...args);
    applyResponse(activeApp, data);
    return data;
  };
}
