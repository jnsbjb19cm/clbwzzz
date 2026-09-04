import itemsJson from '../data/item.json';
import functionalItemsJson from '../data/functionalItems.json';
import expandBagJson from '../data/expandBag.json';
import { BAG_MAX_STACK, TRIAL_ITEM_SLOT_COUNT } from './constants.js';
import { Item } from './Item.js';
import { CraftMaterialRegistry } from './CraftMaterialRegistry.js';

const DEFAULT_SLOT_COUNT = TRIAL_ITEM_SLOT_COUNT;
export const ITEM_INVENTORY_STORAGE_KEY = 'clbwz_inventory_v1';
const STORAGE_KEY = ITEM_INVENTORY_STORAGE_KEY;
/** 试玩材料包版本：旧存档低于此版本会自动补发材料 */
const STARTER_PACK_VERSION = 6;

const craftRegistry = new CraftMaterialRegistry();

// 功能道具 80-92 来自独立领域数据。原始 item.xml/item.json 不包含这些试玩道具，
// ItemDatabase 在运行时合并，避免商城 realId 存在但背包数据库查不到。
export const FUNCTIONAL_ITEM_DEFS = Object.freeze(
  functionalItemsJson.map((raw) => Object.freeze({ ...raw })),
);

/** 试玩强化粉(1~5 级，含高品质卡后期强化所需 4/5 级粉) */
export const STRENGTHEN_POWDER_STARTER = [
  { itemId: 10001, count: 200 },
  { itemId: 10002, count: 150 },
  { itemId: 10003, count: 100 },
  { itemId: 10004, count: 80 },
  { itemId: 10005, count: 50 },
];

/** 仅制作材料(补发按钮优先发这些) */
export const CRAFT_MATERIAL_STARTER = craftRegistry.getStarterItems();

/** 试玩用初始物品 */
const STARTER_ITEMS = [
  { itemId: 1, count: 20 },
  { itemId: 2, count: 10 },
  { itemId: 3, count: 100 },
  ...STRENGTHEN_POWDER_STARTER,
  { itemId: 30055, count: 300 },
  ...CRAFT_MATERIAL_STARTER,
];

export class ItemDatabase {
  constructor() {
    this.craftRegistry = craftRegistry;
    const mergedRaw = [...itemsJson];
    const existingIds = new Set(mergedRaw.map((raw) => Number(raw.item_id)));
    for (const raw of functionalItemsJson) {
      if (!existingIds.has(Number(raw.item_id))) mergedRaw.push(raw);
    }
    this.items = mergedRaw.map((raw) => new Item(raw));
    for (const item of craftRegistry.itemMap.values()) {
      if (!this.items.find((i) => i.id === item.id)) this.items.push(item);
    }
    this.itemMap = new Map(this.items.map((i) => [i.id, i]));
    this.expandTable = expandBagJson;
  }

  getById(id) {
    return this.itemMap.get(Number(id)) ?? craftRegistry.getItem(id);
  }

  getExpandCost(slotCount) {
    return this.expandTable.find((r) => r.nowBagNum === slotCount + 1) ?? null;
  }

  getMaxSlots() {
    const last = this.expandTable[this.expandTable.length - 1];
    return last?.nowBagNum ?? DEFAULT_SLOT_COUNT;
  }
}

export class InventoryStore {
  constructor(itemDb) {
    this.itemDb = itemDb;
    this.state = null;
    this.load();
  }

