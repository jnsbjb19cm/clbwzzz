import {
  InventoryStore,
  ITEM_INVENTORY_STORAGE_KEY,
} from './ItemDatabase.js';
import { BAG_MAX_STACK } from './constants.js';

const PATCH_FLAG = Symbol.for('clbwzzz.inventoryBindingPatch20260905');

function boolBound(value, fallback = true) {
  if (value == null) return fallback;
  return value === true || value === 1 || value === '1';
}

function maxStackOf(store, itemId) {
  const item = store?.itemDb?.getById?.(itemId);
  return Math.max(1, Number(item?.maxStack ?? BAG_MAX_STACK) || BAG_MAX_STACK);
}

function countByBinding(slots, itemId, isBound) {
  const id = Number(itemId);
  return (slots ?? []).reduce((sum, slot) => {
    if (!slot || Number(slot.itemId) !== id || boolBound(slot.isBound) !== Boolean(isBound)) return sum;
    return sum + Math.max(0, Number(slot.count) || 0);
  }, 0);
}

function clearItem(slots, itemId) {
  const id = Number(itemId);
  for (let i = 0; i < slots.length; i += 1) {
    if (Number(slots[i]?.itemId) === id) slots[i] = null;
  }
}

function placeExact(store, slots, itemId, count, isBound) {
  const id = Number(itemId);
  let left = Math.max(0, Math.floor(Number(count) || 0));
  if (!id || left <= 0 || !store.itemDb?.getById?.(id)) return left;
  const maxStack = maxStackOf(store, id);

  for (let i = 0; i < slots.length && left > 0; i += 1) {
    const slot = slots[i];
    if (!slot || Number(slot.itemId) !== id || boolBound(slot.isBound) !== Boolean(isBound)) continue;
    const room = Math.max(0, maxStack - Number(slot.count || 0));
    const add = Math.min(room, left);
    slot.count += add;
    slot.isBound = Boolean(isBound);
    left -= add;
  }
  for (let i = 0; i < slots.length && left > 0; i += 1) {
    if (slots[i]) continue;
    const add = Math.min(maxStack, left);
    slots[i] = { itemId: id, count: add, isBound: Boolean(isBound) };
    left -= add;
  }
  return left;
}

function restoreCapturedBinding(store, captured) {
  if (!(captured instanceof Map) || captured.size === 0) {
    for (const slot of store.state?.slots ?? []) {
      if (slot && slot.isBound == null) slot.isBound = true;
    }
    return;
  }

  for (const slot of store.state?.slots ?? []) {
    if (slot && slot.isBound == null) slot.isBound = true;
  }

  for (const [itemId, wantedUnbound] of captured) {
    const slots = store.state?.slots ?? [];
    const total = slots.reduce((sum, slot) => Number(slot?.itemId) === Number(itemId)
      ? sum + Math.max(0, Number(slot.count) || 0)
      : sum, 0);
    if (total <= 0) continue;
    const unbound = Math.max(0, Math.min(total, Math.floor(Number(wantedUnbound) || 0)));
    const bound = total - unbound;
    clearItem(slots, itemId);
    let left = placeExact(store, slots, itemId, bound, true);
    left += placeExact(store, slots, itemId, unbound, false);
    // 如果容量异常不足，宁可恢复成绑定堆叠，也不能无声丢物品。
    if (left > 0) placeExact(store, slots, itemId, left, true);
  }
}

export function markInventoryQuantityUnbound(store, itemId, count) {
  if (!store?.state?.slots) return false;
  const id = Number(itemId);
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  if (!id || amount <= 0) return false;

  const slots = store.state.slots;
  const total = slots.reduce((sum, slot) => Number(slot?.itemId) === id
    ? sum + Math.max(0, Number(slot.count) || 0)
    : sum, 0);
  if (total <= 0) return false;

  const existingUnbound = countByBinding(slots, id, false);
  const targetUnbound = Math.min(total, existingUnbound + amount);
  const targetBound = total - targetUnbound;
  clearItem(slots, id);
  placeExact(store, slots, id, targetBound, true);
  placeExact(store, slots, id, targetUnbound, false);
  store.save?.();
  return true;
}

export function installInventoryBindingPatch20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousLoad = InventoryStore.prototype.load;
  InventoryStore.prototype.load = function loadWithBindingPreserved() {
    // 原 load 会把 slot 重新映射成 {itemId,count}，所以先从原始 JSON 抓出非绑定数量，
    // 等容量/试玩材料迁移完成后再恢复，兼容旧存档（旧存档一律视为绑定）。
    const captured = new Map();
    try {
      const raw = localStorage.getItem(ITEM_INVENTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      for (const slot of Array.isArray(parsed?.slots) ? parsed.slots : []) {
        if (!slot || boolBound(slot.isBound, true)) continue;
        const id = Number(slot.itemId);
        const count = Math.max(0, Math.floor(Number(slot.count) || 0));
        if (id > 0 && count > 0) captured.set(id, (captured.get(id) ?? 0) + count);
      }
    } catch {}

    const result = previousLoad.call(this);
    restoreCapturedBinding(this, captured);
    this.save?.();
    return result;
  };

  InventoryStore.prototype.placeInSlots = function placeInSlotsWithBinding(
    slots,
    itemId,
    count,
    options = {},
  ) {
    const isBound = boolBound(options?.isBound, true);
    return placeExact(this, slots, itemId, count, isBound);
  };

  InventoryStore.prototype.addItem = function addItemWithBinding(itemId, count = 1, options = {}) {
    if (!Number.isInteger(count) || count <= 0) return false;
    const left = this.placeInSlots(this.state.slots, itemId, count, options);
    this.save();
    return left === 0;
  };

  InventoryStore.prototype.consolidateSlots = function consolidateSlotsByBinding() {
    const totals = new Map();
    for (const slot of this.state?.slots ?? []) {
      if (!slot) continue;
      const id = Number(slot.itemId);
      const isBound = boolBound(slot.isBound, true);
      const key = `${id}:${isBound ? 1 : 0}`;
      const current = totals.get(key) ?? { itemId: id, count: 0, isBound };
      current.count += Math.max(0, Number(slot.count) || 0);
      totals.set(key, current);
    }
    if (totals.size === 0) return;

    for (let i = 0; i < this.state.slots.length; i += 1) this.state.slots[i] = null;
    // 同 ID 先排绑定，再排非绑定，让旧背包习惯保持稳定，同时两种状态绝不合并。
    const entries = [...totals.values()].sort((a, b) => a.itemId - b.itemId || Number(b.isBound) - Number(a.isBound));
    for (const entry of entries) {
      let left = placeExact(this, this.state.slots, entry.itemId, entry.count, entry.isBound);
      while (left > 0 && this.state.slots.length < this.state.slotCount) this.state.slots.push(null);
      if (left > 0) left = placeExact(this, this.state.slots, entry.itemId, left, entry.isBound);
    }
    this.save();
  };
}
