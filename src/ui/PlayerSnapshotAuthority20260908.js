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
    Number(inventory.state.slotCount) || 0,
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

// Only these endpoints return a COMPLETE personal inventory. Warehouse/auction
// lists and material-refill grants also use `items`, but are not snapshots.
function isPlayerSnapshotPath(path) {
  return /^\/player\/(?:snapshot|economy-state|smithy\/(?:state|craft|star-upgrade|decompose|material-combine|restore-escrow)|inventory\/(?:use|sell|drop|expand)|shop\/(?:buy-item|buy-pack|recharge-demo)|cards\/(?:discard|use-functional-item)|quests\/claim-reward|stage-result|migration\/local-snapshot)$/.test(String(path).split('?')[0]);
}

function isInventoryTransfer(path, method) {
  const route = String(path).split('?')[0];
  return (method === 'post' && (route === '/auction' || route === '/auction/buy'
    || /^\/guild\/\d+\/warehouse\/(?:deposit|withdraw)$/.test(route)))
    || (method === 'delete' && /^\/auction\/\d+$/.test(route));
}

function applyResponse(app, data, path) {
  if (!app || !data || typeof data !== 'object') return;
  if (data.profile) applyProfileSnapshot(app, data.profile);
  if (data.snapshot?.profile) applyProfileSnapshot(app, data.snapshot.profile);
  if (isPlayerSnapshotPath(path)) {
    if (Array.isArray(data.items)) applyItemSnapshot(app, data.items, data.itemBag);
    if (Array.isArray(data.snapshot?.items)) applyItemSnapshot(app, data.snapshot.items, data.snapshot.itemBag);
  }
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
  api.get = async function getWithAuthority(path, ...args) {
    const token = authStore.token;
    const data = await originalGet(path, ...args);
    if (token !== authStore.token) return data;
    if (path === '/player/snapshot') authStore.snapshot = data;
    applyResponse(activeApp, data, path);
    return data;
  };

  for (const method of ['post', 'put', 'delete']) {
    const original = api[method].bind(api);
    api[method] = async function mutateWithAuthority(path, ...args) {
      const token = authStore.token;
      const data = await original(path, ...args);
      if (token !== authStore.token) return data;
      applyResponse(activeApp, data, path);
      if (data?.ok !== false && isInventoryTransfer(path, method)) {
        // A committed transfer must not be reported as failed if refresh fails:
        // otherwise retrying could deposit/buy twice.
        try { await api.get('/player/snapshot'); }
        catch (error) { console.warn('[inventory] 交易成功，背包同步暂时失败', error); }
      }
      return data;
    };
  }
}
