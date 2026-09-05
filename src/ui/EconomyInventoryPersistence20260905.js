import { InventoryStore, ITEM_INVENTORY_STORAGE_KEY } from '../core/ItemDatabase.js';

const ITEM_BASE_SLOTS = 120;
const ITEM_STACK_MAX = 327867;
const PATCH_FLAG = Symbol.for('clbwz.economyInventoryPersistence20260905');

export function installEconomyInventoryPersistence20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  InventoryStore.prototype.load = function loadBoundInventory20260905() {
    let state = null;
    try {
      const raw = localStorage.getItem(ITEM_INVENTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.slots)) {
          parsed.slots = parsed.slots.map((slot) => {
            if (!slot) return null;
            const itemId = Number(slot.itemId);
            const count = Math.max(0, Math.floor(Number(slot.count) || 0));
            if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0) return null;
            return { itemId, count, bound: Boolean(slot.bound) };
          });
          const savedCount = Math.floor(Number(parsed.slotCount) || 0);
          parsed.slotCount = Math.max(ITEM_BASE_SLOTS, savedCount, parsed.slots.length);
          while (parsed.slots.length < parsed.slotCount) parsed.slots.push(null);
          state = parsed;
        }
      }
    } catch {
      state = null;
    }

    if (!state) state = this.createDefault();
    this.state = state;
    for (const item of this.itemDb?.items ?? []) item.maxStack = ITEM_STACK_MAX;

    if (this.state.slotCount < ITEM_BASE_SLOTS) this.state.slotCount = ITEM_BASE_SLOTS;
    while (this.state.slots.length < this.state.slotCount) this.state.slots.push(null);

    // 仅旧版本首次迁移可走一次 starter-pack；新版用掉材料后不会在刷新页面时自动补回。
    this.ensureStarterPack?.();
    this.consolidateSlots?.();
    this.save();
    return this.state;
  };

  const originalReset = InventoryStore.prototype.reset;
  InventoryStore.prototype.reset = function resetInventory20260905() {
    originalReset.call(this);
    for (const slot of this.state?.slots ?? []) {
      if (slot) slot.bound = Boolean(slot.bound);
    }
    this.state.slotCount = Math.max(ITEM_BASE_SLOTS, Number(this.state.slotCount) || 0);
    while (this.state.slots.length < this.state.slotCount) this.state.slots.push(null);
    for (const item of this.itemDb?.items ?? []) item.maxStack = ITEM_STACK_MAX;
    this.save();
  };
}
