import { CardInventoryStore } from './CardInventoryStore.js';
import { sanitizeCustomCardName } from './constants.js';

const PATCH_FLAG = Symbol.for('clbwz.cardInventoryRemotePatch20260906');
const AUTH_PATCH_FLAG = Symbol.for('clbwz.cardInventoryRemoteAuthPatch20260906');
const DEFAULT_SLOT_COUNT = 200;
const MAX_SLOT_COUNT = 500;
const ACTIVE_STORES = new Set();
const MIGRATION_PREFIX = 'clbwz_card_remote_migrated_v1_';

function normalizePowderSpent(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [rawId, rawCount] of Object.entries(value)) {
    const itemId = Number(rawId);
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    if (Number.isInteger(itemId) && itemId > 0 && count > 0) out[itemId] = count;
  }
  return out;
}

function normalizeAttributeRoll(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    atk: Math.max(-20, Math.min(20, Number(value.atk) || 0)),
    hp: Math.max(-20, Math.min(20, Number(value.hp) || 0)),
    cd: Math.max(-20, Math.min(20, Number(value.cd) || 0)),
  };
}

function normalizeRemoteSlot(raw) {
  if (!raw) return null;
  const cardId = Number(raw.cardId);
  if (!Number.isInteger(cardId) || cardId <= 0) return null;
  const star = Math.max(0, Math.floor(Number(raw.star ?? raw.strengthLv) || 0));
  const craftQuality = Math.max(1, Math.min(5, Math.floor(Number(raw.craftQuality) || 1)));
  const customName = sanitizeCustomCardName(raw.customName);
  return {
    cardId,
    star,
    strengthLv: star,
    craftQuality,
    exp: Math.max(0, Math.floor(Number(raw.exp) || 0)),
    customName: customName || null,
    awakened: Boolean(raw.awakened),
    attributeRoll: normalizeAttributeRoll(raw.attributeRoll),
    powderSpent: normalizePowderSpent(raw.powderSpent),
    // Binding is authoritative server state. Keep it when hydrating local stores so
    // strengthen/decompose/craft UIs see the same bound/unbound card as the DB.
    bound: Boolean(raw.bound),
  };
}

function buildPayload(store) {
  const cards = [];
  const slots = store?.state?.slots ?? [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = normalizeRemoteSlot(slots[slotIndex]);
    if (!slot) continue;
    cards.push({
      slotIndex,
      cardId: slot.cardId,
      star: slot.star,
      craftQuality: slot.craftQuality,
      exp: slot.exp,
      customName: slot.customName,
      awakened: slot.awakened,
      attributeRoll: slot.attributeRoll ? { ...slot.attributeRoll } : null,
      powderSpent: { ...slot.powderSpent },
    });
  }
  return {
    slotCount: Math.max(
      DEFAULT_SLOT_COUNT,
      Math.min(MAX_SLOT_COUNT, Math.floor(Number(store?.state?.slotCount) || DEFAULT_SLOT_COUNT)),
    ),
    cards,
  };
}

function bySlot(snapshot) {
  return new Map((snapshot?.cards ?? []).map((card) => [Number(card.slotIndex), card]));
}

function hasLegacyExtraProgress(card) {
  return Number(card?.exp) > 0
    || Boolean(card?.customName)
    || Boolean(card?.awakened)
    || Boolean(card?.attributeRoll)
    || Object.keys(card?.powderSpent ?? {}).length > 0;
}

function shouldMigrateLegacyLocal(localSnapshot, remoteSnapshot) {
  if (!Array.isArray(localSnapshot?.cards) || !Array.isArray(remoteSnapshot?.cards)) return false;
  if (localSnapshot.cards.length !== remoteSnapshot.cards.length) return false;
  const remoteBySlot = bySlot(remoteSnapshot);
  let richer = false;
  for (const local of localSnapshot.cards) {
    const remote = remoteBySlot.get(Number(local.slotIndex));
    if (!remote || Number(remote.cardId) !== Number(local.cardId)) return false;
    const localStar = Number(local.star) || 0;
    const remoteStar = Number(remote.star) || 0;
    const localQuality = Number(local.craftQuality) || 1;
    const remoteQuality = Number(remote.craftQuality) || 1;
    if (localStar < remoteStar || localQuality < remoteQuality) return false;
    if (localStar > remoteStar || localQuality > remoteQuality || hasLegacyExtraProgress(local)) richer = true;
    if (hasLegacyExtraProgress(remote)) return false;
  }
  return richer;
}