  load() {
    let state;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.slots) && parsed.slotCount >= 20) {
          parsed.slots = parsed.slots.map((slot) => {
            if (!slot) return null;
            const itemId = Number(slot.itemId);
            const count = Number(slot.count);
            if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(count) || count <= 0) {
              return null;
            }
            return { itemId, count: Math.floor(count) };
          });
          state = parsed;
        }
      }
    } catch {
      /* ignore */
    }
    if (!state) state = this.createDefault();
    this.state = state;
    this.normalizeCapacity();
    this.ensureTrialSlotCount();
    this.consolidateSlots();
    this.ensureStarterPack();
    return this.state;
  }

  normalizeCapacity() {
    const savedCount = Number(this.state.slotCount);
    const maxSlots = this.itemDb.getMaxSlots();
    this.state.slotCount = Math.max(
      20,
      Number.isInteger(savedCount) ? Math.min(savedCount, maxSlots) : 0,
      this.state.slots.length,
    );
    while (this.state.slots.length < this.state.slotCount) this.state.slots.push(null);
  }

  /** 试玩背包至少 60 格，避免物品种类多塞不下 */
  ensureTrialSlotCount() {
    const min = DEFAULT_SLOT_COUNT;
    if (this.state.slotCount >= min) return;
    this.state.slotCount = min;
    while (this.state.slots.length < min) {
      this.state.slots.push(null);
    }
    this.save();
  }

  /** 合并同 ID 多格堆叠，充分利用 9999 上限 */
  consolidateSlots() {
    const totals = new Map();
    for (const s of this.state.slots) {
      if (!s) continue;
      totals.set(s.itemId, (totals.get(s.itemId) ?? 0) + s.count);
    }
    if (totals.size === 0) return;
    for (let i = 0; i < this.state.slots.length; i++) {
      this.state.slots[i] = null;
    }
    for (const [itemId, count] of totals) {
      this.placeInSlots(this.state.slots, itemId, count);
    }
    this.save();
  }

  /** 旧存档或材料用完后，补至试玩最低数量 */
  ensureStarterPack() {
    let changed = false;
    this.consolidateSlots();
    this.autoExpandForGrant(STARTER_ITEMS);
    for (const { itemId, count } of STARTER_ITEMS) {
      const have = this.countItem(itemId);
      if (have < count) {
        const left = this.placeInSlots(this.state.slots, itemId, count - have);
        if (left > 0) {
          this.autoExpandForGrant([{ itemId, count: left }]);
          this.placeInSlots(this.state.slots, itemId, left);
        }
        changed = true;
      }
    }
    if ((this.state.starterPackVersion ?? 0) < STARTER_PACK_VERSION) {
      this.state.starterPackVersion = STARTER_PACK_VERSION;
      changed = true;
    }
    if (changed) this.save();
  }

  /** 手动补发试玩材料(在现有数量上叠加一份完整试玩包) */
  grantStarterMaterials() {
    return this.grantItems(CRAFT_MATERIAL_STARTER, '制作材料');
  }

  /** 仅补发 1~5 级强化粉(叠加，不覆盖其它材料) */
  grantStrengthenPowders() {
    return this.grantItems(STRENGTHEN_POWDER_STARTER, '强化粉');
  }

  grantItems(entries, label) {
    this.consolidateSlots();
    this.autoExpandForGrant(entries);
    const failed = [];
    for (const { itemId, count } of entries) {
      let left = this.placeInSlots(this.state.slots, itemId, count);
      if (left > 0) {
        this.autoExpandForGrant([{ itemId, count: left }]);
        left = this.placeInSlots(this.state.slots, itemId, left);
      }
      if (left > 0) {
        const item = this.itemDb.getById(itemId);
        failed.push({ itemId, name: item?.name ?? itemId, left });
      }
    }
    this.save();
    return { ok: failed.length === 0, failed, label };
  }

  /** 发放前自动扩容(试玩免费，直到能放下或达上限) */
  autoExpandForGrant(entries) {
    const needTypes = new Set(entries.map((e) => e.itemId));
    for (const id of needTypes) {
      if (this.countItem(id) > 0) needTypes.delete(id);
    }
    const needEmpty = needTypes.size;
    const max = this.itemDb.getMaxSlots();
    while (this.getFreeSlots() < needEmpty && this.state.slotCount < max) {
      this.state.slotCount += 1;
      this.state.slots.push(null);
    }
  }

  createDefault() {
    const slotCount = DEFAULT_SLOT_COUNT;
    const slots = Array.from({ length: slotCount }, () => null);
    for (const { itemId, count } of STARTER_ITEMS) {
      this.placeInSlots(slots, itemId, count);
    }
    return { slotCount, slots, starterPackVersion: STARTER_PACK_VERSION };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  reset() {
    this.state = this.createDefault();
    this.save();
  }

  getSlotCount() {
    return this.state.slotCount;
  }

  getSlots() {
    return this.state.slots;
  }

  getUsedCount() {
    return this.state.slots.filter(Boolean).length;
  }

  /** @returns {number} 未能放入的数量 */
  placeInSlots(slots, itemId, count) {
    const item = this.itemDb.getById(itemId);
    if (!item || count <= 0) return count;

    let left = count;
    const maxStack = item.maxStack ?? BAG_MAX_STACK;
    for (let i = 0; i < slots.length && left > 0; i++) {
      const s = slots[i];
      if (s && s.itemId === itemId && s.count < maxStack) {
        const room = maxStack - s.count;
        const add = Math.min(room, left);
        s.count += add;
        left -= add;
      }
    }
    for (let i = 0; i < slots.length && left > 0; i++) {
      if (!slots[i]) {
        const add = Math.min(maxStack, left);
        slots[i] = { itemId, count: add };
        left -= add;
      }
    }
    return left;
  }

  addItem(itemId, count = 1) {
    if (!Number.isInteger(count) || count <= 0) return false;
    const left = this.placeInSlots(this.state.slots, itemId, count);
    this.save();
    return left === 0;
  }

  getFreeSlots() {
    return this.state.slots.filter((s) => !s).length;
  }

  removeAt(index, count = 1) {
    if (!Number.isInteger(index) || !Number.isInteger(count) || count <= 0) return false;
    const slot = this.state.slots[index];
    if (!slot) return false;
    slot.count -= count;
    if (slot.count <= 0) this.state.slots[index] = null;
    this.save();
    return true;
  }

  countItem(itemId) {
    const id = Number(itemId);
    let total = 0;
    for (const s of this.state.slots) {
      if (s?.itemId === id) total += s.count;
    }
    return total;
  }

  consumeAt(index, count = 1) {
    return this.removeAt(index, count);
  }

  consumeItem(itemId, count) {
    if (!Number.isInteger(count) || count <= 0) return false;
    const id = Number(itemId);
    if (this.countItem(id) < count) return false;
    let left = count;
    for (let i = 0; i < this.state.slots.length && left > 0; i++) {
      const s = this.state.slots[i];
      if (!s || s.itemId !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count <= 0) this.state.slots[i] = null;
    }
    this.save();
    return true;
  }

  canExpand() {
    return !!this.itemDb.getExpandCost(this.state.slotCount);
  }

  getExpandInfo() {
    const next = this.itemDb.getExpandCost(this.state.slotCount);
    if (!next) return null;
    return { nextSlots: next.nowBagNum, gemCost: next.cost };
  }

  expand() {
    const info = this.getExpandInfo();
    if (!info) return { ok: false, error: '已达上限' };
    this.state.slotCount = info.nextSlots;
    while (this.state.slots.length < info.nextSlots) {
      this.state.slots.push(null);
    }
    this.save();
    return { ok: true, gemCost: info.gemCost, slotCount: info.nextSlots };
  }

  expandBy(amount = 10) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    const target = Math.min(this.itemDb.getMaxSlots(), this.state.slotCount + add);
    if (target <= this.state.slotCount) return { ok: false, error: '已达上限' };
    this.state.slotCount = target;
    while (this.state.slots.length < target) this.state.slots.push(null);
    this.save();
    return { ok: true, slotCount: target };
  }

  /** 整理：合并堆叠 + 按类型/ID排序，空格子靠后 */
  organize() {
    this.consolidateSlots();
    const filled = this.state.slots.filter(Boolean);
    filled.sort((a, b) => {
      const ia = this.itemDb.getById(a.itemId);
      const ib = this.itemDb.getById(b.itemId);
      const ta = ia?.type ?? 0;
      const tb = ib?.type ?? 0;
      if (ta !== tb) return ta - tb;
      return a.itemId - b.itemId;
    });
    const n = this.state.slotCount;
    this.state.slots = [...filled, ...Array(Math.max(0, n - filled.length)).fill(null)];
    this.save();
    return { ok: true, count: filled.length };
  }
}
