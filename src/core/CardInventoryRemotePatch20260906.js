import { CardInventoryStore } from './CardInventoryStore.js';
import { sanitizeCustomCardName } from './constants.js';

const PATCH_FLAG = Symbol.for('clbwz.cardInventoryRemotePatch20260906');
const DEFAULT_SLOT_COUNT = 200;
const MAX_SLOT_COUNT = 500;

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

export function installCardInventoryRemotePatch20260906() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const proto = CardInventoryStore.prototype;
  const originalSave = proto.save;

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