async function hydrateAuthenticatedStores(authStore, { allowLegacyMigration = false } = {}) {
  if (!authStore?.isLoggedIn?.()) return;
  let remote = null;
  try {
    remote = await authStore.api.get('/player/card-inventory');
  } catch {
    remote = authStore.snapshot?.cardInventory ?? null;
  }
  if (!remote?.cards) return;
  if (authStore.snapshot) authStore.snapshot.cardInventory = remote;

  const userId = Number(authStore.user?.id ?? authStore.snapshot?.profile?.userId) || 0;
  const migrationKey = `${MIGRATION_PREFIX}${userId}`;
  for (const store of ACTIVE_STORES) {
    const localPayload = buildPayload(store);
    store.bindRemotePersistence((payload) => authStore.api.put('/player/card-inventory', payload));

    let migrated = false;
    let migrationAlreadyDone = false;
    try { migrationAlreadyDone = localStorage.getItem(migrationKey) === '1'; } catch {}
    if (allowLegacyMigration && userId > 0 && !migrationAlreadyDone && shouldMigrateLegacyLocal(localPayload, remote)) {
      store.save();
      try {
        await store.flushRemotePersistence();
        migrated = true;
        if (authStore.snapshot) authStore.snapshot.cardInventory = localPayload;
        try { localStorage.setItem(migrationKey, '1'); } catch {}
      } catch {
        migrated = false;
      }
    }
    if (!migrated) store.applyServerSnapshot(remote);
  }
}

function installAuthBridge(authStore) {
  if (!authStore || authStore[AUTH_PATCH_FLAG]) return;
  authStore[AUTH_PATCH_FLAG] = true;

  for (const method of ['login', 'register', 'restore']) {
    const original = authStore[method]?.bind(authStore);
    if (!original) continue;
    authStore[method] = async (...args) => {
      const result = await original(...args);
      if (result) {
        await hydrateAuthenticatedStores(authStore, { allowLegacyMigration: method !== 'register' });
        if (result.snapshot && authStore.snapshot) result.snapshot = authStore.snapshot;
      }
      return result;
    };
  }
}

export function installCardInventoryRemotePatch20260906({ authStore = null } = {}) {
  if (!globalThis[PATCH_FLAG]) {
    globalThis[PATCH_FLAG] = true;

    const proto = CardInventoryStore.prototype;
    const originalLoad = proto.load;
    const originalSave = proto.save;

    proto.load = function loadWithRemoteRegistration20260906() {
      const state = originalLoad.call(this);
      ACTIVE_STORES.add(this);
      return state;
    };

    proto.toServerPayload = function toServerPayload20260906() {
      return buildPayload(this);
    };

    proto.bindRemotePersistence = function bindRemotePersistence20260906(saveRemote) {
      this._remoteCardInventorySave = typeof saveRemote === 'function' ? saveRemote : null;
      this._remoteCardInventoryQueue = this._remoteCardInventoryQueue ?? Promise.resolve();
      this._remoteCardInventoryError = null;
      return this;
    };

    proto.flushRemotePersistence = async function flushRemotePersistence20260906() {
      await (this._remoteCardInventoryQueue ?? Promise.resolve());
      if (this._remoteCardInventoryError) throw this._remoteCardInventoryError;
    };

    proto.applyServerSnapshot = function applyServerSnapshot20260906(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.cards)) return false;
      const requestedCount = Math.floor(Number(snapshot.slotCount) || DEFAULT_SLOT_COUNT);
      const highestSlot = snapshot.cards.reduce((max, raw) => {
        const index = Math.floor(Number(raw?.slotIndex));
        return Number.isInteger(index) ? Math.max(max, index) : max;
      }, -1);
      const slotCount = Math.max(
        DEFAULT_SLOT_COUNT,
        Math.min(MAX_SLOT_COUNT, requestedCount),
        Math.min(MAX_SLOT_COUNT, highestSlot + 1),
      );
      const slots = Array.from({ length: slotCount }, () => null);
      for (const raw of snapshot.cards) {
        const slotIndex = Math.floor(Number(raw?.slotIndex));
        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) continue;
        const slot = normalizeRemoteSlot(raw);
        if (slot) slots[slotIndex] = slot;
      }
      this.state = { slotCount, slots };
      originalSave.call(this);
      return true;
    };

    proto.save = function saveWithRemotePersistence20260906(options = {}) {
      originalSave.call(this);
      if (options?.remote === false || !this._remoteCardInventorySave) return;

      const payload = buildPayload(this);
      const saveRemote = this._remoteCardInventorySave;
      this._remoteCardInventoryQueue = (this._remoteCardInventoryQueue ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          try {
            await saveRemote(payload);
            this._remoteCardInventoryError = null;
          } catch (error) {
            this._remoteCardInventoryError = error;
          }
        });
    };
  }

  installAuthBridge(authStore);
}
